#!/usr/bin/env node
// schema-usage-guard.mjs
//
// Extracts every real Supabase call (.from().select()/.insert(), .rpc(),
// .functions.invoke()) from your source code (read via `git show <ref>:<path>`,
// never from a local checkout that might be stale) and cross-checks it against
// the REAL schema via the Supabase Management API (SQL query against
// information_schema, and GET /functions for Edge Functions) - never against
// PostgREST's OpenAPI schema, and never by test-calling an RPC with empty args
// (both have documented false-negative modes: OpenAPI omits some objects, and
// an RPC that requires parameters returns "without parameters" even when it
// genuinely exists).
//
// Detects the class of bug that fails 100% silently: a frontend reads a
// column, RPC or Edge Function that used to exist (or was renamed on the
// database side without a corresponding code change) and gets back `null`/an
// empty array instead of an error - the UI just looks "empty", nobody notices
// until a human happens to test that exact screen.
//
// This tool only DETECTS and REPORTS - it never mutates anything, and it never
// prints a credential (tokens are read from `process.env` by name, or from an
// optional external vault script you configure - either way this file never
// sees or logs the value directly).
//
// Usage:
//   SCHEMA_GUARD_CONFIG=./schema-guard.config.json node schema-usage-guard.mjs
//   node schema-usage-guard.mjs --config ./schema-guard.config.json
//
// Config file shape: see schema-guard.config.example.json in this folder.
// Each project entry needs: a git repo path, the ref to audit (e.g.
// "origin/main"), which subpaths to scan, the Supabase project ref, and the
// name of an environment variable that holds a Management API token with
// read access to that project.
//
// Origin note: this was rebuilt from scratch after an internal audit found
// that an earlier version of this exact tool was referenced by governance
// docs as "already built and validated" - a project-wide search (disk + full
// git history across every branch) proved it had never actually been
// committed anywhere. The lesson generalizes: a claim that a safeguard
// exists is not the same as the safeguard existing - verify against the
// live repository, not against what a document says.

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const OUT_DIR = process.env.SCHEMA_GUARD_OUT_DIR || path.join(process.cwd(), ".schema-guard");
const OUT_JSON = path.join(OUT_DIR, "schema-usage-guard-report.json");
const OUT_MD = path.join(OUT_DIR, "schema-usage-guard-report.md");
const USER_AGENT = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) schema-usage-guard/1.0";
// Some cloud APIs (Supabase's Management API included) return a generic 403
// for requests without a browser-like User-Agent header, which looks
// identical to an invalid/expired token unless you inspect the response body.
// Always send one, and always read the body before concluding a credential
// is dead.

// --- Pure extraction (never touches network/disk outside the text it's given) ---

