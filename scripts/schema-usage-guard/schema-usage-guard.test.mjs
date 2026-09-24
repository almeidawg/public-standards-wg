import { test } from "node:test";
import assert from "node:assert/strict";
import { extractSupabaseCalls, crossCheck, classifySchemaContractEvidence, classifySourceReachability, classifyMigrationContractStatus, buildReport, reportsSemanticallyEqual } from "./schema-usage-guard.mjs";

test("extractSupabaseCalls finds a .from(table).select(columns) call with its columns", () => {
	const src = `const { data } = await supabase.from('people').select('id,name,tax_id');`;
	const calls = extractSupabaseCalls(src, "src/x.ts");
	assert.equal(calls.length, 1);
	assert.deepEqual(calls[0], { kind: "select", table: "people", columns: ["id", "name", "tax_id"], file: "src/x.ts" });
});

test("extractSupabaseCalls finds a bare .from(table) call (insert/update/delete) without columns", () => {
	const src = `await supabase.from("contracts").insert({ amount: 100 });`;
	const calls = extractSupabaseCalls(src, "src/y.ts");
	assert.equal(calls.length, 1);
	assert.deepEqual(calls[0], { kind: "from", table: "contracts", file: "src/y.ts" });
});

test("extractSupabaseCalls finds .rpc(name) calls", () => {
	const src = `await supabase.rpc('approve_signup', { p_id: id });`;
	const calls = extractSupabaseCalls(src, "src/z.ts");
	assert.deepEqual(calls, [{ kind: "rpc", name: "approve_signup", file: "src/z.ts" }]);
});

test("extractSupabaseCalls finds .functions.invoke(name) calls", () => {
	const src = `await supabase.functions.invoke("create-admin-user", { body });`;
	const calls = extractSupabaseCalls(src, "src/w.ts");
	assert.deepEqual(calls, [{ kind: "edge_function", name: "create-admin-user", file: "src/w.ts" }]);
});

test("extractSupabaseCalls ignores nested PostgREST embedded-relation columns instead of producing garbage entries", () => {
	const src = `await supabase.from('users').select('id, name, people!inner(name, email)');`;
	const calls = extractSupabaseCalls(src, "src/join.ts");
	assert.equal(calls.length, 1);
	assert.deepEqual(calls[0].columns, ["id", "name"]);
});

test("extractSupabaseCalls handles multi-line select() with embedded relations across newlines", () => {
	const src = `await supabase.from('checklists').select(\`
			id,
			done,
			checklist_items (
				text
			)
		\`);`;
	const calls = extractSupabaseCalls(src, "src/multiline.ts");
	assert.equal(calls.length, 1);
	assert.deepEqual(calls[0].columns, ["id", "done"]);
});

test("extractSupabaseCalls ignores supabase.storage.from(bucket) - a Storage bucket reference is not a database table (real false positive found in production: storage bucket names misreported as missing tables)", () => {
	const src = `await supabase.storage.from('uploads').upload(path, file);
const { data } = supabaseRaw.storage.from("avatars").getPublicUrl(filePath);`;
	const calls = extractSupabaseCalls(src, "src/upload.ts");
	assert.deepEqual(calls, []);
});

test("extractSupabaseCalls ignores supabase.storage.from(bucket) even when the chain breaks across lines (real case found in production: '.storage' on one line, deeply indented '.from(\"uploads\")' on the next)", () => {
	const src = `const { data } = await supabase.storage
                            .from("uploads")
                            .createSignedUrl(path, 3600);`;
	const calls = extractSupabaseCalls(src, "src/multiline-storage.ts");
	assert.deepEqual(calls, []);
});

test("extractSupabaseCalls still finds a real .from(table) call that happens to appear right after unrelated storage code", () => {
	const src = `await supabase.storage.from('uploads').upload(path, file);
await supabase.from('people').select('id,name');`;
	const calls = extractSupabaseCalls(src, "src/mixed.ts");
	assert.equal(calls.length, 1);
	assert.equal(calls[0].table, "people");
});

test("extractSupabaseCalls ignores unrelated code and finds multiple calls in one file", () => {
	const src = `
		function noop() {}
		await supabase.from('people').select('id,tax_id');
		await supabase.rpc('fn_summary');
	`;
	const calls = extractSupabaseCalls(src, "src/multi.ts");
	assert.equal(calls.length, 2);
	assert.equal(calls[0].kind, "select");
	assert.equal(calls[1].kind, "rpc");
});

test("crossCheck flags a select on a table that does not exist in the real schema", () => {
	const calls = [{ kind: "select", table: "ghost_users", columns: ["id"], file: "a.ts" }];
	const schema = { tables: new Map(), rpcs: new Set(), edgeFunctions: new Set() };
	const findings = crossCheck(calls, schema);
	assert.equal(findings.length, 1);
	assert.equal(findings[0].ok, false);
	assert.equal(findings[0].reason, "table_missing");
});

