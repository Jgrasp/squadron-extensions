import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { KEPT, buildRelease, entryOf, logoOf, newer, releaseOf } from './catalog.mjs'

const REPO = process.env.GITHUB_REPOSITORY
const registry = JSON.parse(readFileSync('registry.json', 'utf8'))
const index = JSON.parse(readFileSync('index.json', 'utf8'))
const rejected = existsSync('rejected.json') ? JSON.parse(readFileSync('rejected.json', 'utf8')) : {}

const kept = new Map(
  index.extensions
    .filter((e) => registry[e.id])
    .map((e) => [e.id, { id: e.id, name: e.name, description: e.description, logo: e.logo, versions: e.versions ?? [releaseOf(e)] }]),
)

for (const file of readdirSync('out').filter((f) => f.endsWith('.tar.gz'))) {
  const path = `out/${file}`
  const id = Object.keys(registry).find((id) => new RegExp(`^${id}-\\d+\\.\\d+\\.\\d+\\.tar\\.gz$`).test(file))
  if (!id) continue
  const tag = file.slice(0, -'.tar.gz'.length)
  const version = tag.slice(id.length + 1)
  const repository = registry[id].repository
  const meta = existsSync(`out/${tag}.meta.json`) ? JSON.parse(readFileSync(`out/${tag}.meta.json`, 'utf8')) : {}
  const sha256 = createHash('sha256').update(readFileSync(path)).digest('hex')
  const manifest = JSON.parse(execFileSync('tar', ['--extract', '--gzip', '--to-stdout', '--file', path, 'extension.json'], { encoding: 'utf8' }))
  execFileSync('gh', ['release', 'create', tag, path, '--title', `${manifest.name?.en ?? id} ${version}`, '--notes', `${repository}/tree/${meta.commit}`], { stdio: 'inherit' })
  const before = kept.get(id)?.versions ?? []
  const release = buildRelease({ version, commit: meta.commit, archive: `https://github.com/${REPO}/releases/download/${tag}/${file}`, sha256, manifest, changelog: meta.changelog })
  const versions = [release, ...before.filter((r) => r.version !== version)].sort((a, b) => (newer(a.version, b.version) ? -1 : 1)).slice(0, KEPT)
  const latest = versions[0] === release
  kept.set(id, latest ? { id, name: manifest.name, description: manifest.description, logo: logoOf(path, manifest), versions } : { ...kept.get(id), versions })
  delete rejected[`${id}@${version}`]
}

for (const file of readdirSync('out').filter((f) => f.endsWith('.rejected.json'))) {
  const { id, version, commit, error } = JSON.parse(readFileSync(`out/${file}`, 'utf8'))
  if (registry[id]) rejected[`${id}@${version}`] = { commit, error, at: new Date().toISOString().slice(0, 10) }
}

const extensions = [...kept.values()]
  .sort((a, b) => a.id.localeCompare(b.id))
  .map(({ id, name, description, logo, versions }) => entryOf({ id, name, description, logo, repository: registry[id].repository, versions }))
writeFileSync('index.json', JSON.stringify({ api: 1, extensions }, null, 2) + '\n')
writeFileSync('rejected.json', JSON.stringify(Object.fromEntries(Object.entries(rejected).filter(([key]) => registry[key.split('@')[0]])), null, 2) + '\n')
