// agent-handoff.mjs
// Baton-passing ledger shared by every worktree of the same git repository.
// The file lives in the git common-dir, not inside the checkout/worktree
// that wrote it - so every worktree of the same repo sees the same ledger.
//
// Usage:
//   node agent-handoff.mjs add "<from>" "<to>" "<status:OK|RISK|UNCERTAIN|BLOCKED>" "<summary>" "<next>" [due_hours]
//   node agent-handoff.mjs list [--open] [--to=<agent>] [--stale]
//   node agent-handoff.mjs triage
//   node agent-handoff.mjs resolve "<id>" "<who resolved it>" [reason]
//   node agent-handoff.mjs supersede "<id>" "<who>" "<reason>"
//   node agent-handoff.mjs cancel "<id>" "<who>" "<reason>"
//   node agent-handoff.mjs location
//
// due_hours (optional, 6th positional argument): hours until the handoff
// becomes "stale" in `list --stale`. Defaults to 72h. Omitting it keeps
// backward compatibility with any caller that only ever passes 5 arguments.
//
// Why this exists: in a multi-agent setup (several AI coding sessions, or
// several humans, working against the same repository at different times),
// one agent finishing a task and leaving something pending for whoever picks
// it up next is easy to lose - a note buried in a doc or a commit message is
// not something the next agent reliably discovers. This is an append-only,
// git-common-dir-scoped ledger every agent can check on start and write to
// on finish, so a handoff survives across worktrees, branches and sessions.

import { existsSync, mkdirSync, readFileSync, appendFileSync } from "node:fs";
import { join, dirname, resolve, isAbsolute } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

const SCRIPT_REPO_ROOT = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const REPO_ROOT = resolve(process.env.AGENT_HANDOFF_REPO_ROOT || SCRIPT_REPO_ROOT);
const VALID_STATUS = ["OK", "RISK", "UNCERTAIN", "BLOCKED"];

