import { describe, expect, it } from 'vitest'

import { EXPORT_NOTE, exportAll, wipeAll } from './export.js'
import { STORES, WITHHELD_MARKER, WITHHELD_SETTINGS } from './schema.js'

/**
 * Export and wipe, tested where they live.
 *
 * These are the two operations the privacy promise ends in: the user can take
 * everything out, and the user can make everything go. A wipe that half-worked
 * and said it succeeded is the failure this file exists to prevent, and it was
 * covered only through the options page — where what is asserted is that a
 * button was clicked.
 */

function fakeDb(overrides: { failOn?: readonly string[] } = {}) {
  const cleared: string[] = []
  return {
    cleared,
    db: {
      getAll: async (store: string) => [{ id: `${store}-1` }],
      clear: async (store: string) => {
        if (overrides.failOn?.includes(store)) throw new Error('nope')
        cleared.push(store)
      },
    } as never,
  }
}

describe('taking everything out', () => {
  it('includes every store the schema declares, not a chosen few', async () => {
    // A store added later and forgotten here is data the user cannot export
    // and does not know they have.
    //
    // Equality became containment on purpose: the file now carries one key that
    // is not a store, saying what was withheld from it and why. Written as
    // "every store is present" rather than "these keys exactly", so the check
    // still fails on a forgotten store — which is the thing it was protecting —
    // and the note below asserts the extra key separately rather than being
    // waved through by a loosened comparison.
    const { db } = fakeDb()
    const dump = JSON.parse(await exportAll(db)) as Record<string, unknown>
    for (const store of STORES) {
      expect(Object.keys(dump), `${store} is missing from the export`).toContain(store)
    }
    expect(Object.keys(dump)).toContain(EXPORT_NOTE)
    expect(Object.keys(dump)).toHaveLength(STORES.length + 1)
  })

  it('produces something a person can read', async () => {
    const { db } = fakeDb()
    expect(await exportAll(db)).toContain('\n')
  })
})

describe('what the file must not carry out', () => {
  /**
   * The defect these exist for: `settings` holds `reuse:key`, the HMAC key the
   * password-reuse index is tagged with, and `reuse` holds the tags. Exported
   * together — which is what "every store, verbatim" did — whoever receives the
   * file can run a dictionary of common passwords against the tags and recover
   * which password is used on which sites. That is the one inference the index is
   * built so that only the device can make.
   *
   * Asserted on the *bytes of the file*, not on which stores were visited: a
   * check that counts stores is exactly the check that passed while this was
   * true.
   */
  const SECRET_KEY = 'sBGmuC/H+8xnjPMcuIkGkQ7gzrjMlprXvRIiT2TrjSY='
  const SECRET_TOKEN = 'hibp-live-0123456789abcdef'

  function dbWithSecrets() {
    return {
      getAll: async (store: string) => {
        if (store === 'settings')
          return [
            { key: 'reuse:key', value: SECRET_KEY },
            { key: 'hibp:apiKey', value: SECRET_TOKEN },
            { key: 'seen:bank.test', value: '2026-08-19T00:00:00.000Z' },
          ]
        if (store === 'reuse') return [{ tag: 'a1b2c3', host: 'bank.test', firstSeen: '2026-08-19' }]
        if (store === 'models') return [{ id: 'stage3', bytes: new ArrayBuffer(20_971_520) }]
        return []
      },
      clear: async () => undefined,
    } as never
  }

  it('carries neither secret, by value, anywhere in the file', async () => {
    const json = await exportAll(dbWithSecrets())
    expect(json, 'the device key reached the export').not.toContain(SECRET_KEY)
    expect(json, "the user's HIBP credential reached the export").not.toContain(SECRET_TOKEN)
  })

  it('still carries the reuse tags, which are about the user', async () => {
    // Withholding these would be the other failure: the whole answer the feature
    // gives is "these sites share a password", and without the key a tag says
    // nothing more than that.
    const json = await exportAll(dbWithSecrets())
    expect(json).toContain('bank.test')
    expect(json).toContain('a1b2c3')
  })

  it('leaves a marker where a value was taken out, rather than dropping the row', async () => {
    // A file that silently omits something is a file whose completeness nobody
    // can check — including the person it is about.
    const dump = JSON.parse(await exportAll(dbWithSecrets())) as {
      settings: Array<{ key: string; value: string }>
    }
    const keys = dump.settings.map((row) => row.key)
    for (const secret of WITHHELD_SETTINGS) expect(keys).toContain(secret)

    // Collected first and asserted unconditionally. Written as `if (secret)
    // expect(...)` inside the loop it read the same and proved less: a filter that
    // stops matching leaves the loop body unentered and the test green, which is
    // what `tools/test-quality.test.ts` refuses — and it caught this one.
    const withheldRows = dump.settings.filter((row) => WITHHELD_SETTINGS.has(row.key))
    expect(withheldRows).toHaveLength(WITHHELD_SETTINGS.size)
    expect(withheldRows.map((row) => row.value)).toEqual(
      withheldRows.map(() => WITHHELD_MARKER),
    )
  })

  it('says in the file what was withheld and why', async () => {
    const dump = JSON.parse(await exportAll(dbWithSecrets())) as Record<string, string>
    const note = dump[EXPORT_NOTE]
    expect(note).toContain('reuse:key')
    expect(note).toContain('hibp:apiKey')
    expect(note, 'the note states what was taken and not why').toMatch(/recover|protect/)
  })

  it('states the model weights by size instead of rendering them as {}', async () => {
    // `JSON.stringify` turns an ArrayBuffer into `{}`, so the previous version
    // claimed to hold everything while writing two characters for twenty
    // megabytes — an omission shaped exactly like data.
    const json = await exportAll(dbWithSecrets())
    expect(json).toContain('20971520 bytes')
    expect(json, 'an ArrayBuffer still serialised as an empty object').not.toMatch(
      /"bytes":\s*\{\s*\}/,
    )
  })

  it('says nothing was withheld when nothing was', async () => {
    // Otherwise the note becomes decoration: present on every file, therefore
    // read on none.
    const { db } = fakeDb()
    const dump = JSON.parse(await exportAll(db)) as Record<string, string>
    expect(dump[EXPORT_NOTE]).toBe('Nothing was withheld from this file.')
  })
})

describe('making everything go', () => {
  it('clears every store', async () => {
    const { db, cleared } = fakeDb()
    const result = await wipeAll(db)
    expect(result.ok).toBe(true)
    expect(cleared.sort()).toEqual([...STORES].sort())
  })

  it('does not report success when a store refused', async () => {
    const failing = STORES[1] as string
    const { db } = fakeDb({ failOn: [failing] })
    const result = await wipeAll(db)
    expect(result.ok).toBe(false)
    expect(result.failed).toContain(failing)
  })

  it('keeps going after one store fails, rather than stopping there', async () => {
    // Stopping would leave the rest untouched while reporting one failure, and
    // the user would read "mostly done" as done.
    const failing = STORES[0] as string
    const { db, cleared } = fakeDb({ failOn: [failing] })
    await wipeAll(db)
    expect(cleared).toHaveLength(STORES.length - 1)
  })
})
