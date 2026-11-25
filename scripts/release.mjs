import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { KEPT, buildRelease, entryOf, logoOf, releaseOf } from './catalog.mjs'

const { ID: id, TAG: tag, GITHUB_REPOSITORY: repo } = process.env
const version = /^v(\d+\.\d+\.\d+)$/.exec(tag ?? '')?.[1]
if (!version) throw new Error(`the tag must look like v1.2.3, not ${JSON.stringify(tag)}`)

const file = `${id}-${version}.tar.gz`
const path = `out/${file}`
const repository = `https://github.com/${repo}`
const sha256 = createHash('sha256').update(readFileSync(path)).digest('hex')
const manifest = JSON.parse(execFileSync('tar', ['--extract', '--gzip', '--to-stdout', '--file', path, 'extension.json'], { encoding: 'utf8' }))
const meta = JSON.parse(readFileSync(`out/${id}-${version}.meta.json`, 'utf8'))

async function previousVersions() {
  const url = `${repository}/releases/latest/download/catalog.json`
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(url)
      if (res.status === 404) break
      if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
      const previous = await res.json()
      return previous.versions ?? [releaseOf(previous)]
    } catch (e) {
      if (attempt === 3) throw e
      await new Promise((r) => setTimeout(r, 2000 * attempt))
    }
  }
  const index = JSON.parse(readFileSync(new URL('../index.json', import.meta.url), 'utf8'))
  const seed = index.extensions.find((e) => e.id === id)
  return seed ? (seed.versions ?? [releaseOf(seed)]) : []
}

const release = buildRelease({ version, commit: meta.commit, archive: `${repository}/releases/download/${tag}/${file}`, sha256, manifest, changelog: meta.changelog })
const versions = [release, ...(await previousVersions()).filter((r) => r.version !== version)].slice(0, KEPT)
const catalog = entryOf({ id, name: manifest.name, description: manifest.description, logo: logoOf(path, manifest), repository, versions })
writeFileSync('out/catalog.json', JSON.stringify(catalog, null, 2) + '\n')

const gh = (...args) => execFileSync('gh', [...args, '--repo', repo], { stdio: 'inherit' })
const exists = (() => {
  try {
    execFileSync('gh', ['release', 'view', tag, '--repo', repo], { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
})()
const notes = (meta.changelog?.find((c) => c.version === version)?.notes?.en ?? []).map((n) => `- ${n}`).join('\n') || `${repository}/tree/${meta.commit}`
if (exists) gh('release', 'upload', tag, path, 'out/catalog.json', '--clobber')
else gh('release', 'create', tag, path, 'out/catalog.json', '--draft', '--verify-tag', '--title', `${manifest.name?.en ?? id} ${version}`, '--notes', notes)
gh('release', 'edit', tag, '--draft=false', '--latest')