function resolveCommonDir() {
  let raw;
  try {
    raw = execFileSync("git", ["rev-parse", "--git-common-dir"], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  } catch (error) {
    throw new Error(`handoff_git_common_dir_unavailable:${error?.message || error}`);
  }
  if (!raw) throw new Error("handoff_git_common_dir_empty");
  return isAbsolute(raw) ? resolve(raw) : resolve(REPO_ROOT, raw);
}

const HANDOFF_FILE = process.env.AGENT_HANDOFF_FILE
  ? resolve(process.env.AGENT_HANDOFF_FILE)
  : join(resolveCommonDir(), "agent-handoffs.jsonl");

function ensureDir() {
  const dir = dirname(HANDOFF_FILE);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
}

function readAll() {
  if (!existsSync(HANDOFF_FILE)) return [];
  const entries = new Map();
  for (const record of readFileSync(HANDOFF_FILE, "utf-8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean)) {
    if (record.event === "handoff_resolved" || record.event === "handoff_closed") {
      const entry = entries.get(record.handoff_id);
      if (entry && !entry.resolved) {
        const lifecycle = record.event === "handoff_resolved" ? "resolved" : record.disposition;
        entries.set(record.handoff_id, {
          ...entry,
          lifecycle,
          resolved: true,
          resolved_at: record.resolved_at || record.closed_at,
          resolved_by: record.resolved_by || record.closed_by,
          close_reason: record.reason || null,
        });
      }
      continue;
    }
    if (record.id) entries.set(record.id, record);
  }
  return [...entries.values()];
}

const DEFAULT_DUE_HOURS = 72;

function cmdAdd(from, to, status, summary, next, dueHoursRaw) {
  if (!from || !to || !status || !summary || !next) {
    console.log('Usage: node agent-handoff.mjs add "<from>" "<to>" "<status>" "<summary>" "<next>" [due_hours]');
    console.log(`status must be one of: ${VALID_STATUS.join(", ")}`);
    process.exit(1);
  }
  if (from.startsWith("-") || to.startsWith("-")) {
    console.log('All arguments are positional, not flags - do not pass "--something" as <from>/<to>.');
    process.exit(1);
  }
  if (!VALID_STATUS.includes(status)) {
    console.log(`invalid status: "${status}". Use one of: ${VALID_STATUS.join(", ")}`);
    process.exit(1);
  }
  let dueHours = DEFAULT_DUE_HOURS;
  if (dueHoursRaw !== undefined) {
    const parsed = Number(dueHoursRaw);
    if (!Number.isFinite(parsed) || parsed <= 0) {
      console.log(`invalid due_hours: "${dueHoursRaw}" - must be a positive number of hours.`);
      process.exit(1);
    }
    dueHours = parsed;
  }
  ensureDir();
  const now = new Date();
  const entry = {
    id: `hnd-${Date.now()}`,
    ts: now.toISOString(),
    from,
    to,
    status,
    summary,
    next,
    due_at: new Date(now.getTime() + dueHours * 3600_000).toISOString(),
    repo_root: REPO_ROOT,
    ledger: HANDOFF_FILE,
    lifecycle: "open",
    resolved: false,
    resolved_at: null,
    resolved_by: null,
    close_reason: null,
  };
  appendFileSync(HANDOFF_FILE, JSON.stringify(entry) + "\n", "utf-8");
  console.log(`Handoff registered: ${entry.id}`);
  console.log(`  ${from} -> ${to} [${status}]: ${summary}`);
  console.log(`  NEXT: ${next}`);
  console.log(`  DUE: ${entry.due_at} (${dueHours}h)`);
  console.log(`  LEDGER: ${HANDOFF_FILE}`);
}

function effectiveDueAt(entry) {
  // Entries written before due_at existed don't have it persisted. This
  // computes a display-only deadline (ts + default) purely for listing/
  // staleness purposes - it never rewrites the original record (the ledger
  // is append-only by design).
  return entry.due_at || new Date(new Date(entry.ts).getTime() + DEFAULT_DUE_HOURS * 3600_000).toISOString();
}

function isStale(entry, now) {
  if (entry.resolved) return false;
  return new Date(effectiveDueAt(entry)).getTime() < now;
}

function cmdList(args) {
  const openOnly = args.includes("--open") || args.includes("--stale");
  const staleOnly = args.includes("--stale");
  const toFilter = args.find((a) => a.startsWith("--to="))?.split("=")[1];
  let entries = readAll();
  if (openOnly) entries = entries.filter((e) => !e.resolved);
  if (toFilter) entries = entries.filter((e) => e.to.toLowerCase() === toFilter.toLowerCase());
  const now = Date.now();
  if (staleOnly) entries = entries.filter((e) => isStale(e, now));
  if (entries.length === 0) {
    console.log("No handoff found matching those filters.");
    return;
  }
  for (const e of entries) {
    const stale = isStale(e, now);
    const terminalTag = e.lifecycle === "superseded" ? "SUPERSEDED" : e.lifecycle === "cancelled" ? "CANCELLED" : "RESOLVED";
    const tag = e.resolved ? terminalTag : stale ? "OPEN (OVERDUE)" : "OPEN";
    console.log(`\n[${e.id}] ${tag} — ${e.ts}`);
    console.log(`  ${e.from} -> ${e.to} [${e.status}]: ${e.summary}`);
    console.log(`  NEXT: ${e.next}`);
    if (!e.resolved) console.log(`  DUE: ${effectiveDueAt(e)}${e.due_at ? "" : " (estimated, entry predates due_at tracking)"}`);
    if (e.resolved) console.log(`  Closed as ${e.lifecycle || "resolved"} by ${e.resolved_by} at ${e.resolved_at}${e.close_reason ? ` — ${e.close_reason}` : ""}`);
  }
  if (staleOnly) console.log(`\nTOTAL_OVERDUE=${entries.length}`);
}

function cmdClose(id, who, disposition = "resolved", reason = "") {
  if (!id || !who || who.startsWith("-") || !["resolved", "superseded", "cancelled"].includes(disposition)) {
    console.log('Usage: resolve|supersede|cancel "<id>" "<who>" [reason]');
    process.exit(1);
  }
  const entries = readAll();
  const entry = entries.find((e) => e.id === id);
  if (!entry) {
    console.log(`Handoff ${id} not found.`);
    process.exit(1);
  }
  if (entry.resolved) {
    console.log(`Handoff ${id} is already closed as ${entry.lifecycle || "resolved"} by ${entry.resolved_by || "unknown author"}.`);
    return;
  }
  ensureDir();
  const now = new Date().toISOString();
  const record = disposition === "resolved"
    ? { event: "handoff_resolved", handoff_id: id, resolved_at: now, resolved_by: who, reason: reason || null }
    : { event: "handoff_closed", handoff_id: id, disposition, closed_at: now, closed_by: who, reason: reason || null };
  appendFileSync(HANDOFF_FILE, JSON.stringify(record) + "\n", "utf-8");
  console.log(`Handoff ${id} closed as ${disposition} by ${who}.`);
}

function cmdResolve(id, who, reason) {
  cmdClose(id, who, "resolved", reason);
}

function classifyGate(entry) {
  const text = `${entry.summary || ""} ${entry.next || ""}`.toLowerCase();
  if (/(deploy|production|publish|dns|vercel|railway|meta|credential|token|auth|webhook|email|campaign|whatsapp|send|business verification)/.test(text)) return "EXTERNAL_GATE";
  if (/(pm2|cloudflared|tunnel|runtime|port|watchdog|process|health)/.test(text)) return "RUNTIME";
  if (/(merge|branch|commit|pr\\s*#|integrate|reconcile)/.test(text)) return "INTEGRATION";
  if (/(test|valid|suite|ci|typecheck|lint)/.test(text)) return "VALIDATION";
  if (/(claim|handoff|wip|governance|policy|audit|scanner|drift)/.test(text)) return "GOVERNANCE";
  return "MANUAL_TRIAGE";
}

function cmdTriage() {
  const openEntries = readAll().filter((entry) => !entry.resolved);
  if (openEntries.length === 0) {
    console.log("No open handoffs to triage.");
    return;
  }
  const groups = new Map();
  for (const entry of openEntries) {
    const key = `${entry.to || "unassigned"}|${classifyGate(entry)}`;
    groups.set(key, (groups.get(key) || 0) + 1);
  }
  console.log(`OPEN_HANDOFFS=${openEntries.length}`);
  for (const [key, count] of [...groups.entries()].sort(([left], [right]) => left.localeCompare(right))) {
    const [owner, gate] = key.split("|");
    console.log(`${owner} | ${gate} = ${count}`);
  }
  console.log("Contract: triage is read-only, it never closes or reassigns handoffs.");
}

const [, , cmd, ...args] = process.argv;
if (cmd === "add") cmdAdd(args[0], args[1], args[2], args[3], args[4], args[5]);
else if (cmd === "list") cmdList(args);
else if (cmd === "triage") cmdTriage();
else if (cmd === "resolve") cmdResolve(args[0], args[1], args[2]);
else if (cmd === "supersede") cmdClose(args[0], args[1], "superseded", args[2]);
else if (cmd === "cancel") cmdClose(args[0], args[1], "cancelled", args[2]);
else if (cmd === "location") console.log(HANDOFF_FILE);
else {
  console.log("Usage: node agent-handoff.mjs [add ...|list [--open] [--to=<agent>] [--stale]|triage|resolve <id> <who> [reason]|supersede <id> <who> <reason>|cancel <id> <who> <reason>|location]");
  process.exit(1);
}
