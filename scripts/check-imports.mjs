#!/usr/bin/env node
import fs from 'fs'
import path from 'path'

const rootDir = process.cwd()
const srcDir = path.join(rootDir, 'src')

if (!fs.existsSync(srcDir)) {
  console.error('src/ not found in current working directory.')
  process.exit(1)
}

const SOURCE_EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'])
const RESOLVE_EXTENSIONS = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs', '.json', '.css', '.scss', '.sass', '.less', '.svg', '.png', '.jpg', '.jpeg', '.webp', '.gif', '.ico']
const IMPORT_RE = /(?:import\s+(?:[^'"`]+?\s+from\s+)?|export\s+[^'"`]*?from\s+|import\s*\(\s*)['"]([^'"`]+)['"]\s*\)?/g

function toPosix(p) {
  return p.replace(/\\/g, '/')
}

function readDirExact(dir, segment) {
  try {
    return fs.readdirSync(dir).includes(segment)
  } catch {
    return false
  }
}

function existsWithExactCase(targetPath) {
  const normalized = path.normalize(targetPath)
  const parsed = path.parse(normalized)
  let current = parsed.root
  const rest = normalized.slice(parsed.root.length)
  const parts = rest.split(path.sep).filter(Boolean)

  for (const part of parts) {
    if (!readDirExact(current || parsed.root, part)) return false
    current = path.join(current || parsed.root, part)
  }

  return fs.existsSync(normalized)
}

function isSourceFile(file) {
  return SOURCE_EXTENSIONS.has(path.extname(file))
}

function shouldSkipFile(relPath) {
  const p = toPosix(relPath)
  return p.includes('/node_modules/') || p.includes('/dist/') || p.includes('/build/') || p.includes('/coverage/') || p.includes('/__deprecated/')
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      walk(abs, out)
    } else if (entry.isFile() && isSourceFile(abs)) {
      out.push(abs)
    }
  }
  return out
}

function candidatePaths(baseNoExt) {
  const out = [baseNoExt]
  for (const ext of RESOLVE_EXTENSIONS) out.push(`${baseNoExt}${ext}`)
  for (const ext of RESOLVE_EXTENSIONS) out.push(path.join(baseNoExt, `index${ext}`))
  return out
}

function resolveImport(fromFile, spec) {
  if (!spec) return null
  if (!(spec.startsWith('@/') || spec.startsWith('./') || spec.startsWith('../'))) return { skip: true }

  const base = spec.startsWith('@/') ? path.join(srcDir, spec.slice(2)) : path.resolve(path.dirname(fromFile), spec)
  for (const candidate of candidatePaths(base)) {
    if (fs.existsSync(candidate)) {
      return { resolved: candidate, exactCase: existsWithExactCase(candidate) }
    }
  }
  return { resolved: null, exactCase: false }
}

const files = walk(srcDir)
const issues = []

for (const file of files) {
  const rel = toPosix(path.relative(rootDir, file))
  if (shouldSkipFile(rel)) continue

  const content = fs.readFileSync(file, 'utf8')
  let match
  while ((match = IMPORT_RE.exec(content)) !== null) {
    const spec = match[1]
    const result = resolveImport(file, spec)
    if (!result || result.skip) continue
    if (!result.resolved) {
      issues.push({ type: 'missing', file: rel, spec })
      continue
    }
    if (!result.exactCase) {
      issues.push({ type: 'case', file: rel, spec, resolved: toPosix(path.relative(rootDir, result.resolved)) })
    }
  }
}

if (issues.length > 0) {
  console.error(`\nERROR: invalid imports detected (${issues.length})\n`)
  for (const issue of issues) {
    if (issue.type === 'missing') console.error(`- [MISSING] ${issue.file} -> ${issue.spec}`)
    else console.error(`- [CASE] ${issue.file} -> ${issue.spec} (resolved: ${issue.resolved})`)
  }
  process.exit(1)
}

console.log('\nCheck imports: OK\n')