test("crossCheck flags a select on a real table but a column that does not exist", () => {
	const calls = [{ kind: "select", table: "people", columns: ["id", "cost_center"], file: "a.ts" }];
	const schema = { tables: new Map([["people", new Set(["id", "name", "tax_id"])]]), rpcs: new Set(), edgeFunctions: new Set() };
	const findings = crossCheck(calls, schema);
	assert.equal(findings.length, 1);
	assert.equal(findings[0].ok, false);
	assert.equal(findings[0].reason, "column_missing:cost_center");
});

test("crossCheck passes a select whose table and every column are real", () => {
	const calls = [{ kind: "select", table: "people", columns: ["id", "name"], file: "a.ts" }];
	const schema = { tables: new Map([["people", new Set(["id", "name", "tax_id"])]]), rpcs: new Set(), edgeFunctions: new Set() };
	const findings = crossCheck(calls, schema);
	assert.deepEqual(findings, []);
});

test("crossCheck flags a bare .from(table) mutation call when the table does not exist", () => {
	const calls = [{ kind: "from", table: "work_records", file: "a.ts" }];
	const schema = { tables: new Map(), rpcs: new Set(), edgeFunctions: new Set() };
	const findings = crossCheck(calls, schema);
	assert.equal(findings.length, 1);
	assert.equal(findings[0].reason, "table_missing");
});

test("crossCheck flags an rpc call whose function does not exist", () => {
	const calls = [{ kind: "rpc", name: "create_admin_user", file: "a.ts" }];
	const schema = { tables: new Map(), rpcs: new Set(["approve_signup"]), edgeFunctions: new Set() };
	const findings = crossCheck(calls, schema);
	assert.equal(findings.length, 1);
	assert.equal(findings[0].reason, "rpc_missing");
});

test("crossCheck flags an edge function invoke whose function is not deployed", () => {
	const calls = [{ kind: "edge_function", name: "create-admin-user", file: "a.ts" }];
	const schema = { tables: new Map(), rpcs: new Set(), edgeFunctions: new Set(["send-email"]) };
	const findings = crossCheck(calls, schema);
	assert.equal(findings.length, 1);
	assert.equal(findings[0].reason, "edge_function_missing");
});

test("classifySchemaContractEvidence distinguishes versioned SQL contract from source-only drift", () => {
	const findings = [
		{ kind: "select", target: "customers", file: "a.ts", ok: false, reason: "table_missing" },
		{ kind: "select", target: "ghost", file: "b.ts", ok: false, reason: "table_missing" },
		{ kind: "select", target: "people", file: "c.ts", ok: false, reason: "column_missing:cost_center" },
		{ kind: "edge_function", target: "send-email", file: "d.ts", ok: false, reason: "edge_function_missing" },
	];
	const classified = classifySchemaContractEvidence(findings, {
		sqlEntries: [{ path: "sql/schema.sql", text: "create table customers(id uuid); create table people(id uuid, cost_center text);" }],
		repoPaths: ["supabase/functions/send-email/index.ts"],
	});
	assert.deepEqual(classified.map((finding) => finding.contract_evidence), [
		"sql_contract_present",
		"source_only",
		"sql_contract_present",
		"edge_function_source_present",
	]);
});

test("classifySchemaContractEvidence rejects substring-only SQL evidence", () => {
	const findings = [
		{ kind: "select", target: "contracts", file: "a.ts", ok: false, reason: "table_missing" },
		{ kind: "select", target: "pricelist", file: "b.ts", ok: false, reason: "table_missing" },
	];
	const classified = classifySchemaContractEvidence(findings, {
		sqlEntries: [{ path: "sql/noise.sql", text: "alter table profiles add column can_view_contracts boolean; alter table pricelist_items add column category text;" }],
	});
	assert.deepEqual(classified.map((finding) => finding.contract_evidence), ["source_only", "source_only"]);
});

test("classifySchemaContractEvidence requires exact column DDL instead of comments, category_id, or unrelated ALTER TABLE", () => {
	const findings = [
		{ kind: "select", target: "pricelist_items", file: "a.ts", ok: false, reason: "column_missing:category" },
		{ kind: "select", target: "pricelist_items", file: "b.ts", ok: false, reason: "column_missing:category_id" },
	];
	const classified = classifySchemaContractEvidence(findings, {
		sqlEntries: [{ path: "sql/cleanup.sql", text: "-- global sequence by category\nalter table public.pricelist_items drop constraint if exists pricelist_items_code_key;\nselect i.category_id from public.pricelist_items i;" }],
	});
	assert.deepEqual(classified.map((finding) => finding.contract_evidence), ["source_only", "source_only"]);
});

test("classifySourceReachability distinguishes runtime candidates from migration, audit, and diagnostic artifacts", () => {
	const findings = [
		{ file: "app/frontend/src/lib/api.ts" },
		{ file: "app/frontend/migrate-site-data.mjs" },
		{ file: "app/frontend/_AUDITS/20260508/audit.mjs" },
		{ file: "app/frontend/src/diagnostico-schedule.ts" },
	];
	const classified = classifySourceReachability(findings);
	assert.deepEqual(classified.map((finding) => finding.source_reachability), [
		"runtime_candidate",
		"migration_script",
		"audit_artifact",
		"diagnostic_script",
	]);
});

