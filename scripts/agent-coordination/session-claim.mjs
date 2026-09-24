#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync, unlinkSync, mkdirSync, rmSync } from 'node:fs';
import os from 'node:os';
import path, { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';

const SCRIPT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const STALE_AFTER_MS = Number(process.env.WG_SESSION_CLAIM_TTL_MS ?? 45 * 60 * 1000);
const CLAIM_SCHEMA_VERSION = '2026-07-29.2';

function git(args, cwd = process.cwd()) {
  try {
    return execFileSync('git', args, { cwd, encoding: 'utf8', windowsHide: true, stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
}

function resolveCommonDir() {
  const raw = git(['rev-parse', '--git-common-dir'], process.cwd()) || git(['rev-parse', '--git-common-dir'], SCRIPT_ROOT);
  if (!raw) return join(SCRIPT_ROOT, '.git');
  const cwd = git(['rev-parse', '--show-toplevel'], process.cwd()) ? process.cwd() : SCRIPT_ROOT;
  return path.resolve(cwd, raw);
}

const COMMON_DIR = resolveCommonDir();
const CANONICAL_REPO = path.basename(COMMON_DIR).toLowerCase() === '.git' ? path.dirname(COMMON_DIR) : SCRIPT_ROOT;
const CLAIM_FILE = process.env.WG_SESSION_CLAIM_PATH || join(COMMON_DIR, 'wg-session-claim.json');
const LEGACY_CLAIM_FILE = join(CANONICAL_REPO, '.session-claim.json');
const LEASE_DIR = process.env.WG_OPERATIONAL_LEASE_DIR || join(CANONICAL_REPO, 'data', 'governance');
const LEASE_FILE = join(LEASE_DIR, 'operational-leases.json');
const CLAIM_LOCK_DIR = `${CLAIM_FILE}.lock`;

function safeRead(file) {
  if (!existsSync(file)) return null;
  try {
    return JSON.parse(readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function readClaim() {
  const shared = safeRead(CLAIM_FILE);
  if (shared) return { ...shared, storage: CLAIM_FILE };
  const legacy = safeRead(LEGACY_CLAIM_FILE);
  if (legacy) return { ...legacy, storage: LEGACY_CLAIM_FILE, legacy: true };
  return null;
}

function isStale(record, now = Date.now()) {
  const heartbeat = Date.parse(record.heartbeat_at || record.updated_at || record.started_at || '');
  const expiry = Date.parse(record.expires_at || '');
  if (Number.isFinite(expiry) && now > expiry) return true;
  return !Number.isFinite(heartbeat) || now - heartbeat > STALE_AFTER_MS;
}

function leaseExpired(record, now = Date.now()) {
  const expiry = Date.parse(record.expires_at || '');
  return !Number.isFinite(expiry) || now > expiry;
}

function activeResourceLeases() {
  const store = safeRead(LEASE_FILE) || { leases: [] };
  return (store.leases || [])
    .filter((lease) => lease.status === 'active' && !leaseExpired(lease))
    .map((lease) => ({
      id: lease.id,
      session_id: lease.session_id,
      agent: lease.agent,
      operation: lease.operation,
      worktree: lease.worktree,
      branch: lease.branch,
      resources: lease.resources || [],
      expires_at: lease.expires_at,
    }));
}

function currentSessionId(who) {
  return String(process.env.WG_SESSION_ID || who || '').trim();
}

function currentScope() {
  return process.env.WG_SESSION_CLAIM_SCOPE === 'repo' ? 'repo' : 'worktree';
}

function currentContext() {
  const worktree = git(['rev-parse', '--show-toplevel']) || process.cwd();
  return {
    canonical_repo: CANONICAL_REPO,
    common_dir: COMMON_DIR,
    worktree,
    branch: git(['branch', '--show-current']) || 'detached',
    head: git(['rev-parse', 'HEAD']) || 'unknown',
    writer_pid: process.pid,
    writer_host: os.hostname(),
  };
}

function withClaimLock(operation) {
  mkdirSync(dirname(CLAIM_LOCK_DIR), { recursive: true });
  const deadline = Date.now() + 3000;
  while (true) {
    try {
      mkdirSync(CLAIM_LOCK_DIR);
      break;
    } catch (error) {
      if (!error || typeof error !== 'object' || error.code !== 'EEXIST') throw error;
      if (Date.now() >= deadline) throw new Error('claim_lock_timeout');
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 25);
    }
  }
  try {
    return operation();
  } finally {
    rmSync(CLAIM_LOCK_DIR, { recursive: true, force: true });
  }
}

function persist(claim, atomicCreate = false) {
  mkdirSync(dirname(CLAIM_FILE), { recursive: true });
  writeFileSync(CLAIM_FILE, `${JSON.stringify(claim, null, 2)}\n`, { encoding: 'utf8', flag: atomicCreate ? 'wx' : 'w' });
  if (LEGACY_CLAIM_FILE !== CLAIM_FILE && existsSync(LEGACY_CLAIM_FILE)) unlinkSync(LEGACY_CLAIM_FILE);
}

function removeKnownClaimStorage() {
  if (existsSync(CLAIM_FILE)) unlinkSync(CLAIM_FILE);
  if (LEGACY_CLAIM_FILE !== CLAIM_FILE && existsSync(LEGACY_CLAIM_FILE)) unlinkSync(LEGACY_CLAIM_FILE);
}

function cmdCheck(jsonMode = false) {
  const claim = readClaim();
  const resourceLeases = activeResourceLeases();
  const base = {
    claim_file: CLAIM_FILE,
    active_resource_leases: resourceLeases.length,
    resource_leases: resourceLeases,
  };
  if (!claim) {
    const result = {
      ...base,
      ok: resourceLeases.length === 0,
      active: false,
      claim_available: true,
      concurrency_absent_proven: resourceLeases.length === 0,
    };
    if (jsonMode) console.log(JSON.stringify(result, null, 2));
    else if (resourceLeases.length > 0) {
      console.log(`Global claim is free, but ${resourceLeases.length} resource lease(s) are active. Absence of concurrency is not proven.`);
    } else {
      console.log('Free: no global claim or shared resource lease active.');
    }
    return;
  }
  const stale = isStale(claim);
  const result = {
    ...base,
    ok: stale && resourceLeases.length === 0,
    active: !stale,
    stale,
    claim_available: stale,
    claim,
    concurrency_absent_proven: stale && resourceLeases.length === 0,
  };
  if (jsonMode) console.log(JSON.stringify(result, null, 2));
  else {
    console.log(JSON.stringify(result, null, 2));
    console.log(stale
      ? '\nSTALE: the claim can be replaced, but active leases still need to be respected.'
      : '\nACTIVE: use an isolated worktree/lease, or release the claim before writing in the same scope.');
  }
}

function cmdClaim(who, note) {
  if (!who || who.startsWith('-')) throw new Error('claim requires <who> and a scope note');
  return withClaimLock(() => {
    const sessionId = currentSessionId(who);
    const existing = readClaim();
    const existingStale = Boolean(existing && isStale(existing));
    const sameOwner = existing?.claimed_by === who;
    const sameSession = existing?.session_id ? existing.session_id === sessionId : sameOwner;
    if (existing && !existingStale && (!sameOwner || !sameSession)) {
      throw new Error(`claim_active:${existing.claimed_by}:${existing.session_id || 'legacy-session'}:${existing.note || ''}`);
    }

    const now = new Date();
    const executionContext = currentContext();
    const continuing = Boolean(existing && !existingStale && sameOwner && sameSession);
    const acquisitionContext = continuing
      ? (existing.acquisition_context || {
          canonical_repo: existing.canonical_repo,
          common_dir: existing.common_dir,
          worktree: existing.worktree,
          branch: existing.branch,
          head: existing.head,
          writer_pid: existing.writer_pid,
          writer_host: existing.writer_host,
        })
      : executionContext;
    const claim = {
      schema_version: CLAIM_SCHEMA_VERSION,
      claimed_by: who,
      session_id: sessionId,
      harness_session_id: process.env.CLAUDE_CODE_SESSION_ID || null,
      scope: currentScope(),
      note: note ?? '',
      started_at: continuing ? existing.started_at : now.toISOString(),
      updated_at: now.toISOString(),
      heartbeat_at: now.toISOString(),
      expires_at: new Date(now.getTime() + STALE_AFTER_MS).toISOString(),
      ...acquisitionContext,
      acquisition_context: acquisitionContext,
      last_command_context: executionContext,
    };

    if (existingStale) removeKnownClaimStorage();
    persist(claim, !continuing);
    console.log(`Shared claim registered: ${who} [${sessionId}] — ${note ?? '(no note)'}`);
  });
}

function cmdHeartbeat(who) {
  return withClaimLock(() => {
    const existing = readClaim();
    if (!existing || isStale(existing)) throw new Error('claim_active_not_found');
    const sessionId = currentSessionId(who || existing.claimed_by);
    if (who && existing.claimed_by !== who) throw new Error(`claim_owned_by:${existing.claimed_by}`);
    if (existing.session_id && existing.session_id !== sessionId) throw new Error(`claim_session_owned_by:${existing.session_id}`);
    const now = new Date();
    const executionContext = currentContext();
    const acquisitionContext = existing.acquisition_context || {
      canonical_repo: existing.canonical_repo,
      common_dir: existing.common_dir,
      worktree: existing.worktree,
      branch: existing.branch,
      head: existing.head,
      writer_pid: existing.writer_pid,
      writer_host: existing.writer_host,
    };
    const claim = {
      ...existing,
      storage: undefined,
      legacy: undefined,
      schema_version: CLAIM_SCHEMA_VERSION,
      session_id: sessionId,
      updated_at: now.toISOString(),
      heartbeat_at: now.toISOString(),
      expires_at: new Date(now.getTime() + STALE_AFTER_MS).toISOString(),
      ...acquisitionContext,
      acquisition_context: acquisitionContext,
      last_heartbeat_context: executionContext,
    };
    delete claim.storage;
    delete claim.legacy;
    persist(claim);
    console.log(JSON.stringify({ ok: true, claim }, null, 2));
  });
}

function cmdRelease(who, force = false) {
  return withClaimLock(() => {
    const existing = readClaim();
    if (!existing) {
      console.log('No claim to release.');
      return;
    }
    const sessionId = currentSessionId(who || existing.claimed_by);
    if (!force && who && existing.claimed_by !== who) throw new Error(`claim_owned_by:${existing.claimed_by}`);
    if (!force && existing.session_id && existing.session_id !== sessionId) throw new Error(`claim_session_owned_by:${existing.session_id}`);
    removeKnownClaimStorage();
    console.log(`Claim released: ${existing.claimed_by} [${existing.session_id || 'legacy-session'}].`);
  });
}

const [, , cmd, ...args] = process.argv;
try {
  if (cmd === 'check') cmdCheck(args.includes('--json'));
  else if (cmd === 'claim') cmdClaim(args[0], args.slice(1).join(' '));
  else if (cmd === 'heartbeat') cmdHeartbeat(args[0]);
  else if (cmd === 'release') cmdRelease(args.find((item) => !item.startsWith('-')), args.includes('--force'));
  else {
    console.log('Usage: node session-claim.mjs [check --json|claim <who> <note>|heartbeat <who>|release <who> [--force]]');
    process.exitCode = 1;
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
