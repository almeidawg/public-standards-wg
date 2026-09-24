# Schema usage guard

Finds the class of bug that fails 100% silently: your frontend or backend
code reads a table, column, RPC or Edge Function that used to exist (or that
someone renamed on the database side without updating the code) - and
Supabase/PostgREST just returns `null` or an empty array instead of an error.
Nothing crashes. Nothing logs. A screen just looks "empty" until a human
happens to test that exact path.

This tool extracts every real `supabase.from()/.select()/.insert()`, `.rpc()`
and `.functions.invoke()` call from your actual source code and cross-checks
each one against the real, live schema.

```bash
cp scripts/schema-usage-guard/schema-guard.config.example.json ./schema-guard.config.json
# edit schema-guard.config.json with your real project(s)
SCHEMA_GUARD_CONFIG=./schema-guard.config.json node scripts/schema-usage-guard/schema-usage-guard.mjs
```

## Why it reads from git, not your working directory

Source is read via `git show <ref>:<path>`, never from whatever happens to be
checked out on disk right now. A local checkout can be stale, mid-rebase, or
simply pointed at a different branch than what's actually deployed - reading
from a specific ref is the only way to be sure you're auditing the code that
is (or will be) running in production.

## Why it uses the Management API, not PostgREST's OpenAPI schema

Two tempting shortcuts, both with a documented false-negative mode:

- Reading PostgREST's own OpenAPI/`swagger.json` output omits some objects
  depending on exposure settings - a real object can be invisible there.
- Calling an RPC with empty arguments to "check if it exists" gets you a
  generic "function requires parameters" error for a function that
  genuinely exists, indistinguishable from a truly missing one.

Instead, this tool queries `information_schema.columns` /
`information_schema.routines` directly via the Supabase Management API, and
lists real Edge Functions via `GET /v1/projects/{ref}/functions` - both give
a ground-truth answer.

## Evidence classification, not just "found a mismatch"

A raw list of "this call doesn't match the schema" is noisy: some of those
are genuine live bugs, some are a migration that's already written but not
yet applied to that environment, and some are code nobody runs anymore
(an old migration script, a one-off diagnostic, an audit artifact). The
report classifies each finding along two axes instead of dumping one flat
list:

- **Contract evidence**: is there a real `CREATE TABLE`/`ALTER TABLE`/
  `CREATE FUNCTION` somewhere in your `.sql` files that would fix this, and
  if so has that migration actually been applied to this project
  (`migration_contract_applied` vs `_pending` vs `_unknown`), or is there no
  contract for it anywhere (`source_only`)?
- **Source reachability**: does the finding come from code that plausibly
  still runs (`runtime_candidate`), or from a migration script, a diagnostic
  script, or an `_audits/` artifact that's unlikely to matter?

It also distinguishes real signal from a specific, previously-hit false
positive: `supabase.storage.from('bucket')` is syntactically identical to
`supabase.from('table')` under a naive regex, but a Storage bucket reference
is not a database table - the extractor explicitly walks back past the
preceding `.storage` token (including across a line break) before deciding a
`.from()` call is one it should check.

## Guarantees

- Read-only. It queries git and the Management API; it never writes to
  either, and never touches your local checkout.
- Never prints a credential. Tokens are read by name from an environment
  variable (or an optional external vault script you point it at via
  `SCHEMA_GUARD_VAULT_SCRIPT`), used only to build an `Authorization` header
  in memory, and never logged.
- `calls_checked: 0` on a project that has real Supabase calls always raises
  `schema_guard_low_coverage_<project>` instead of silently reading as
  "clean" - a parser that doesn't recognize a project's calling convention
  (e.g. raw `fetch()` against PostgREST instead of the SDK) is a coverage
  gap, not a pass.

## Design notes

- Zero dependencies beyond Node's built-ins.
- Every request sends a real browser-like `User-Agent` header - some cloud
  provider APIs (Supabase's Management API included) return a generic 403 to
  requests without one, which looks identical to an invalid token unless you
  read the response body.
- Re-running the tool only rewrites its output report when something
  material actually changed (`reportsSemanticallyEqual`) - a `generated_at`
  timestamp changing on every run would otherwise make every re-run look like
  a diff in version control even when nothing did.
