import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

const { ID: id, VERSION: version, SOURCE: source, SUBDIR: subdir } = process.env
const dir = resolve(source, subdir)
if (!dir.startsWith(resolve(source))) throw new Error('path leaves the repository')

const manifest = JSON.parse(readFileSync(join(dir, 'extension.json'), 'utf8'))
if (manifest.id !== id) throw new Error(`extension.json says id ${manifest.id}, the registry says ${id}`)
if (manifest.version !== version) throw new Error(`extension.json says version ${manifest.version}, the registry says ${version}`)

if (existsSync(join(dir, 'Cargo.toml'))) execFileSync('cargo', ['build', '--release', '--locked', '--target', 'wasm32-wasip2'], { cwd: dir, stdio: 'inherit' })

const rust = /^(src\/|Cargo\.(toml|lock)$|build\.rs$|\.gitignore$|\.cargo\/)/
const files = execFileSync('git', ['ls-files', '-z', '.'], { cwd: dir, encoding: 'utf8' })
  .split('\0')
  .filter((f) => f && !rust.test(f))
if (manifest.wasm) {
  if (!existsSync(join(dir, manifest.wasm))) throw new Error(`${manifest.wasm} was not built`)
  files.push(manifest.wasm)
}

mkdirSync('out', { recursive: true })
writeFileSync('out/files', files.join('\n'))
execFileSync('tar', ['--create', '--gzip', '--file', resolve('out', `${id}-${version}.tar.gz`), '--owner=0', '--group=0', '--numeric-owner', '--no-recursion', '--directory', dir, '--files-from', resolve('out/files')], { stdio: 'inherit' })
console.log(files.join('\n'))
