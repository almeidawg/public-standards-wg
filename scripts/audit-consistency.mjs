#!/usr/bin/env node
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const rootDir = process.cwd()
const srcDir = path.join(rootDir, 'src')
const scriptsDir = path.join(rootDir, 'scripts')
const baselineFile = path.join(scriptsDir, 'audit-consistency.baseline.json')
const updateBaseline = process.argv.includes('--update-baseline')
const strictMode = process.argv.includes('--strict')

if (!fs.existsSync(srcDir)) {
  console.error('src/ not found in current working directory.')
  process.exit(1)
}

const CHECKS = [
  {
    id: 'prices',
    label: 'Hardcoded prices',
    pattern: String.raw`\b(?:29|59|79|149)[\.,]90\b|USD\s*(?:29|59|79|149)(?:[\.,]90)?\b|R\$\s*(?:29|59|79|149)(?:[\.,]90)?\b`,
    kind: 'content',
  },
  {
    id: 'urls',
    label: 'Hardcoded URLs',
    pattern: String.raw`https?:\/\/[a-z0-9.-]+\.[a-z]{2,}(?:\/[^\s"'` + "`" + String.raw`]*)?`,
    kind: 'content',
  },
  {
    id: 'contact',
    label: 'Hardcoded contact data',
    pattern: String.raw`[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\+\d[\d\s().-]{7,}`,
    kind: 'content',
    flags: 'i',
  },
  {
    id: 'junk_files',
    label: 'Suspicious file names',
    pattern: String.raw`(?:^|[\\/._-])(temp|backup|final|old|legacy|deprecated)(?:[\\/._-]|$)`,
    kind: 'filename',
  },
]

const DEFAULT_ALLOWED = {
  prices: ['src/data/company.ts', 'src/data/company.js', 'src/data/planos.ts', 'src/data/planos.js', 'src/data/config.ts', 'src/data/config.js'],
  urls: ['src/data/company.ts', 'src/data/company.js', 'src/data/config.ts', 'src/data/config.js'],
  contact: ['src/data/company.ts', 'src/data/company.js', 'src/data/config.ts', 'src/data/config.js'],
}

const DEFAULT_BASELINE = {
  generatedAt: null,
  checks: Object.fromEntries(CHECKS.map((check) => [check.id, []])),
}

function toPosix(p) {
  return p.replace(/\\/g, '/')
}

function isIgnoredFile(relPath) {
  const p = toPosix(relPath)
  if (p.includes('/__tests__/')) return true
  if (p.includes('/__mocks__/')) return true
  if (p.includes('/__deprecated/')) return true
  if (p.includes('/dist/')) return true
  if (p.includes('/build/')) return true
  if (p.includes('/.next/')) return true
  if (p.includes('/node_modules/')) return true
  if (p.includes('/coverage/')) return true
  if (p.endsWith('.test.ts') || p.endsWith('.test.tsx') || p.endsWith('.test.js') || p.endsWith('.test.jsx')) return true
  if (p.endsWith('.spec.ts') || p.endsWith('.spec.tsx') || p.endsWith('.spec.js') || p.endsWith('.spec.jsx')) return true
  if (p.endsWith('.generated.ts') || p.endsWith('.generated.js')) return true
  return false
}

function run(command) {
  try {
    return execSync(command, { cwd: rootDir, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch {
    return ''
  }
}

function rgContent(pattern, flags = '') {
  const flagArgs = flags.includes('i') ? '--ignore-case' : ''
  const cmd = `rg --json -n --no-heading --color never ${flagArgs} -g "*.ts" -g "*.tsx" -g "*.js" -g "*.jsx" "${pattern}" "${srcDir}"`
  const out = run(cmd)
  if (!out) return []
  const rows = out.split('\n').filter(Boolean)
  const files = []
  for (const row of rows) {
    let parsed
    try {
      parsed = JSON.parse(row)
    } catch {
      continue
    }
    if (parsed.type !== 'match') continue
    const abs = parsed?.data?.path?.text
    if (!abs) continue
    const rel = toPosix(path.relative(rootDir, abs))
    if (!rel || rel.startsWith('..') || isIgnoredFile(rel)) continue
    files.push(rel)
  }
  return Array.from(new Set(files)).sort()
}

function rgFiles(pattern) {
  const out = run(`rg --files "${srcDir}"`)
  if (!out) return []
  const rx = new RegExp(pattern, 'i')
  return Array.from(
    new Set(
      out
        .split('\n')
        .filter(Boolean)
        .map((abs) => toPosix(path.relative(rootDir, abs)))
        .filter((rel) => rel && !rel.startsWith('..') && !isIgnoredFile(rel))
        .filter((rel) => rx.test(rel)),
    ),
  ).sort()
}

function loadBaseline() {
  if (!fs.existsSync(baselineFile)) return structuredClone(DEFAULT_BASELINE)
  try {
    const parsed = JSON.parse(fs.readFileSync(baselineFile, 'utf8'))
    if (!parsed?.checks) return structuredClone(DEFAULT_BASELINE)
    return {
      generatedAt: parsed.generatedAt || null,
      checks: {
        ...Object.fromEntries(CHECKS.map((check) => [check.id, []])),
        ...parsed.checks,
      },
    }
  } catch {
    return structuredClone(DEFAULT_BASELINE)
  }
}

function saveBaseline(data) {
  if (!fs.existsSync(scriptsDir)) fs.mkdirSync(scriptsDir, { recursive: true })
  fs.writeFileSync(baselineFile, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

const baseline = loadBaseline()
const nextBaseline = {
  generatedAt: new Date().toISOString(),
  checks: { ...Object.fromEntries(CHECKS.map((check) => [check.id, []])) },
}

let hasError = false

console.log('\n=== Consistency Audit ===\n')
console.log(`Project: ${rootDir}`)
console.log(`Mode: ${updateBaseline ? 'UPDATE_BASELINE' : strictMode ? 'CHECK_STRICT' : 'CHECK'}`)

for (const check of CHECKS) {
  const rawFiles = check.kind === 'filename' ? rgFiles(check.pattern) : rgContent(check.pattern, check.flags || '')
  const allowed = new Set((DEFAULT_ALLOWED[check.id] || []).map((value) => toPosix(value)))
  const relevant = rawFiles.filter((file) => !allowed.has(toPosix(file)))

  nextBaseline.checks[check.id] = [...relevant]

  if (updateBaseline) {
    console.log(`- ${check.label}: ${relevant.length} file(s) in baseline`)
    continue
  }

  const known = new Set((baseline.checks[check.id] || []).map((value) => toPosix(value)))
  const regressions = relevant.filter((file) => !known.has(toPosix(file)))

  if (relevant.length === 0) {
    console.log(`- ${check.label}: OK`)
    continue
  }

  if (strictMode) {
    hasError = true
    console.error(`\nERROR: ${check.label} in strict mode (${relevant.length})`)
    relevant.forEach((file) => console.error(`  + ${file}`))
    continue
  }

  if (regressions.length > 0) {
    hasError = true
    console.error(`\nERROR: ${check.label} regression (${regressions.length})`)
    regressions.forEach((file) => console.error(`  + ${file}`))
  } else {
    console.warn(`\nWARN: ${check.label} with known legacy (${relevant.length})`)
  }
}

if (updateBaseline) {
  saveBaseline(nextBaseline)
  console.log(`\nBaseline updated at: ${baselineFile}`)
  process.exit(0)
}

if (hasError) {
  console.error('\nAudit failed: regression detected.')
  process.exit(1)
}

console.log('\nAudit OK.\n')
