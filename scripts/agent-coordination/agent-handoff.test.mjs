import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import test from "node:test";

const script = path.resolve("scripts/agent-coordination/agent-handoff.mjs");

function run(command, args, cwd, env = {}) {
  const result = spawnSync(command, args, {
    cwd,
    env: { ...process.env, ...env },
    encoding: "utf8",
    windowsHide: true,
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout;
}

test("a handoff is shared across worktrees of the same git common-dir", () => {
  const base = mkdtempSync(path.join(tmpdir(), "agent-handoff-shared-"));
  const repo = path.join(base, "repo");
  const worktree = path.join(base, "worktree");
  try {
    mkdirSync(repo, { recursive: true });
    writeFileSync(path.join(repo, "README.md"), "# test\n");
    run("git", ["init"], repo);
    run("git", ["config", "user.email", "test@example.invalid"], repo);
    run("git", ["config", "user.name", "Test"], repo);
    run("git", ["add", "README.md"], repo);
    run("git", ["commit", "-m", "init"], repo);
    run("git", ["worktree", "add", "-b", "handoff-test", worktree], repo);

    const envRepo = { AGENT_HANDOFF_REPO_ROOT: repo };
    const envWorktree = { AGENT_HANDOFF_REPO_ROOT: worktree };
    const added = run("node", [script, "add", "agent-a", "agent-b", "OK", "package ready", "validate the package"], repo, envRepo);
    const id = added.match(/Handoff registered: (hnd-\d+)/)?.[1];
    assert.ok(id);

    const locationMain = run("node", [script, "location"], repo, envRepo).trim();
    const locationWorktree = run("node", [script, "location"], worktree, envWorktree).trim();
    assert.match(locationMain.replaceAll("\\", "/"), /\/repo\/\.git\/agent-handoffs\.jsonl$/i);
    assert.match(locationWorktree.replaceAll("\\", "/"), /\/repo\/\.git\/agent-handoffs\.jsonl$/i);
    assert.equal(existsSync(locationMain), true);
    assert.equal(existsSync(locationWorktree), true);

    const listedFromWorktree = run("node", [script, "list", "--open", "--to=agent-b"], worktree, envWorktree);
    assert.match(listedFromWorktree, new RegExp(id));
    assert.match(listedFromWorktree, /package ready/);

    const beforeResolve = readFileSync(locationMain, "utf8");
    run("node", [script, "resolve", id, "agent-b"], worktree, envWorktree);
    const afterResolve = readFileSync(locationMain, "utf8");
    assert.equal(afterResolve.startsWith(beforeResolve), true, "resolving must preserve the existing history");
    assert.match(afterResolve.slice(beforeResolve.length), /"event":"handoff_resolved"/);
    const listedFromMain = run("node", [script, "list"], repo, envRepo);
    assert.match(listedFromMain, new RegExp(`\\[${id}\\] RESOLVED`));
    const listedOpen = run("node", [script, "list", "--open"], repo, envRepo);
    assert.doesNotMatch(listedOpen, new RegExp(`\\[${id}\\]`));
    const triage = run("node", [script, "triage"], repo, envRepo);
    assert.match(triage, /No open handoffs to triage/);
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});

test("handoff lifecycle supports superseded and cancelled as append-only terminal states", () => {
  const base = mkdtempSync(path.join(tmpdir(), "agent-handoff-lifecycle-"));
  const repo = path.join(base, "repo");
  try {
    mkdirSync(repo, { recursive: true });
    writeFileSync(path.join(repo, "README.md"), "# test\n");
    run("git", ["init"], repo);
    run("git", ["config", "user.email", "test@example.invalid"], repo);
    run("git", ["config", "user.name", "Test"], repo);
    run("git", ["add", "README.md"], repo);
    run("git", ["commit", "-m", "init"], repo);
    const env = { AGENT_HANDOFF_REPO_ROOT: repo };

    const first = run("node", [script, "add", "agent-a", "agent-b", "OK", "old package", "use the new package"], repo, env);
    const firstId = first.match(/Handoff registered: (hnd-\d+)/)?.[1];
    assert.ok(firstId);
    run("node", [script, "supersede", firstId, "agent-b", "a newer handoff replaced this package"], repo, env);
    let listed = run("node", [script, "list"], repo, env);
    assert.match(listed, new RegExp(`\\[${firstId}\\] SUPERSEDED`));
    assert.match(listed, /a newer handoff replaced this package/);

    const second = run("node", [script, "add", "agent-a", "agent-b", "UNCERTAIN", "obsolete request", "do not execute"], repo, env);
    const secondId = second.match(/Handoff registered: (hnd-\d+)/)?.[1];
    assert.ok(secondId);
    run("node", [script, "cancel", secondId, "agent-b", "scope cancelled by the owner"], repo, env);
    listed = run("node", [script, "list"], repo, env);
    assert.match(listed, new RegExp(`\\[${secondId}\\] CANCELLED`));

    const open = run("node", [script, "list", "--open"], repo, env);
    assert.doesNotMatch(open, new RegExp(firstId));
    assert.doesNotMatch(open, new RegExp(secondId));
  } finally {
    rmSync(base, { recursive: true, force: true });
  }
});
