/**
 * The catalogue, held to the same standard as the code that reads it.
 *
 * A missing key is not a blank space — the resolver returns `[key]`, on purpose,
 * so the defect is visible rather than silent. That is the right behaviour at
 * runtime and a terrible thing to discover in a listing, so it is checked here:
 * both locales carry the same keys, every key a renderer asks for exists, and
 * every key in the catalogue is asked for by something.
 *
 * The last of those is the one that matters most over time. A catalogue only
 * ever grows, and a message nobody reads is a translation somebody paid for and
 * a line the next person has to decide about.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const localesDir = path.join(root, 'apps/extension/_locales')

type Catalogue = Record<string, { message: string }>

const locales = readdirSync(localesDir)
const read = (locale: string): Catalogue =>
  JSON.parse(readFileSync(path.join(localesDir, locale, 'messages.json'), 'utf8')) as Catalogue

/**
 * Every key any source file asks the resolver for, plus the manifest's own.
 *
 * Two shapes count, and the second was added when the first stopped being
 * enough. A surface may call `t('gateBlock')` directly; it may also hold a map
 * from a domain value to a key — `SEVERITY_KEY[props.severity]` — and pass the
 * result. The second is not a workaround, it is the only way to keep the
 * mapping (which severity gets which label) in code while the wording stays in
 * `_locales`; reading only direct calls declared eleven live keys dead.
 *
 * The map form is recognised by a convention the code follows and this gate
 * enforces: it must be a `const NAME_KEY: Record<...>`. A first attempt counted
 * every identifier-shaped literal in any file importing `@okolos/i18n`, which
 * swept up `'panel'` and `'primary'` and then demanded messages for them — a
 * check that widens until it fails is not stricter, it is broken.
 */
