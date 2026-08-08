/**
 * Every place a button sends someone must exist when they get there.
 *
 * Three buttons in this extension opened a destination nothing served:
 *
 *   - `options.html#appeal` — "I own this site" on the block interstitial. No
 *     appeal section exists anywhere; the owner landed on their own settings.
 *   - `options.html#queue` — "See what to do first", the primary action of the
 *     first run. SCN-002 promises the findings queue opens.
 *   - `options.html#reuse=<name>` — "check reuse" on a leak. SCR-08 promises
 *     the other places that password is used.
 *
 * All three passed every gate this repo had. A renderer's tests prove the
 * button draws and fires its handler; the handler's own tests prove it builds a
 * URL. Whether anything is listening at that URL is a question neither asks —
 * and `location.hash` was read in exactly one place, for exactly one key.
 *
 * So: collect the destinations the source produces, and require each to have a
 * reader. A page must be one the build emits. A hash key must be matched by
 * code that reads `location.hash`.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const extension = path.join(root, 'apps/extension/src')

function sources(dir: string): Array<{ file: string; text: string }> {
  const out: Array<{ file: string; text: string }> = []
  const walk = (d: string): void => {
    for (const name of readdirSync(d)) {
      const p = path.join(d, name)
      if (statSync(p).isDirectory()) walk(p)
      else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) {
        out.push({ file: path.relative(root, p), text: readFileSync(p, 'utf8') })
      }
    }
  }
  walk(dir)
  return out
}

/** The pages `tools/build.mjs` emits, which are the only ones `getUrl` can name. */
function builtPages(): Set<string> {
  const build = readFileSync(path.join(root, 'tools/build.mjs'), 'utf8')
  // Keys are written both ways in build.mjs — `options:` and `'first-run':`.
  const listed = [...build.matchAll(/'?([a-z-]+)'?:\s*path\.join\(app,\s*'src\/[^']+\.html'\)/g)]
  return new Set(listed.map((m) => `${m[1] as string}.html`))
}

/** Every `runtime.getUrl('…')` destination written as a literal. */
function destinations(): Array<{ file: string; target: string }> {
  const out: Array<{ file: string; target: string }> = []
  for (const { file, text } of sources(extension)) {
    for (const m of text.matchAll(/getUrl\(\s*[`'"]([^`'"]+)[`'"]/g)) {
      out.push({ file, target: m[1] as string })
    }
  }
  return out
}

/**
 * Keys something actually reads out of `location.hash`.
 *
 * Scanning a whole file for `#key` would let a file that both produces a
 * destination and reads some other hash approve its own dangling one — which is
 * exactly what `options.html#reuse=` did on the first run of this gate. So a
 * key counts as read only where it appears in a matching expression: inside a
 * regex literal, or on a line that names `location.hash`.
 */
function readHashKeys(): Set<string> {
  const keys = new Set<string>()
  const add = (key: string | undefined): void => {
    if (key !== undefined) keys.add(key.toLowerCase())
  }
  for (const { text } of sources(extension)) {
    if (!text.includes('location.hash')) continue
    // Comments go first: a docstring that explains what `#queue` is for reads,
    // to a scanner, exactly like code that handles it. Removing the line that
    // handled it left this gate green until the prose was stripped too.
    // Producers go next — `getUrl` literals — because otherwise a file that
    // reads one hash vouches for a dangling one it also writes.
    const code = text
      .replace(/\/\*[\s\S]*?\*\//g, '')
      .replace(/(^|[^:])\/\/[^\n]*/g, '$1')
      .replace(/getUrl\(\s*[`'"][^`'"]+[`'"]\s*\)/g, 'getUrl()')
    for (const m of code.matchAll(/#([a-z][a-z0-9-]*)/gi)) add(m[1])
  }
  return keys
}

describe('every destination a button sends someone to', () => {
  it('is a page the build actually emits', () => {
    const pages = builtPages()
    const missing = destinations()
      .map(({ file, target }) => ({ file, page: target.split('#')[0] as string }))
      .filter(({ page }) => !pages.has(page))
      .map(({ file, page }) => `${file} → ${page}`)

    expect(
      missing,
      `these open a page the build does not emit:\n  ${missing.join('\n  ')}`,
    ).toEqual([])
  })

  it('has something reading the hash it carries', () => {
    const read = readHashKeys()
    const dangling = destinations()
      .filter(({ target }) => target.includes('#'))
      .map(({ file, target }) => ({
        file,
        key: (target.split('#')[1] ?? '').split('=')[0]?.toLowerCase() ?? '',
      }))
      .filter(({ key }) => key !== '' && !read.has(key))
      .map(({ file, key }) => `${file} → #${key}`)

    expect(
      dangling,
      `these send someone to a hash nothing reads, so the page opens as if the button had done nothing:\n  ${dangling.join('\n  ')}`,
    ).toEqual([])
  })

  it('is looking at real destinations, not an empty list', () => {
    // Both assertions above pass vacuously if the extraction breaks. The repo
    // has several of each; if that stops being true, this fails first and says
    // so, rather than the gate quietly approving everything.
    expect(builtPages().size).toBeGreaterThanOrEqual(4)
    expect(destinations().length).toBeGreaterThanOrEqual(3)
    expect(readHashKeys().size).toBeGreaterThanOrEqual(1)
  })
})
