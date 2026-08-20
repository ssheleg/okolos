#!/usr/bin/env node
/**
 * Which user-facing sentences the code still holds instead of asking the
 * catalogue for.
 *
 *   node tools/i18n-sweep.mjs          # the count, by file; exit 1 if any is unexplained
 *   node tools/i18n-sweep.mjs --list   # every hit, with its line
 *
 * **It refuses, and that is the point.** For its first weeks it printed a number
 * and exited 0 from every state, including three sentences outside the catalogue —
 * so it was a report, and a report nothing reads is a report nobody reads. A gate
 * that cannot refuse is a comment with a run time.
 *
 * **`i18n-exempt: <reason>`, at the site, with the reason.** Some of these strings
 * are not copy: a control-flow signal caught two frames up and rendered nowhere, a
 * programming mistake thrown at whoever holds the debugger. Marking them here — on
 * the line or in the three lines above it — keeps the decision beside the string
 * instead of in a central list that outlives every reason in it. A bare marker is
 * refused (an exemption with no reason is an allowlist wearing a comment's
 * clothes), and so is a marker that annotates nothing: when the string it covered
 * was catalogued or moved, the marker left behind is how the next one gets waved
 * through.
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

/** A reason long enough to be one. `i18n-exempt: no` explains nothing. */
const EXEMPT = /i18n-exempt:\s*(\S[^\n]{14,})/
const MARKER = /i18n-exempt:/

const hits = []
const exempt = []
/** Markers that cover no hit — an exemption that outlived its string. */
const stale = []
/** Markers whose reason is missing or too short to be one. */
const unreasoned = []
for (const base of ROOTS) {
  const dir = path.join(root, base)
  try {
    statSync(dir)
  } catch {
    continue
  }
  for (const file of walk(dir)) {
    const lines = readFileSync(file, 'utf8').split('\n')
    const relative = path.relative(root, file)
    /** Which marker lines were used by a hit, so the unused ones can be named. */
    const used = new Set()

    lines.forEach((line, index) => {
      const trimmed = line.trim()
      // Comments explain; they are not shipped to anyone.
      if (trimmed.startsWith('*') || trimmed.startsWith('//')) return
      for (const match of line.matchAll(SENTENCE)) {
        const value = match[2]
        if (NOISE.test(value)) continue

        // The line itself, or the three above it: a marker sits above the code it
        // explains as often as beside it, and a window of one made every reason a
        // trailing comment.
        const window = [index, index - 1, index - 2, index - 3].filter((n) => n >= 0)
        const markerAt = window.find((n) => MARKER.test(lines[n] ?? ''))
        const hit = { file: relative, line: index + 1, value }

        if (markerAt === undefined) {
          hits.push(hit)
          continue
        }
        used.add(markerAt)
        const reason = EXEMPT.exec(lines[markerAt] ?? '')
        if (reason === null) {
          unreasoned.push({ ...hit, marker: markerAt + 1 })
          continue
        }
        exempt.push({ ...hit, reason: reason[1].trim() })
      }
    })

    lines.forEach((line, index) => {
      if (MARKER.test(line) && !used.has(index)) {
        stale.push({ file: relative, line: index + 1 })
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
console.log(`${exempt.length} exempt, each with its reason at the site`)

for (const hit of hits) {
  console.error(`  UNEXPLAINED ${hit.file}:${hit.line}  ${JSON.stringify(hit.value.slice(0, 64))}`)
}
for (const hit of unreasoned) {
  console.error(
    `  NO REASON    ${hit.file}:${hit.marker}  marks ${JSON.stringify(hit.value.slice(0, 48))}`,
  )
}
for (const mark of stale) {
  console.error(`  MARKS NOTHING ${mark.file}:${mark.line}  no sentence within three lines below`)
}

const refusals = hits.length + unreasoned.length + stale.length
if (refusals > 0) {
  console.error(
    `\n  ${refusals} problem(s). A sentence a user reads belongs in _locales; one they cannot` +
      `\n  belongs beside an \`i18n-exempt: <reason>\` saying why.\n`,
  )
  process.exit(1)
}
console.log('\n  OK — every user-facing sentence is in the catalogue.\n')
