#!/usr/bin/env node
import { execSync } from 'child_process'
import fs from 'fs'
import path from 'path'

const rootDir = process.cwd()
const inputTargets = process.argv.slice(2)
const targets = inputTargets.length > 0 ? inputTargets : ['examples/basic-app']

function run(command, cwd) {
  execSync(command, {
    cwd,
    stdio: 'inherit',
    encoding: 'utf8',
  })
}

function resolveProject(projectPath) {
  const abs = path.resolve(rootDir, projectPath)
  const pkg = path.join(abs, 'package.json')
  if (!fs.existsSync(pkg)) {
    throw new Error(`package.json not found: ${projectPath}`)
  }
  return abs
}

function labelFor(projectPath) {
  return projectPath.replace(/\\/g, '/')
}

console.log('\n=== Public Standards Audit Runner ===\n')

for (const target of targets) {
  const projectDir = resolveProject(target)
  const label = labelFor(target)

  console.log(`-> ${label}`)
  run('npm run check:imports', projectDir)
  run('npm run audit:consistency', projectDir)
  run('npm run audit:consistency:strict', projectDir)
  console.log(`OK: ${label}\n`)
}

console.log('All targets passed.\n')
