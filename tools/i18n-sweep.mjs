#!/usr/bin/env node
/**
 * Which user-facing sentences the code still holds instead of asking the
 * catalogue for.
 *
 *   node tools/i18n-sweep.mjs          # the count, by file
 *   node tools/i18n-sweep.mjs --list   # every hit, with its line
 *
 * **What it cannot see.** Untranslated copy also travels as *data*: a value
 * passed into a substitution (`since: 'the last seven days'`), and a field
 * stored on a record and rendered later (`payloadShape: 'none'`). Both looked
 * like arguments to this sweep and like English to the reader, and both were
 * found by looking at a screenshot rather than by counting. A number from here
 * is a floor, not a total.
 *
 * It exists because the number kept being wrong. Four iterations reported 49,
 * 43, 36 and 15 remaining, each derived by a fresh throwaway regex, and every
 * one of them undercounted: the pattern required a capital first letter, and
 * the self-audit log's purpose lines — "downloading the list of known-bad
 * sites", "triggered by alarm:feeds" — start lowercase. The true figure when
 * this file was written is 44. A measurement re-invented per run is a guess
 * wearing a number's clothes.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const ROOTS = ['apps/extension/src', 'packages/ui/src']

/**
 * Three or more words with at least two lowercase ones after the first. Prose,
 * in other words — not an identifier, a role name or a key.
 */
const SENTENCE = /(['"`])([A-Za-z][\w']*(?: [a-z][\w'-]*){2,}[^'"`]*)\1/g

/** Values that look like prose and are not: paths, MIME types, URLs. */
const NOISE = /^(data-|https?:|chrome-extension:|application\/|text\/|[a-z]+\/[a-z]+$)/

function walk(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(full)
    if (!entry.name.endsWith('.ts') || entry.name.endsWith('.test.ts')) return []
    return [full]
  })
}

const hits = []
for (const base of ROOTS) {
  const dir = path.join(root, base)
  try {
    statSync(dir)
  } catch {
    continue
  }
  for (const file of walk(dir)) {
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, index) => {
      const trimmed = line.trim()
      // Comments explain; they are not shipped to anyone.
      if (trimmed.startsWith('*') || trimmed.startsWith('//')) return
      for (const match of line.matchAll(SENTENCE)) {
        const value = match[2]
        if (NOISE.test(value)) continue
        hits.push({ file: path.relative(root, file), line: index + 1, value })
      }
    })
  }
}

const byFile = new Map()
for (const hit of hits) byFile.set(hit.file, (byFile.get(hit.file) ?? 0) + 1)

if (process.argv.includes('--list')) {
  for (const hit of hits) {
    console.log(`${hit.file}:${hit.line}  ${JSON.stringify(hit.value.slice(0, 72))}`)
  }
  console.log('')
}

for (const [file, count] of [...byFile].sort((a, b) => b[1] - a[1])) {
  console.log(`  ${String(count).padStart(3)}  ${file}`)
}
console.log(`\n${hits.length} sentence(s) in ${byFile.size} file(s) outside the catalogue`)