test("classifyMigrationContractStatus distinguishes applied and pending migrations", () => {
	const base = [
		{ kind: "select", target: "customers", file: "a.ts", ok: false, reason: "table_missing", contract_evidence: "sql_contract_present" },
		{ kind: "select", target: "projects", file: "b.ts", ok: false, reason: "column_missing:city", contract_evidence: "sql_contract_present" },
		{ kind: "select", target: "contracts", file: "c.ts", ok: false, reason: "table_missing", contract_evidence: "sql_contract_present" },
	];
	const sqlEntries = [
		{ path: "supabase/migrations/20260803090000_customers.sql", text: "create table customers(id uuid);" },
		{ path: "supabase/migrations/20260804090000_projects.sql", text: "alter table projects add column city text;" },
		{ path: "supabase/migrations/20260805090000_noise.sql", text: "-- customers in the text; alter table profiles add column can_view_contracts boolean;" },
	];
	const classified = classifyMigrationContractStatus(base, { sqlEntries, appliedMigrationVersions: new Set(["20260803090000"]) });
	assert.equal(classified[0].contract_evidence, "migration_contract_applied");
	assert.equal(classified[1].contract_evidence, "migration_contract_pending");
	assert.equal(classified[2].contract_evidence, "sql_contract_present");
});

test("buildReport summarizes findings per project and raises one alert per drift", () => {
	const report = buildReport({
		generatedAt: "2026-08-13T00:00:00.000Z",
		projects: [
			{
				project: "acme",
				schemaOk: true,
				findings: [
					{ kind: "select", target: "ghost_users", file: "a.ts", ok: false, reason: "table_missing" },
				],
			},
			{ project: "beta", schemaOk: true, findings: [] },
		],
	});
	assert.ok(report.alerts.includes("schema_drift_acme_ghost_users_table_missing"));
	assert.equal(report.summary.total_drift_findings, 1);
	assert.equal(report.summary.projects_checked, 2);
});

test("buildReport raises schema_probe_failed_<project> when a project schema fetch fails", () => {
	const report = buildReport({
		generatedAt: "2026-08-13T00:00:00.000Z",
		projects: [{ project: "gamma", schemaOk: false, findings: [] }],
	});
	assert.ok(report.alerts.includes("schema_probe_failed_gamma"));
});

test("buildReport raises schema_guard_low_coverage_<project> instead of staying silent when zero Supabase calls were found despite a successful schema probe (never let 0 findings read as clean when it actually means the tool found nothing to check)", () => {
	const report = buildReport({
		generatedAt: "2026-08-13T00:00:00.000Z",
		projects: [{ project: "beta", schemaOk: true, findings: [], calls_checked: 0 }],
	});
	assert.ok(report.alerts.includes("schema_guard_low_coverage_beta"));
});

test("buildReport stays quiet about coverage when a project genuinely has calls checked and zero drift", () => {
	const report = buildReport({
		generatedAt: "2026-08-13T00:00:00.000Z",
		projects: [{ project: "acme", schemaOk: true, findings: [], calls_checked: 200 }],
	});
	assert.deepEqual(report.alerts, []);
});


test("reportsSemanticallyEqual ignores only generated_at churn", () => {
	const previous = { summary: { generated_at: "2026-08-15T15:25:00.000Z", projects_checked: 3, total_drift_findings: 2 }, alerts: ["a"], projects: [{ project: "x", schemaOk: true, findings: [] }] };
	const next = { summary: { generated_at: "2026-08-15T21:25:00.000Z", projects_checked: 3, total_drift_findings: 2 }, alerts: ["a"], projects: [{ project: "x", schemaOk: true, findings: [] }] };
	assert.equal(reportsSemanticallyEqual(previous, next), true);
});

test("reportsSemanticallyEqual detects material report changes", () => {
	const previous = { summary: { generated_at: "a", projects_checked: 3, total_drift_findings: 2 }, alerts: ["a"], projects: [] };
	const next = { summary: { generated_at: "b", projects_checked: 3, total_drift_findings: 3 }, alerts: ["a", "b"], projects: [] };
	assert.equal(reportsSemanticallyEqual(previous, next), false);
});


test("reportsSemanticallyEqual detects project-detail changes with stable counts", () => {
	const previous = { summary: { generated_at: "a", projects_checked: 1, total_drift_findings: 1 }, alerts: ["schema_drift_x_t_column_missing:a"], projects: [{ project: "x", schemaOk: true, findings: [{ kind: "select", target: "t", reason: "column_missing:a", file: "a.ts" }] }] };
	const next = { summary: { generated_at: "b", projects_checked: 1, total_drift_findings: 1 }, alerts: ["schema_drift_x_t_column_missing:a"], projects: [{ project: "x", schemaOk: true, findings: [{ kind: "select", target: "t", reason: "column_missing:a", file: "b.ts" }] }] };
	assert.equal(reportsSemanticallyEqual(previous, next), false);
});
