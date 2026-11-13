import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const HEADING = /^## (\d+\.\d+\.\d+) · (\d{4}-\d{2}-\d{2})\s*$/
const MAX_LINES = 20
const MAX_LENGTH = 300
const KEPT = 20

export function parse(text, file) {
  const releases = []
  const problems = []
  for (const [at, raw] of text.split('\n').entries()) {
    const line = raw.trimEnd()
    const where = `${file}:${at + 1}`
    if (!line.trim() || line.startsWith('# ')) continue
    const heading = HEADING.exec(line)
    if (heading) {
      releases.push({ version: heading[1], date: heading[2], notes: [] })
      continue
    }
    if (line.startsWith('#')) problems.push(`${where}: a section is "## <version> · <YYYY-MM-DD>"`)
    else if (!releases.length) problems.push(`${where}: text before the first version`)
    else if (!line.startsWith('- ')) problems.push(`${where}: each change is a line starting with "- "`)
    else if (/<[a-z/!]|!\[/i.test(line)) problems.push(`${where}: no HTML and no images`)
    else if (line.length - 2 > MAX_LENGTH) problems.push(`${where}: a line holds ${MAX_LENGTH} characters at most`)
    else releases.at(-1).notes.push(line.slice(2).trim())
  }
  const newer = (a, b) => {
    const [x, y] = [a, b].map((v) => v.split('.').map(Number))
    for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i]
    return false
  }
  releases.forEach((r, i) => {
    if (!r.notes.length) problems.push(`${file}: ${r.version} lists no change`)
    if (r.notes.length > MAX_LINES) problems.push(`${file}: ${r.version} lists more than ${MAX_LINES} changes`)
    if (i && !newer(releases[i - 1].version, r.version)) problems.push(`${file}: ${r.version} comes after ${releases[i - 1].version}, newest first`)
  })
  return { releases, problems }
}

export function read(dir, version) {
  if (!existsSync(join(dir, 'CHANGELOG.md'))) return { changelog: [], problems: [`CHANGELOG.md is missing: add a "## ${version} · <YYYY-MM-DD>" section`] }
  const english = parse(readFileSync(join(dir, 'CHANGELOG.md'), 'utf8'), 'CHANGELOG.md')
  const problems = [...english.problems]
  if (!english.releases.some((r) => r.version === version)) problems.push(`CHANGELOG.md has no section for ${version}`)
  const translations = readdirSync(dir)
    .map((f) => /^CHANGELOG\.([a-z]{2})\.md$/.exec(f))
    .filter(Boolean)
    .map(([file, language]) => {
      const parsed = parse(readFileSync(join(dir, file), 'utf8'), file)
      problems.push(...parsed.problems)
      return [language, parsed.releases]
    })
  const changelog = english.releases.slice(0, KEPT).map(({ version: v, date, notes }) => ({
    version: v,
    date,
    notes: Object.fromEntries([['en', notes], ...translations.flatMap(([language, releases]) => releases.filter((r) => r.version === v && r.notes.length).map((r) => [language, r.notes]))]),
  }))
  return { changelog, problems }
}
