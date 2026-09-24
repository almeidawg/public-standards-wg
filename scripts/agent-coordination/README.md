# Agent coordination

Two zero-dependency Node.js CLI tools for the exact failure mode you get when
more than one AI coding agent (or more than one human) can write to the same
git repository at the same time: two writers touch the same files in the same
window, one overwrites the other's work, and nobody notices until later.

Both tools are plain ESM scripts, no `npm install` required, tested with
Node's built-in test runner (`node --test`).

## `session-claim.mjs` — a shared, TTL-based write lock

A lightweight claim file, stored in the git common-dir (so every worktree of
the same repository sees the same claim), that any agent can check before a
multi-file or destructive change.

```bash
node scripts/agent-coordination/session-claim.mjs check --json
node scripts/agent-coordination/session-claim.mjs claim "my-agent" "refactoring the auth module"
node scripts/agent-coordination/session-claim.mjs heartbeat "my-agent"
node scripts/agent-coordination/session-claim.mjs release "my-agent"
```

- Claims expire on their own (`WG_SESSION_CLAIM_TTL_MS`, default 45 minutes) -
  a crashed agent never leaves a lock stuck forever.
- Claim creation is atomic (`wx` flag) - under a real race between two agents
  claiming at the same instant, exactly one wins.
- `check` also surfaces active *resource leases* (see below) - a free global
  claim does not by itself prove nobody else is touching the repo.
- Same agent name, different session id, does **not** take over an existing
  claim - prevents a second instance of "the same" agent from silently
  stealing another instance's work.

## `agent-handoff.mjs` — an append-only ledger for "here's what's pending"

A claim tells you *whether* it's safe to write right now. It does not tell
you that a previous agent finished a task and left something specific for
whoever comes next to check, approve, or continue. That's what this is for.

```bash
node scripts/agent-coordination/agent-handoff.mjs add "agent-a" "agent-b" "OK" "migration applied" "run the smoke test" 24
node scripts/agent-coordination/agent-handoff.mjs list --open
node scripts/agent-coordination/agent-handoff.mjs triage
node scripts/agent-coordination/agent-handoff.mjs resolve "hnd-123..." "agent-b" "smoke test passed"
```

- Status is one of `OK | RISK | UNCERTAIN | BLOCKED` - forces the reporting
  agent to commit to an honest severity instead of leaving it implicit.
- Append-only: resolving/superseding/cancelling a handoff never rewrites or
  deletes the original entry, it appends a closing event next to it.
- `--stale` lists handoffs past their due date (default 72h) - without this,
  the only way to notice a growing backlog of unresolved handoffs is to read
  the entire list by hand.
- `triage` is read-only by contract: it buckets open handoffs by a rough
  category (deploy/production, runtime, integration, validation, governance,
  manual) so a human can scan volume at a glance, and never closes or
  reassigns anything on its own.

## Design notes

- Both files depend on nothing but Node's built-in modules
  (`node:fs`, `node:path`, `node:child_process`, `node:crypto`, `node:url`).
  Drop them into any repository and they work.
- Both resolve their storage location relative to the actual git repository
  (`git rev-parse --git-common-dir`), never a hardcoded path - so the same
  script works correctly from the main checkout or from any `git worktree`.
- Neither tool ever force-overwrites another agent's active claim/lease -
  the only way past an active one is `--force` on `release`, which is an
  explicit, visible admission that you are overriding someone else's lock.
