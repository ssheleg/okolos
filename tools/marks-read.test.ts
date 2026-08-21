import { readFileSync, globSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

/**
 * Every performance mark this product writes is read by the e2e report.
 *
 * B-78's most expensive finding was not a defect in the product. The content script had
 * been measuring its own scan as `okolos:collect` since it was written, and when a banner
 * failed to arrive on CI the report said "a worker registered, the page complete, zero
 * hosts" and stopped — because nobody asked the page for the one number that was already
 * on it. It cost four CI reds, a downloaded trace and an hour of hypotheses to reach a
 * fact the product had been publishing all along.
 *
 * A mark is a diagnostic, and a diagnostic nobody reads is indistinguishable from one
 * that was never written. So the rule is mechanical: a name passed to `performance.measure`
 * appears in `e2e/surfaces.ts`, or this fails. `:start`/`:end` marks are exempt by
 * construction — they exist to produce a measure, and it is the measure that carries the
 * meaning — but a bare `performance.mark` with no measure built from it is a fact in its
 * own right (`okolos:scan-failed`, `okolos:scan-blinded`) and must be read like one.
 */

const root = path.resolve(import.meta.dirname, '..')
const READER = 'e2e/surfaces.ts'

/** Assembled rather than written out, so this file's own prose cannot satisfy it. */
const CALL = (kind: string): RegExp => new RegExp('performance' + `\\.${kind}\\(\\s*([^,)]+)`, 'g')

function sources(): string[] {
  return [
    ...globSync('apps/*/src/**/*.ts', { cwd: root }),
    ...globSync('packages/*/src/**/*.ts', { cwd: root }),
  ].filter((file) => !file.endsWith('.test.ts'))
}

/** The literal behind a name, when the argument is a `const` in the same file. */
function literal(text: string, token: string): string | null {
  const direct = /^['"](.+)['"]$/.exec(token.trim())
  if (direct) return direct[1] ?? null
  const declared = new RegExp(`${token.trim()}\\s*=\\s*['"]([^'"]+)['"]`).exec(text)
  return declared?.[1] ?? null
}

function names(kind: string): { name: string; where: string }[] {
  const found: { name: string; where: string }[] = []
  for (const file of sources()) {
    const text = readFileSync(path.join(root, file), 'utf8')
    for (const match of text.matchAll(CALL(kind))) {
      const name = literal(text, match[1] ?? '')
      if (name !== null) found.push({ name, where: file })
    }
  }
  return found
}

describe('the marks the product writes', () => {
  it('are all read by the report that exists to read them', () => {
    const reader = readFileSync(path.join(root, READER), 'utf8')
    const measures = names('measure')
    // A mark that feeds a measure is an endpoint, not a fact: the measure is what is read.
    const endpoints = new Set(
      sources().flatMap((file) => {
        const text = readFileSync(path.join(root, file), 'utf8')
        return [...text.matchAll(CALL('measure'))].flatMap((m) => {
          const rest = /performance\.measure\(([^)]*)\)/.exec(m[0] + text.slice(m.index + m[0].length, m.index + 200))
          return (rest?.[1] ?? '').split(',').slice(1).map((token) => literal(text, token) ?? '')
        })
      }),
    )
    const facts = [...measures, ...names('mark').filter((m) => !endpoints.has(m.name))]
    const unread = facts.filter((fact) => !reader.includes(fact.name))
    expect(
      unread.map((f) => `${f.name} (${f.where})`),
      `these marks are written and nothing reads them — add them to ${READER}`,
    ).toEqual([])
  })

  it('is looking at real marks, so an empty walk cannot pass', () => {
    // The count is a floor, not an inventory: it fails when the scan stops seeing the
    // product rather than when the product grows another mark.
    expect(names('mark').length).toBeGreaterThanOrEqual(4)
    expect(names('measure').length).toBeGreaterThanOrEqual(2)
    expect(sources().length).toBeGreaterThan(100)
  })
})
