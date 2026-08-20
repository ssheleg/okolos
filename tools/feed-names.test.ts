/**
 * An identifier is never shown where a name belongs.
 *
 * `phishing` names a row, a file and a field in a signed update. A site owner
 * whose domain was blocked read it as the reason — on the public status page,
 * on the block screen, and in the journal. The brand pack forbids exactly this
 * by name, and forbidding it in prose had not been enough.
 *
 * Three things have to agree, and the failure mode of each is silence:
 *
 *   1. the worker publishes the identifiers `OUR_FEEDS` claims;
 *   2. the Russian literal in `OUR_FEEDS` is the Russian name in the catalogue **and**
 *      the one the brand pack fixes;
 *   3. no surface interpolates a raw feed identifier into copy.
 */

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { OUR_FEEDS } from '../packages/core-feeds/src/display.js'

import { filesUnder } from './tree.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const read = (p: string): string => readFileSync(path.join(root, p), 'utf8')

const catalogue = (locale: string): Record<string, { message: string }> =>
  JSON.parse(read(`apps/extension/_locales/${locale}/messages.json`))

describe('the lists this project names', () => {
  it('claims at least one, or none of this means anything', () => {
    expect(Object.keys(OUR_FEEDS).length).toBeGreaterThan(0)
  })

  it('has a catalogue message for every list it claims', () => {
    const ru = catalogue('ru')
    const en = catalogue('en')
    const missing = Object.values(OUR_FEEDS).flatMap((name) =>
      [
        ru[name.messageKey] === undefined ? `ru:${name.messageKey}` : null,
        en[name.messageKey] === undefined ? `en:${name.messageKey}` : null,
      ].filter((x): x is string => x !== null),
    )
    expect(missing, 'a list whose name has no message shows its identifier').toEqual([])
  })

  it('says the same thing in Russian in both places', () => {
    /**
     * The worker has no catalogue and reads `ru` from the table directly. Two homes for
     * one name drift, and this is the join that catches it.
     *
     * It used to check `en`, which was the name the *proxy* printed onto `lang="ru"`
     * pages — so the gate agreed with the code and not with the reader (B-24). The
     * English literal is gone: the extension resolves English through the catalogue,
     * where it already lived.
     */
    const ru = catalogue('ru')
    const disagreements = Object.entries(OUR_FEEDS)
      .filter(([, name]) => ru[name.messageKey]?.message !== name.ru)
      .map(([id, name]) => `${id}: table says "${name.ru}", catalogue says "${ru[name.messageKey]?.message}"`)
    expect(disagreements).toEqual([])
  })

  it('says what the brand pack says, which is the source neither of them is', () => {
    /**
     * The row's own condition: the gate must check the brand pack rather than the
     * current string. `docs/brand/terminology.md` fixes one name per concept per
     * language — a table and a catalogue agreeing with each other while both drift from
     * it is exactly the shape that let an English name onto a Russian page.
     */
    const table = read('docs/brand/terminology.md')
    const rows = [...table.matchAll(/^\| `(\w+)` \| ([^|]+) \|/gm)].map((found) => ({
      id: (found[1] as string).trim(),
      ru: (found[2] as string).trim(),
    }))
    expect(rows.length, 'the terminology table did not parse — this check proves nothing').toBeGreaterThan(0)

    const wrong = rows
      .filter((row) => OUR_FEEDS[row.id] !== undefined && OUR_FEEDS[row.id]?.ru !== row.ru)
      .map((row) => `${row.id}: code says "${OUR_FEEDS[row.id]?.ru}", the brand pack says "${row.ru}"`)
    expect(wrong).toEqual([])
  })

  it('is the same set the worker will serve', () => {
    // `PUBLISHED_FEEDS` decides both which feed `/feeds/:name` serves and whose
    // appeal is ours to act on. A set built by hand beside this table is a
    // permission check that can quietly disagree with it.
    expect(read('apps/proxy/src/router.ts')).toContain('new Set(Object.keys(OUR_FEEDS))')
  })
})

describe('no surface writes a feed identifier into copy', () => {
  /** Source files that could put a sentence in front of a person. */
  const surfaces: string[] = ['apps/extension/src', 'apps/proxy/src', 'packages/ui/src']
    .flatMap((dir) => filesUnder(path.join(root, dir), '.ts'))
    .filter((file) => !file.endsWith('.test.ts'))
    .map((file) => path.relative(root, file))

  it('is reading real files', () => {
    expect(surfaces.length).toBeGreaterThan(30)
  })

  it('interpolates a name, never `feed.name` or `row.feed`, into a sentence', () => {
    /**
     * The shape that caused this: `` `listed by ${feed.name}` `` — a template
     * whose hole is filled by the identifier. Passing it through
     * `displayFeedNameEn` or `displayFeedName` is the fix, and both are visible
     * inside the interpolation, so the check is on the raw form only.
     */
    const offences = surfaces.flatMap((file) => {
      const text = read(file)
      return [...text.matchAll(/\$\{\s*(?:[\w.?]*\b(?:feed|row)\b[\w.?]*)\s*\}/g)]
        .map((m) => m[0] as string)
        .filter((hole) => !hole.includes('display'))
        .map((hole) => `${file}: ${hole}`)
    })
    expect(offences, 'these put a feed identifier straight into copy').toEqual([])
  })
})