function keysAsked(): Set<string> {
  const keys = new Set<string>()
  const walk = (dir: string): void => {
    for (const name of readdirSync(dir)) {
      const p = path.join(dir, name)
      if (statSync(p).isDirectory()) {
        if (name !== 'node_modules' && name !== 'dist') walk(p)
      } else if (name.endsWith('.ts') && !name.endsWith('.test.ts')) {
        const text = readFileSync(p, 'utf8')
        for (const m of text.matchAll(/\bt\(\s*'([a-zA-Z0-9_.]+)'/g)) keys.add(m[1] as string)
        for (const block of text.matchAll(/const \w+_KEY(?::[^=]*)? = \{([\s\S]*?)\n\}/g)) {
          for (const m of (block[1] as string).matchAll(/:\s*'([a-zA-Z0-9_.]+)'/g)) {
            keys.add(m[1] as string)
          }
        }
        // A `*_KEY` array as well as a `*_KEY` record. An ordered list of keys
        // is what a confirmation dialog naming five categories needs, and it is
        // exactly as explicit as the record form: the discipline that keeps a
        // dead message from staying alive is the name ending in `_KEY`, not the
        // bracket that follows it.
        for (const block of text.matchAll(/const \w+_KEY(?::[^=]*)? = \[([\s\S]*?)\n\]/g)) {
          for (const m of (block[1] as string).matchAll(/'([a-zA-Z0-9_.]+)'/g)) {
            keys.add(m[1] as string)
          }
        }
        // A key held in a field of a record — `{ messageKey: 'feedNamePhishing' }`,
        // `{ titleKey: 'leaksGroupOlderTitle', whyKey: … }`. The field name must
        // end in `Key`, so a generic `key:` somewhere else cannot keep a dead
        // message alive.
        for (const m of text.matchAll(/\b\w*Key:\s*'([a-zA-Z0-9_.]+)'/g)) keys.add(m[1] as string)
      }
    }
  }
  walk(path.join(root, 'packages'))
  walk(path.join(root, 'apps/extension/src'))

  for (const target of ['chrome', 'firefox']) {
    const manifest = readFileSync(path.join(root, `apps/extension/manifest.${target}.json`), 'utf8')
    for (const m of manifest.matchAll(/__MSG_([a-zA-Z0-9_]+)__/g)) keys.add(m[1] as string)
  }
  return keys
}

describe('the message catalogue', () => {
  it('ships more than one locale, or none of this means anything', () => {
    expect(locales.length).toBeGreaterThanOrEqual(2)
    expect(locales).toContain('ru')
  })

  it('is declared as the default the product actually ships in', () => {
    // Russian, because that is the market: the phishing feed this product
    // publishes lists Russian banks and the state services portal.
    for (const target of ['chrome', 'firefox']) {
      const manifest = JSON.parse(
        readFileSync(path.join(root, `apps/extension/manifest.${target}.json`), 'utf8'),
      ) as { default_locale?: string }
      expect(manifest.default_locale, `${target} declares no default_locale`).toBe('ru')
    }
  })

  it('carries the same keys in every locale', () => {
    const reference = new Set(Object.keys(read('ru')))
    for (const locale of locales) {
      const here = new Set(Object.keys(read(locale)))
      const missing = [...reference].filter((k) => !here.has(k))
      const extra = [...here].filter((k) => !reference.has(k))
      expect(missing, `${locale} is missing keys ru has`).toEqual([])
      expect(extra, `${locale} has keys ru does not`).toEqual([])
    }
  })

  it('leaves no message empty, which reads as a working screen with nothing on it', () => {
    for (const locale of locales) {
      for (const [key, entry] of Object.entries(read(locale))) {
        expect(entry.message.trim(), `${locale}/${key} is empty`).not.toBe('')
      }
    }
  })

  it('has a message for every key the code and the manifests ask for', () => {
    const catalogue = read('ru')
    const missing = [...keysAsked()].filter((key) => catalogue[key] === undefined).sort()
    expect(
      missing,
      `these would render as [key] on a real screen:\n  ${missing.join('\n  ')}`,
    ).toEqual([])
  })

  it('has nothing nobody asks for', () => {
    const asked = keysAsked()
    const orphans = Object.keys(read('ru'))
      .filter((key) => !asked.has(key))
      .sort()
    expect(
      orphans,
      `translated and never shown:\n  ${orphans.join('\n  ')}`,
    ).toEqual([])
  })

  it('is looking at real keys, not an empty extraction', () => {
    // Both assertions above pass vacuously if the scan breaks.
    expect(keysAsked().size).toBeGreaterThanOrEqual(8)
  })
})

describe('the catalogue in the format the browser will actually parse', () => {
  /**
   * This is not pedantry about syntax. A catalogue Chrome cannot parse does not
   * produce a broken string — it produces **no extension**: no service worker,
   * no content script, and every end-to-end test failing at fixture setup.
   *
   * A first version of this catalogue wrote `$1` straight into the message,
   * which is not the platform's convention however reasonable it looks. Chrome
   * requires named placeholders and treats a bare `$` as an error. The cost of
   * learning that was a suite that ran for ten minutes and failed 72 times at
   * the same line.
   */
  /**
   * Take out what is legal, then look at what is left. A regex that tries to
   * spot the illegal `$` directly flags the closing one of every placeholder —
   * measured, on this very catalogue, before this was written that way.
   */
  const leftoverDollars = (message: string): string =>
    message.replace(/\$[A-Za-z0-9_]+\$/g, '').replace(/\$\$/g, '')

  it('leaves no bare $ in any message, which is what Chrome refuses', () => {
    for (const locale of locales) {
      for (const [key, entry] of Object.entries(read(locale))) {
        expect(
          leftoverDollars(entry.message).includes('$'),
          `${locale}/${key}: "${entry.message}" — a $ outside a declared placeholder`,
        ).toBe(false)
      }
    }
  })

  it('declares every placeholder its messages use', () => {
    for (const locale of locales) {
      const catalogue = JSON.parse(
        readFileSync(path.join(localesDir, locale, 'messages.json'), 'utf8'),
      ) as Record<string, { message: string; placeholders?: Record<string, { content: string }> }>

      for (const [key, entry] of Object.entries(catalogue)) {
        const used = [...entry.message.matchAll(/\$([A-Za-z0-9_]+)\$/g)].map((m) =>
          (m[1] as string).toLowerCase(),
        )
        const declared = Object.keys(entry.placeholders ?? {}).map((n) => n.toLowerCase())
        for (const name of used) {
          expect(declared, `${locale}/${key} uses $${name}$ and declares no such placeholder`).toContain(
            name,
          )
        }
        for (const name of declared) {
          expect(used, `${locale}/${key} declares ${name} and never uses it`).toContain(name)
        }
      }
    }
  })

  it('points every placeholder at a substitution slot', () => {
    for (const locale of locales) {
      const catalogue = JSON.parse(
        readFileSync(path.join(localesDir, locale, 'messages.json'), 'utf8'),
      ) as Record<string, { placeholders?: Record<string, { content: string }> }>
      for (const [key, entry] of Object.entries(catalogue)) {
        for (const [name, place] of Object.entries(entry.placeholders ?? {})) {
          expect(place.content, `${locale}/${key}.${name}`).toMatch(/^\$\d+$/)
        }
      }
    }
  })
})
