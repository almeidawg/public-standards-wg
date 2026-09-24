import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { execFileSync, spawn } from 'node:child_process';

const script = path.resolve('scripts/agent-coordination/session-claim.mjs');

function run(args, env, cwd = process.cwd()) {
  return execFileSync(process.execPath, [script, ...args], {
    cwd,
    env,
    encoding: 'utf8',
    windowsHide: true,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}

function runAsync(args, env) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script, ...args], {
      cwd: process.cwd(),
      env,
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('close', (code) => resolve({ code, stdout, stderr }));
  });
}

function makeEnv(dir, sessionId = 'session-test') {
  return {
    ...process.env,
    WG_SESSION_CLAIM_PATH: path.join(dir, 'claim.json'),
    WG_OPERATIONAL_LEASE_DIR: path.join(dir, 'governance'),
    WG_SESSION_ID: sessionId,
    WG_SESSION_CLAIM_SCOPE: 'worktree',
  };
}

test('shared claim supports claim, heartbeat, check and release', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'agent-claim-'));
  const env = makeEnv(dir);
  try {
    const empty = JSON.parse(run(['check', '--json'], env));
    assert.equal(empty.active, false);
    assert.equal(empty.ok, true);
    assert.equal(empty.active_resource_leases, 0);
    assert.equal(empty.concurrency_absent_proven, true);

    run(['claim', 'agent-test', 'isolated-scope'], env);
    const active = JSON.parse(run(['check', '--json'], env));
    assert.equal(active.active, true);
    assert.equal(active.ok, false);
    assert.equal(active.claim.claimed_by, 'agent-test');
    assert.equal(active.claim.session_id, 'session-test');
    assert.equal(active.claim.scope, 'worktree');
    assert.equal(active.concurrency_absent_proven, false);

    const heartbeat = JSON.parse(run(['heartbeat', 'agent-test'], env));
    assert.equal(heartbeat.ok, true);
    assert.equal(heartbeat.claim.session_id, 'session-test');

    run(['release', 'agent-test'], env);
    const released = JSON.parse(run(['check', '--json'], env));
    assert.equal(released.active, false);
    assert.equal(released.ok, true);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an active claim from another agent blocks overwrite', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'agent-claim-conflict-'));
  const envA = makeEnv(dir, 'session-a');
  const envB = makeEnv(dir, 'session-b');
  try {
    run(['claim', 'agent-a', 'scope-a'], envA);
    assert.throws(() => run(['claim', 'agent-b', 'scope-b'], envB), /claim_active:agent-a:session-a/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('same agent name with a different session id does not take over the claim', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'agent-claim-session-conflict-'));
  try {
    run(['claim', 'agent-a', 'scope-a'], makeEnv(dir, 'session-a'));
    assert.throws(() => run(['claim', 'agent-a', 'scope-b'], makeEnv(dir, 'session-b')), /claim_active:agent-a:session-a/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('check reveals active resource leases and never claims concurrency is absent while they exist', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'agent-claim-leases-'));
  const env = makeEnv(dir);
  try {
    mkdirSync(env.WG_OPERATIONAL_LEASE_DIR, { recursive: true });
    const now = Date.now();
    writeFileSync(path.join(env.WG_OPERATIONAL_LEASE_DIR, 'operational-leases.json'), JSON.stringify({
      leases: [{
        id: 'lease-a',
        session_id: 'lease-session-a',
        agent: 'agent-a',
        operation: 'test',
        worktree: '/repo',
        branch: 'main',
        resources: ['file:docs/a.md'],
        status: 'active',
        heartbeat_at: new Date(now).toISOString(),
        expires_at: new Date(now + 60_000).toISOString(),
      }],
    }, null, 2));
    const result = JSON.parse(run(['check', '--json'], env));
    assert.equal(result.active, false);
    assert.equal(result.claim_available, true);
    assert.equal(result.ok, false);
    assert.equal(result.active_resource_leases, 1);
    assert.equal(result.concurrency_absent_proven, false);
    assert.equal(result.resource_leases[0].id, 'lease-a');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('a lease with a stale heartbeat but a future expires_at still shows up in the summary', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'agent-claim-lease-ttl-'));
  const env = makeEnv(dir);
  try {
    mkdirSync(env.WG_OPERATIONAL_LEASE_DIR, { recursive: true });
    const now = Date.now();
    writeFileSync(path.join(env.WG_OPERATIONAL_LEASE_DIR, 'operational-leases.json'), JSON.stringify({
      leases: [{
        id: 'lease-old-heartbeat',
        session_id: 'lease-session',
        agent: 'lease-agent',
        operation: 'ttl-authoritative',
        worktree: '/repo',
        branch: 'main',
        resources: ['file:docs/a.md'],
        status: 'active',
        heartbeat_at: new Date(now - 60 * 60 * 1000).toISOString(),
        expires_at: new Date(now + 60_000).toISOString(),
      }],
    }, null, 2));
    const result = JSON.parse(run(['check', '--json'], env));
    assert.equal(result.active_resource_leases, 1);
    assert.equal(result.resource_leases[0].id, 'lease-old-heartbeat');
    assert.equal(result.concurrency_absent_proven, false);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('atomic creation allows only one winner in a claim race', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'agent-claim-race-'));
  try {
    const [a, b] = await Promise.all([
      runAsync(['claim', 'agent-a', 'scope-a'], makeEnv(dir, 'session-a')),
      runAsync(['claim', 'agent-b', 'scope-b'], makeEnv(dir, 'session-b')),
    ]);
    const winners = [a, b].filter((result) => result.code === 0);
    const losers = [a, b].filter((result) => result.code !== 0);
    assert.equal(winners.length, 1);
    assert.equal(losers.length, 1);
    assert.match(losers[0].stderr, /claim_active:/);
    const active = JSON.parse(run(['check', '--json'], makeEnv(dir, 'observer')));
    assert.equal(active.active, true);
    assert.ok(['agent-a', 'agent-b'].includes(active.claim.claimed_by));
    assert.ok(['session-a', 'session-b'].includes(active.claim.session_id));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('an expired claim can be replaced in a governed way', async () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'agent-claim-stale-'));
  const envA = { ...makeEnv(dir, 'session-a'), WG_SESSION_CLAIM_TTL_MS: '1' };
  const envB = { ...makeEnv(dir, 'session-b'), WG_SESSION_CLAIM_TTL_MS: '60000' };
  try {
    run(['claim', 'agent-a', 'scope-a'], envA);
    await new Promise((resolve) => setTimeout(resolve, 15));
    run(['claim', 'agent-b', 'scope-b'], envB);
    const active = JSON.parse(run(['check', '--json'], envB));
    assert.equal(active.claim.claimed_by, 'agent-b');
    assert.equal(active.claim.session_id, 'session-b');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('heartbeat preserves the acquisition context and records the executor context separately', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'agent-claim-context-'));
  const origin = path.join(dir, 'origin');
  const heartbeatCwd = path.join(dir, 'heartbeat');
  mkdirSync(origin, { recursive: true });
  mkdirSync(heartbeatCwd, { recursive: true });
  const env = makeEnv(dir, 'session-context');
  try {
    run(['claim', 'agent-context', 'context-scope'], env, origin);
    const before = JSON.parse(run(['check', '--json'], env, origin));
    const acquired = path.resolve(origin).replaceAll('\\', '/').toLowerCase();
    assert.equal(String(before.claim.worktree).replaceAll('\\', '/').toLowerCase(), acquired);
    assert.equal(String(before.claim.acquisition_context.worktree).replaceAll('\\', '/').toLowerCase(), acquired);

    const heartbeat = JSON.parse(run(['heartbeat', 'agent-context'], env, heartbeatCwd));
    assert.equal(String(heartbeat.claim.worktree).replaceAll('\\', '/').toLowerCase(), acquired);
    assert.equal(String(heartbeat.claim.acquisition_context.worktree).replaceAll('\\', '/').toLowerCase(), acquired);
    assert.equal(
      String(heartbeat.claim.last_heartbeat_context.worktree).replaceAll('\\', '/').toLowerCase(),
      path.resolve(heartbeatCwd).replaceAll('\\', '/').toLowerCase(),
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('claim captures harness_session_id from CLAUDE_CODE_SESSION_ID when present', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'agent-claim-harness-'));
  const env = { ...makeEnv(dir, 'session-harness'), CLAUDE_CODE_SESSION_ID: 'harness-abc-123' };
  try {
    run(['claim', 'agent-harness', 'harness-scope'], env);
    const active = JSON.parse(run(['check', '--json'], env));
    assert.equal(active.claim.harness_session_id, 'harness-abc-123');
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('claim stores harness_session_id as null when the env var is absent', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'agent-claim-no-harness-'));
  const env = { ...makeEnv(dir, 'session-no-harness') };
  delete env.CLAUDE_CODE_SESSION_ID;
  try {
    run(['claim', 'agent-no-harness', 'scope'], env);
    const active = JSON.parse(run(['check', '--json'], env));
    assert.equal(active.claim.harness_session_id, null);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
