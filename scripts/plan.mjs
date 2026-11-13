import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'

const ID = /^[a-z0-9][a-z0-9-]{0,39}$/
const REPOSITORY = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+$/

const registry = JSON.parse(readFileSync('registry.json', 'utf8'))
const rejected = existsSync('rejected.json') ? JSON.parse(readFileSync('rejected.json', 'utf8')) : {}
const problems = []
for (const [id, e] of Object.entries(registry)) {
  if (!ID.test(id)) problems.push(`${id}: the id takes lowercase letters, digits and dashes`)
  if (!REPOSITORY.test(e.repository ?? '')) problems.push(`${id}: repository must be https://github.com/<owner>/<repo>`)
  const path = e.path ?? '.'
  if (typeof path !== 'string' || path.startsWith('/') || path.split('/').includes('..')) problems.push(`${id}: path must stay inside the repository`)
  const extra = Object.keys(e).filter((k) => !['repository', 'path'].includes(k))
  if (extra.length) problems.push(`${id}: an entry holds only repository and path, versions come from the tags of the repository (${extra.join(', ')})`)
}
if (problems.length) {
  console.error(problems.join('\n'))
  process.exit(1)
}

const newer = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number))
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]
  return false
}

function newest(id, repository, path) {
  const pattern = path === '.' ? /^v(\d+\.\d+\.\d+)$/ : new RegExp(`^${id}/v(\\d+\\.\\d+\\.\\d+)$`)
  let out
  try {
    out = execFileSync('git', ['ls-remote', '--tags', repository], { encoding: 'utf8', timeout: 60_000 })
  } catch (e) {
    console.error(`${id}: cannot list the tags of ${repository}: ${e.message}`)
    return undefined
  }
  const tags = new Map()
  for (const line of out.split('\n').filter(Boolean)) {
    const [sha, ref] = line.split('\t')
    const name = ref.replace(/^refs\/tags\//, '')
    const peeled = name.endsWith('^{}')
    const version = pattern.exec(peeled ? name.slice(0, -3) : name)?.[1]
    if (version && (peeled || !tags.has(version))) tags.set(version, sha)
  }
  const version = [...tags.keys()].sort((a, b) => (newer(a, b) ? -1 : 1))[0]
  return version && { version, commit: tags.get(version) }
}

const released = new Set(JSON.parse(execFileSync('gh', ['release', 'list', '--limit', '1000', '--json', 'tagName'], { encoding: 'utf8' })).map((r) => r.tagName))
const todo = []
for (const [id, e] of Object.entries(registry)) {
  const path = e.path ?? '.'
  const found = newest(id, e.repository, path)
  if (!found || released.has(`${id}-${found.version}`) || rejected[`${id}@${found.version}`]?.commit === found.commit) continue
  todo.push({ id, repository: e.repository, path, ...found })
}
console.log(`todo=${JSON.stringify(todo)}`)
