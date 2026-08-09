import { describe, expect, it } from 'vitest'

import { syncFeed, FEED_URL } from './feed-sync.js'

/**
 * The path that did not exist.
 *
 * Everything downstream of it was built and tested — signature checking,
 * replay refusal, rollback, rule building — and nothing called any of it,
 * because nothing ever fetched a feed. The blocking list was empty on every
 * install and the tests that proved otherwise seeded storage by hand.
 */

function deps(overrides: Partial<Parameters<typeof syncFeed>[0]> & { body?: unknown; status?: number; throws?: unknown } = {}) {
  /** Key first, then its arguments — the shape the journal is handed. */
  const notes: string[] = []
  const refreshed: number[] = []
  const applied: unknown[] = []
  const base = {
    audit: {
      writeAudit: async () => undefined,
      now: () => '2026-08-08T00:00:00.000Z',
      newId: () => 'id',
      transport: async () => {
        if (overrides.throws) throw overrides.throws
        return new Response(JSON.stringify(overrides.body ?? { update: {}, signature: 'x' }), {
          status: overrides.status ?? 200,
        })
      },
    } as never,
    apply: async (signed: unknown) => {
      applied.push(signed)
      return { accepted: true }
    },
    refresh: async () => {
      refreshed.push(1)
      return undefined
    },
    note: async (explainKey: string, ...explainArgs: string[]) => {
      notes.push([explainKey, ...explainArgs].join(' '))
    },
    ...overrides,
  }
  return { deps: base as Parameters<typeof syncFeed>[0], notes, refreshed, applied }
}

describe('pulling the blocking feed', () => {
  it('goes through the audited choke point, like everything else that leaves', async () => {
    const written: unknown[] = []
    const { deps: d } = deps({
      audit: {
        writeAudit: async (entry: unknown) => {
          written.push(entry)
        },
        now: () => '2026-08-08T00:00:00.000Z',
        newId: () => 'id',
        transport: async () => new Response(JSON.stringify({ update: {}, signature: 'x' })),
      } as never,
    })
    await syncFeed(d)
    expect(written.length, 'a feed fetch must be logged before it happens').toBeGreaterThan(0)
  })

  it('applies what it fetched and rebuilds the rules', async () => {
    const { deps: d, applied, refreshed } = deps({ body: { update: { kind: 'snapshot' }, signature: 'sig' } })
    const result = await syncFeed(d)
    expect(result).toEqual({ fetched: true, accepted: true })
    expect(applied).toHaveLength(1)
    expect(refreshed, 'a feed nobody installed is a feed nobody is protected by').toHaveLength(1)
  })

  it('keeps the list in force when the update does not verify', async () => {
    const { deps: d, refreshed, notes } = deps({
      apply: async () => ({ accepted: false, reason: 'bad-signature' }),
    })
    const result = await syncFeed(d)
    expect(result.accepted).toBe(false)
    expect(refreshed, 'rules must not be rebuilt from a feed that was refused').toHaveLength(0)
    expect(notes.join(' ')).toMatch(/feedRefused|bad-signature/i)
  })

  it('says so when the server refuses, rather than failing silently', async () => {
    const { deps: d, notes } = deps({ status: 503 })
    const result = await syncFeed(d)
    expect(result.fetched).toBe(false)
    expect(notes.join(' ')).toMatch(/503/)
  })

  it('says so when the fetch throws, and leaves what is in force alone', async () => {
    const { deps: d, notes, refreshed } = deps({ throws: new Error('offline') })
    const result = await syncFeed(d)
    expect(result.fetched).toBe(false)
    expect(refreshed).toHaveLength(0)
    expect(notes.join(' ')).toMatch(/offline/)
  })

  it('names a feed address that is not a placeholder', async () => {
    // The model descriptor points at `.invalid` on purpose. This one must not:
    // an address nobody can reach is a feed nobody gets.
    expect(FEED_URL).not.toMatch(/\.invalid/)
    expect(FEED_URL).toMatch(/^https:\/\//)
  })
})
