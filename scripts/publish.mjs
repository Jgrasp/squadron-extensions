import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'

const REPO = process.env.GITHUB_REPOSITORY
const registry = JSON.parse(readFileSync('registry.json', 'utf8'))
const index = JSON.parse(readFileSync('index.json', 'utf8'))
const kept = new Map(index.extensions.filter((e) => registry[e.id]).map((e) => [e.id, e]))

for (const file of readdirSync('out').filter((f) => f.endsWith('.tar.gz'))) {
  const path = `out/${file}`
  const id = Object.keys(registry).find((id) => file === `${id}-${registry[id].version}.tar.gz`)
  if (!id) continue
  const entry = registry[id]
  const tag = `${id}-${entry.version}`
  const sha256 = createHash('sha256').update(readFileSync(path)).digest('hex')
  const manifest = JSON.parse(execFileSync('tar', ['--extract', '--gzip', '--to-stdout', '--file', path, 'extension.json'], { encoding: 'utf8' }))
  execFileSync('gh', ['release', 'create', tag, path, '--title', `${manifest.name?.en ?? id} ${entry.version}`, '--notes', `${entry.repository}/tree/${entry.commit}`], { stdio: 'inherit' })
  kept.set(id, {
    id,
    version: entry.version,
    name: manifest.name,
    description: manifest.description,
    repository: entry.repository,
    commit: entry.commit,
    archive: `https://github.com/${REPO}/releases/download/${tag}/${file}`,
    sha256,
    permissions: manifest.permissions ?? {},
  })
}

const extensions = [...kept.values()].sort((a, b) => a.id.localeCompare(b.id))
writeFileSync('index.json', JSON.stringify({ api: 1, extensions }, null, 2) + '\n')
