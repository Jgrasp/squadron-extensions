import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'

const ID = /^[a-z0-9][a-z0-9-]{0,39}$/
const VERSION = /^\d+\.\d+\.\d+$/
const REPOSITORY = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/
const COMMIT = /^[0-9a-f]{40}$/

const registry = JSON.parse(readFileSync('registry.json', 'utf8'))
const problems = []
for (const [id, e] of Object.entries(registry)) {
  if (!ID.test(id)) problems.push(`${id}: the id takes lowercase letters, digits and dashes`)
  if (!REPOSITORY.test(e.repository ?? '')) problems.push(`${id}: repository must be https://github.com/<owner>/<repo>`)
  if (!COMMIT.test(e.commit ?? '')) problems.push(`${id}: commit must be a full 40 character sha`)
  if (!VERSION.test(e.version ?? '')) problems.push(`${id}: version must look like 1.2.3`)
  const path = e.path ?? '.'
  if (typeof path !== 'string' || path.startsWith('/') || path.split('/').includes('..')) problems.push(`${id}: path must stay inside the repository`)
}

const base = process.env.BASE
if (base) {
  const before = JSON.parse(execFileSync('git', ['show', `${base}:registry.json`], { encoding: 'utf8' }))
  for (const [id, e] of Object.entries(registry))
    if (before[id] && before[id].commit !== e.commit && before[id].version === e.version) problems.push(`${id}: the commit changed, raise the version too`)
}

if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}

const released = new Set(JSON.parse(execFileSync('gh', ['release', 'list', '--limit', '1000', '--json', 'tagName'], { encoding: 'utf8' })).map((r) => r.tagName))
const todo = Object.entries(registry)
  .filter(([id, e]) => !released.has(`${id}-${e.version}`))
  .map(([id, e]) => ({ id, repository: e.repository, commit: e.commit, path: e.path ?? '.', version: e.version }))
console.log(`todo=${JSON.stringify(todo)}`)