const SELECT_RE = /\.from\(\s*['"`]([a-zA-Z_][a-zA-Z0-9_]*)['"`]\s*\)\s*\.select\(\s*['"`]([^'"`]*)['"`]/g;
const FROM_RE = /\.from\(\s*['"`]([a-zA-Z_][a-zA-Z0-9_]*)['"`]\s*\)/g;
const RPC_RE = /\.rpc\(\s*['"`]([a-zA-Z_][a-zA-Z0-9_]*)['"`]/g;
const EDGE_FN_RE = /\.functions\.invoke\(\s*['"`]([a-zA-Z_][a-zA-Z0-9_-]*)['"`]/g;

// PostgREST allows embedded relational selects (e.g. `people!inner(name, email)`),
// whose own commas live inside nested parentheses. A naive split on comma breaks
// those into garbage pseudo-columns (e.g. "email)"). This splitter respects
// parenthesis depth; segments that contain "(" are nested relations, not plain
// columns, and are dropped (not validated in this v1 - YAGNI).
function splitTopLevelColumns(raw) {
	const parts = [];
	let depth = 0;
	let current = "";
	for (const ch of raw) {
		if (ch === "(") depth++;
		if (ch === ")") depth = Math.max(0, depth - 1);
		if (ch === "," && depth === 0) {
			parts.push(current);
			current = "";
		} else {
			current += ch;
		}
	}
	if (current.trim()) parts.push(current);
	return parts;
}

// supabase.storage.from('bucket') references a Storage bucket, not a Postgres
// table - syntactically identical to supabase.from('table') under a simple
// regex, but semantically something else entirely. Real case found in
// production: several storage bucket references were reported as "missing
// table" with no corresponding schema bug at all. The chain sometimes wraps
// across a line break between ".storage" and ".from(" (real formatter output),
// so this walks back past whitespace/newlines before checking the preceding
// token, instead of a fixed character window that breaks on indented code.
function precededByStorage(sourceText, matchIndex) {
	let i = matchIndex;
	while (i > 0 && /\s/.test(sourceText[i - 1])) i--;
	return sourceText.slice(Math.max(0, i - 7), i) === "storage";
}

function normalizeColumnToken(token) {
	const trimmed = token.trim();
	if (!trimmed || trimmed === "*" || trimmed.includes("(")) return null;
	// alias:column -> the real column is the one after the colon
	const afterAlias = trimmed.includes(":") ? trimmed.split(":").pop().trim() : trimmed;
	const identifier = afterAlias.match(/^[a-zA-Z_][a-zA-Z0-9_]*/);
	return identifier ? identifier[0] : null;
}

export function extractSupabaseCalls(sourceText, file) {
	const calls = [];
	const selectTables = new Set();

	for (const m of sourceText.matchAll(SELECT_RE)) {
		if (precededByStorage(sourceText, m.index)) continue;
		const [, table, columnsRaw] = m;
		selectTables.add(table);
		const columns = splitTopLevelColumns(columnsRaw).map(normalizeColumnToken).filter(Boolean);
		calls.push({ kind: "select", table, columns, file });
	}

	for (const m of sourceText.matchAll(FROM_RE)) {
		if (precededByStorage(sourceText, m.index)) continue;
		const table = m[1];
		if (selectTables.has(table)) continue; // already covered by a .select() above
		calls.push({ kind: "from", table, file });
		selectTables.add(table); // one finding per table per file, avoids duplicate noise
	}

	for (const m of sourceText.matchAll(RPC_RE)) {
		calls.push({ kind: "rpc", name: m[1], file });
	}

	for (const m of sourceText.matchAll(EDGE_FN_RE)) {
		calls.push({ kind: "edge_function", name: m[1], file });
	}

	return calls;
}

// --- Pure cross-check against an already-resolved schema --------------------

export function crossCheck(calls, schema) {
	const findings = [];
	for (const call of calls) {
		if (call.kind === "select" || call.kind === "from") {
			const columns = schema.tables.get(call.table);
			if (!columns) {
				findings.push({ kind: call.kind, target: call.table, file: call.file, ok: false, reason: "table_missing" });
				continue;
			}
			if (call.kind === "select") {
				for (const col of call.columns) {
					if (!columns.has(col)) {
						findings.push({ kind: call.kind, target: call.table, file: call.file, ok: false, reason: `column_missing:${col}` });
					}
				}
			}
		} else if (call.kind === "rpc") {
			if (!schema.rpcs.has(call.name)) {
				findings.push({ kind: call.kind, target: call.name, file: call.file, ok: false, reason: "rpc_missing" });
			}
		} else if (call.kind === "edge_function") {
			if (!schema.edgeFunctions.has(call.name)) {
				findings.push({ kind: call.kind, target: call.name, file: call.file, ok: false, reason: "edge_function_missing" });
			}
		}
	}
	return findings;
}

// --- Pure reporting -----------------------------------------------------------

function sqlEntrySupportsFinding(finding, text) {
	const normalized = String(text || "").toLowerCase();
	const target = String(finding.target || "").toLowerCase().replace(/[^a-z0-9_]/g, "");
	if (!target) return false;
	const qualifiedTarget = `(?:public\\.)?\"?${target}\"?`;
	const createTable = new RegExp(`\\bcreate\\s+table(?:\\s+if\\s+not\\s+exists)?\\s+${qualifiedTarget}\\b`, "i");
	if (finding.reason === "table_missing") return createTable.test(normalized);
	if (finding.reason?.startsWith("column_missing:")) {
		const column = String(finding.reason.split(":", 2)[1] || "").toLowerCase().replace(/[^a-z0-9_]/g, "");
		if (!column) return false;
		const createTableWithColumn = new RegExp(`\\bcreate\\s+table(?:\\s+if\\s+not\\s+exists)?\\s+${qualifiedTarget}\\b[\\s\\S]{0,12000}?\\b${column}\\b[\\s\\S]{0,12000}?\\);`, "i");
		const alterColumn = new RegExp(`\\balter\\s+table(?:\\s+if\\s+exists)?\\s+${qualifiedTarget}\\s+(?:add\\s+(?:column\\s+)?(?:if\\s+not\\s+exists\\s+)?|alter\\s+column\\s+|rename\\s+column\\s+)\"?${column}\"?\\b`, "i");
		return createTableWithColumn.test(normalized) || alterColumn.test(normalized);
	}
	if (finding.reason === "rpc_missing") {
		return new RegExp(`\\bcreate\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\.)?\"?${target}\"?\\b`, "i").test(normalized);
	}
	return false;
}

export function classifySchemaContractEvidence(findings, { sqlEntries = [], repoPaths = [] } = {}) {
	const entries = Array.isArray(sqlEntries)
		? sqlEntries.map((entry) => ({ path: String(entry.path || "").replace(/\\/g, "/"), text: String(entry.text || "") }))
		: [];
	const paths = Array.isArray(repoPaths) ? repoPaths.map((value) => String(value).replace(/\\/g, "/").toLowerCase()) : [];
	return findings.map((finding) => {
		const target = String(finding.target || "").toLowerCase();
		let contractEvidence = "source_only";
		if (finding.kind === "edge_function") {
			contractEvidence = paths.some((value) => value.includes(`/functions/${target}/`) || value.endsWith(`/functions/${target}`))
				? "edge_function_source_present"
				: "source_only";
		} else {
			contractEvidence = entries.some((entry) => sqlEntrySupportsFinding(finding, entry.text)) ? "sql_contract_present" : "source_only";
		}
		return { ...finding, contract_evidence: contractEvidence };
	});
}

export function classifySourceReachability(findings) {
	return findings.map((finding) => {
		const file = String(finding.file || "").replace(/\\/g, "/").toLowerCase();
		let sourceReachability = "runtime_candidate";
		if (/(^|\/)_[a-z0-9-]*audits?\//i.test(file)) sourceReachability = "audit_artifact";
		else if (/(^|\/)migrate[^/]*\.(?:ts|tsx|js|jsx|mjs|cjs)$/i.test(file)) sourceReachability = "migration_script";
		else if (/(^|\/)diagnostico[^/]*\.(?:ts|tsx|js|jsx|mjs|cjs)$/i.test(file)) sourceReachability = "diagnostic_script";
		return { ...finding, source_reachability: sourceReachability };
	});
}

export function classifyMigrationContractStatus(findings, { sqlEntries = [], appliedMigrationVersions = null } = {}) {
	const normalizedEntries = Array.isArray(sqlEntries)
		? sqlEntries.map((entry) => ({ path: String(entry.path || "").replace(/\\/g, "/"), text: String(entry.text || "").toLowerCase() }))
		: [];
	return findings.map((finding) => {
		if (finding.contract_evidence !== "sql_contract_present") return finding;
		const target = String(finding.target || "").toLowerCase();
		const column = finding.reason?.startsWith("column_missing:") ? String(finding.reason.split(":", 2)[1] || "").toLowerCase() : null;
		const targetPattern = target.replace(/[^a-z0-9_]/g, "");
		const tableDdl = new RegExp(`\\b(?:create|alter)\\s+table(?:\\s+if\\s+not\\s+exists)?\\s+(?:public\\.)?\"?${targetPattern}\"?\\b`, "i");
		const functionDdl = new RegExp(`\\bcreate\\s+(?:or\\s+replace\\s+)?function\\s+(?:public\\.)?\"?${targetPattern}\"?\\b`, "i");
		const migrations = normalizedEntries.filter((entry) => {
			if (!/(^|\/)migrations\/.*\.sql$/i.test(entry.path)) return false;
			if (finding.reason === "table_missing") return tableDdl.test(entry.text);
			if (finding.reason?.startsWith("column_missing:")) {
				const columnPattern = new RegExp(`\\b${String(column || "").replace(/[^a-z0-9_]/g, "")}\\b`, "i");
				return tableDdl.test(entry.text) && columnPattern.test(entry.text);
			}
			if (finding.reason === "rpc_missing") return functionDdl.test(entry.text);
			return false;
		});
		if (!migrations.length) return finding;
		const versions = migrations.map((entry) => entry.path.split("/").pop()?.match(/^(\d{8,14})_/)?.[1]).filter(Boolean);
		let contractEvidence = "migration_contract_unknown";
		if (appliedMigrationVersions instanceof Set) {
			contractEvidence = versions.some((version) => appliedMigrationVersions.has(version)) ? "migration_contract_applied" : "migration_contract_pending";
		}
		return { ...finding, contract_evidence: contractEvidence, migration_versions: versions };
	});
}

export function buildReport({ generatedAt, projects }) {
	const alerts = [];
	let totalDrift = 0;
	let contractPresentDrift = 0;
	let sourceOnlyDrift = 0;
	let runtimeCandidateDrift = 0;
	let nonRuntimeDrift = 0;
	const contractEvidenceCounts = {};
	const sourceReachabilityCounts = {};

	for (const p of projects) {
		if (!p.schemaOk) {
			alerts.push(`schema_probe_failed_${p.project}`);
			continue;
		}
		// Zero findings with a healthy schema probe can mean "no drift" OR "the
		// parser doesn't recognize this project's calling convention" (real case:
		// one project used raw fetch() against PostgREST instead of the SDK's
		// .from()/.rpc() pattern) - never let that read as "clean" silently,
		// always distinguish the two.
		if (p.calls_checked === 0) {
			alerts.push(`schema_guard_low_coverage_${p.project}`);
		}
		for (const f of p.findings) {
			totalDrift += 1;
			const evidenceKey = f.contract_evidence || "unclassified";
			contractEvidenceCounts[evidenceKey] = (contractEvidenceCounts[evidenceKey] || 0) + 1;
			const reachabilityKey = f.source_reachability || "runtime_candidate";
			sourceReachabilityCounts[reachabilityKey] = (sourceReachabilityCounts[reachabilityKey] || 0) + 1;
			if (reachabilityKey === "runtime_candidate") runtimeCandidateDrift += 1;
			else nonRuntimeDrift += 1;
			if (["sql_contract_present", "edge_function_source_present", "migration_contract_applied", "migration_contract_pending", "migration_contract_unknown"].includes(f.contract_evidence)) contractPresentDrift += 1;
			else sourceOnlyDrift += 1;
			alerts.push(`schema_drift_${p.project}_${f.target}_${f.reason}`);
		}
	}

	const summary = {
		generated_at: generatedAt,
		projects_checked: projects.length,
		total_drift_findings: totalDrift,
		drift_with_versioned_contract: contractPresentDrift,
		drift_source_only: sourceOnlyDrift,
		contract_evidence_counts: contractEvidenceCounts,
		runtime_candidate_drift: runtimeCandidateDrift,
		nonruntime_drift: nonRuntimeDrift,
		source_reachability_counts: sourceReachabilityCounts,
	};

	return { summary, alerts, projects };
}

// --- Real I/O (git show + Management API) -----------------------------------

function git(args, cwd) {
	try {
		return { ok: true, stdout: execFileSync("git", args, { cwd, encoding: "utf8", windowsHide: true, timeout: 30000, stdio: ["ignore", "pipe", "pipe"] }) };
	} catch (error) {
		return { ok: false, stdout: "", stderr: String(error.stderr || error.message || "") };
	}
}

function listAllFilesAtRef(repoCwd, ref) {
	const r = git(["ls-tree", "-r", "--name-only", ref], repoCwd);
	if (!r.ok) return [];
	return r.stdout.split(/\r?\n/).filter(Boolean);
}

function listFilesAtRef(repoCwd, ref, subpath) {
	const r = git(["ls-tree", "-r", "--name-only", ref, "--", subpath], repoCwd);
	if (!r.ok) return [];
	return r.stdout
		.split(/\r?\n/)
		.filter(Boolean)
		.filter((f) => /\.(ts|tsx|js|jsx|mjs|cjs)$/i.test(f))
		.filter((f) => !/\.(test|spec)\./i.test(f));
}

function readFileAtRef(repoCwd, ref, file) {
	const r = git(["show", `${ref}:${file}`], repoCwd);
	return r.ok ? r.stdout : "";
}

// Reads a token by name. Checks a plain environment variable first (works
// anywhere, no setup required); optionally falls back to an external vault
// script if you point SCHEMA_GUARD_VAULT_SCRIPT at one that accepts
// `read <KEY>` on argv and prints the value to stdout. Either way, the value
// is only ever held in memory long enough to build an Authorization header -
// never logged, never written to disk.
function readVaultKey(key) {
	const fromEnv = process.env[key];
	if (fromEnv) return fromEnv;

	const vaultScript = process.env.SCHEMA_GUARD_VAULT_SCRIPT;
	if (!vaultScript || !existsSync(vaultScript)) return null;
	try {
		const value = execFileSync("powershell.exe", ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", vaultScript, "read", key], {
			encoding: "utf8",
			windowsHide: true,
			timeout: 20000,
			stdio: ["ignore", "pipe", "pipe"],
		}).trim();
		return value || null;
	} catch {
		return null;
	}
}

async function managementQuery(projectRef, token, sql) {
	const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
		method: "POST",
		headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", "User-Agent": USER_AGENT },
		body: JSON.stringify({ query: sql }),
	});
	if (!res.ok) throw new Error(`management_query_http_${res.status}`);
	return res.json();
}

async function managementFunctions(projectRef, token) {
	const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/functions`, {
		headers: { Authorization: `Bearer ${token}`, "User-Agent": USER_AGENT },
	});
	if (!res.ok) throw new Error(`management_functions_http_${res.status}`);
	return res.json();
}

async function fetchRealSchema(projectRef, tokenKey) {
	const token = readVaultKey(tokenKey);
	if (!token) throw new Error(`token_missing_${tokenKey}`);

	const columnRows = await managementQuery(
		projectRef,
		token,
		"select table_name, column_name from information_schema.columns where table_schema = 'public';",
	);
	const tables = new Map();
	for (const row of columnRows) {
		if (!tables.has(row.table_name)) tables.set(row.table_name, new Set());
		tables.get(row.table_name).add(row.column_name);
	}

	const rpcRows = await managementQuery(
		projectRef,
		token,
		"select routine_name from information_schema.routines where routine_schema = 'public' and routine_type = 'FUNCTION';",
	);
	const rpcs = new Set(rpcRows.map((r) => r.routine_name));

	const fnList = await managementFunctions(projectRef, token);
	const edgeFunctions = new Set((Array.isArray(fnList) ? fnList : []).map((f) => f.slug));

	return { tables, rpcs, edgeFunctions };
}

async function fetchAppliedMigrationVersions(projectRef, tokenKey) {
	const token = readVaultKey(tokenKey);
	if (!token) throw new Error(`token_missing_${tokenKey}`);
	const rows = await managementQuery(projectRef, token, "select version from supabase_migrations.schema_migrations order by version;");
	return new Set((Array.isArray(rows) ? rows : []).map((row) => String(row.version || "")).filter(Boolean));
}

function loadProjectsConfig() {
	const cliIndex = process.argv.indexOf("--config");
	const configPath = (cliIndex >= 0 ? process.argv[cliIndex + 1] : null)
		|| process.env.SCHEMA_GUARD_CONFIG
		|| path.join(process.cwd(), "schema-guard.config.json");
	if (!existsSync(configPath)) {
		throw new Error(
			`config_not_found:${configPath} - copy schema-guard.config.example.json to schema-guard.config.json (or point SCHEMA_GUARD_CONFIG / --config at your own file) and fill in your real projects.`,
		);
	}
	const raw = JSON.parse(readFileSync(configPath, "utf8"));
	const projects = Array.isArray(raw?.projects) ? raw.projects : [];
	if (projects.length === 0) throw new Error(`config_has_no_projects:${configPath}`);
	return projects;
}

async function auditProject(cfg) {
	if (!existsSync(cfg.repoCwd)) {
		return { project: cfg.project, schemaOk: false, findings: [], note: "repo_path_absent" };
	}
	// The remote to fetch is derived from the ref itself (e.g. "origin/main" ->
	// "origin"), never hardcoded "origin" - a project with more than one remote
	// configured would otherwise silently fetch the wrong one, leaving the
	// target ref unresolved locally and the file listing empty with no visible
	// error.
	const remoteName = cfg.ref.split("/")[0];
	// This repo may be shared by several concurrent processes - real transient
	// contention (e.g. another process holding .git/index.lock at the same
	// instant) has been observed in practice; one retry absorbs passing noise
	// without masking a genuine failure (which would fail on both attempts).
	let fetchResult = git(["fetch", remoteName, "--quiet"], cfg.repoCwd);
	if (!fetchResult.ok) fetchResult = git(["fetch", remoteName, "--quiet"], cfg.repoCwd);
	if (!fetchResult.ok) {
		return { project: cfg.project, schemaOk: false, findings: [], note: `git_fetch_failed_${remoteName}` };
	}
	const sourceCommitResult = git(["rev-parse", cfg.ref], cfg.repoCwd);
	if (!sourceCommitResult.ok || !sourceCommitResult.stdout.trim()) {
		return { project: cfg.project, schemaOk: false, findings: [], note: "git_ref_resolution_failed" };
	}
	const sourceCommit = sourceCommitResult.stdout.trim();

	const calls = [];
	for (const subpath of cfg.subpaths) {
		const files = listFilesAtRef(cfg.repoCwd, sourceCommit, subpath);
		for (const file of files) {
			const text = readFileAtRef(cfg.repoCwd, sourceCommit, file);
			if (text) calls.push(...extractSupabaseCalls(text, file));
		}
	}

	try {
		const schema = await fetchRealSchema(cfg.supabaseRef, cfg.tokenKey);
		const repoPaths = listAllFilesAtRef(cfg.repoCwd, sourceCommit);
		const sqlFiles = repoPaths.filter((file) => /\.sql$/i.test(file));
		const sqlEntries = sqlFiles.map((file) => ({ path: file, text: readFileAtRef(cfg.repoCwd, sourceCommit, file) })).filter((entry) => entry.text);
		let appliedMigrationVersions = null;
		try { appliedMigrationVersions = await fetchAppliedMigrationVersions(cfg.supabaseRef, cfg.tokenKey); } catch {}
		const reachableFindings = classifySourceReachability(crossCheck(calls, schema));
		const contractClassified = classifySchemaContractEvidence(reachableFindings, { sqlEntries, repoPaths });
		const findings = classifyMigrationContractStatus(contractClassified, { sqlEntries, appliedMigrationVersions });
		return { project: cfg.project, source_commit: sourceCommit, schemaOk: true, findings, calls_checked: calls.length, contract_files_checked: sqlFiles.length };
	} catch (error) {
		return { project: cfg.project, schemaOk: false, findings: [], note: String(error.message || error) };
	}
}

export function reportsSemanticallyEqual(previousReport, nextReport) {
	if (!previousReport || !nextReport) return false;
	const normalize = (report) => ({
		...report,
		summary: { ...(report.summary ?? {}), generated_at: null },
	});
	return JSON.stringify(normalize(previousReport)) === JSON.stringify(normalize(nextReport));
}

function loadPreviousReport() {
	if (!existsSync(OUT_JSON)) return null;
	try {
		return JSON.parse(readFileSync(OUT_JSON, "utf8"));
	} catch {
		return null;
	}
}

function writeReport(report) {
	mkdirSync(OUT_DIR, { recursive: true });
	writeFileSync(OUT_JSON, `${JSON.stringify(report, null, 2)}\n`);
	const md = [
		"# Schema Usage Guard — report",
		"",
		`Generated: ${report.summary.generated_at}`,
		"",
		"## Summary",
		"",
		...Object.entries(report.summary).map(([k, v]) => `- ${k}: ${v}`),
		"",
		"## Alerts",
		"",
		...(report.alerts.length ? report.alerts.map((a) => `- ${a}`) : ["- (none)"]),
		"",
		"## Detail per project",
		"",
		...report.projects.flatMap((p) => [
			`### ${p.project}`,
			`- schema_ok: ${p.schemaOk}`,
			p.source_commit ? `- source_commit: ${p.source_commit}` : null,
			p.note ? `- note: ${p.note}` : null,
			...(p.findings || []).map((f) => `- DRIFT ${f.kind} \`${f.target}\` (${f.reason}) [evidence=${f.contract_evidence || "unclassified"}; reachability=${f.source_reachability || "runtime_candidate"}] - ${f.file}`),
		].filter(Boolean)),
		"",
		"This guard never mutates anything and never prints a credential - it only",
		"extracts real Supabase calls from source code (via `git show`, never a",
		"possibly-stale local checkout) and cross-checks them against the real",
		"schema via the Management API.",
		"",
	].join("\n");
	writeFileSync(OUT_MD, md);
}

async function main() {
	const generatedAt = new Date().toISOString();
	const previousReport = loadPreviousReport();
	const PROJECTS = loadProjectsConfig();
	const projects = [];
	for (const cfg of PROJECTS) {
		projects.push(await auditProject(cfg));
	}
	const report = buildReport({ generatedAt, projects });
	const changed = !reportsSemanticallyEqual(previousReport, report);
	if (changed) writeReport(report);
	console.log(JSON.stringify({ summary: report.summary, alerts: report.alerts, changed }, null, 2));
	if (report.alerts.length > 0) process.exitCode = 2;
}

const isDirectRun = (() => {
	try {
		const invoked = process.argv[1] ? new URL(`file:///${process.argv[1].replace(/\\/g, "/")}`).href : null;
		return invoked === import.meta.url;
	} catch {
		return true;
	}
})();

if (isDirectRun) {
	main();
}
