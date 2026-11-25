import { execFileSync } from 'node:child_process'

export const KEPT = 10

export const newer = (a, b) => {
  const [x, y] = [a, b].map((v) => v.split('.').map(Number))
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]
  return false
}

export const logoOf = (path, manifest) => {
  const file = manifest.logo
  if (typeof file !== 'string' || !file.endsWith('.svg') || file.startsWith('/') || file.split(/[\\/]/).some((p) => !p || p.startsWith('.'))) return undefined
  try {
    const svg = execFileSync('tar', ['--extract', '--gzip', '--to-stdout', '--file', path, file], { maxBuffer: 1 << 20 })
    return svg.length <= 65536 && svg.toString('utf8').includes('<svg') ? `data:image/svg+xml;base64,${svg.toString('base64')}` : undefined
  } catch {
    return undefined
  }
}

const RELEASE = ['version', 'commit', 'archive', 'sha256', 'squadron', 'permissions', 'forge', 'changelog']
export const releaseOf = (e) => Object.fromEntries(RELEASE.filter((k) => e[k] !== undefined).map((k) => [k, e[k]]))

export const buildRelease = ({ version, commit, archive, sha256, manifest, changelog }) =>
  releaseOf({
    version,
    commit,
    archive,
    sha256,
    squadron: manifest.squadron,
    permissions: manifest.permissions ?? {},
    forge: Array.isArray(manifest.contributes?.forge?.remotes) ? { remotes: manifest.contributes.forge.remotes } : undefined,
    changelog,
  })

export const entryOf = ({ id, name, description, logo, repository, versions }) => ({ id, name, description, logo, repository, ...versions[0], versions })
