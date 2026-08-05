import { describe, expect, it, vi } from 'vitest'
import type { AuditEntry } from '@okolos/contracts'

import { CAVALIER, hibp, lookupLeaks, type LeakSource } from './leaks.js'

function deps(response: () => Promise<Response>) {
  const audit: AuditEntry[] = []
  return {
    audit,
    deps: {
      writeAudit: async (entry: AuditEntry) => {
        audit.push(entry)
      },
      now: () => '2026-08-05T12:00:00.000Z',
      newId: () => 'a-1',
      transport: response,
    },
  }
}

const silent: LeakSource = {
  name: 'Quiet Source',
  unavailable: null,
  lookup: async () => {
    throw new Error('the request timed out')
  },
}

describe('a source that cannot run', () => {
  it('says why instead of being dropped', async () => {
    const { deps: d } = deps(async () => new Response('[]'))
    const inventory = await lookupLeaks('a@b.test', [hibp(null)], d)

    expect(inventory.sources[0]).toMatchObject({
      answered: false,
      why: 'no API key is configured for this source',
    })
    expect(inventory.complete).toBe(false)
  })

  it('never makes a request it cannot complete', async () => {
    const transport = vi.fn()
    const { deps: d } = deps(transport as unknown as () => Promise<Response>)
    await lookupLeaks('a@b.test', [hibp(null)], d)
    expect(transport).not.toHaveBeenCalled()
  })
})

describe('a source that fails mid-flight', () => {
  it('does not take the others with it', async () => {
    const { deps: d } = deps(async () => new Response(JSON.stringify({ stealers: [] })))
    const inventory = await lookupLeaks('a@b.test', [silent, CAVALIER], d)

    expect(inventory.sources.map((source) => source.answered)).toEqual([false, true])
  })

  it('is not mistaken for having nothing to report', async () => {
    const { deps: d } = deps(async () => new Response('[]'))
    const inventory = await lookupLeaks('a@b.test', [silent], d)
    expect(inventory.coverage).toMatch(/could not be reached/i)
  })
})

describe('what the audit log records', () => {
  it('names the purpose and shows the address only in part', async () => {
    const { deps: d, audit } = deps(async () => new Response(JSON.stringify({ stealers: [] })))
    await lookupLeaks('sergey@example.test', [CAVALIER], d)

    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({ purpose: 'leak-lookup', outcome: 'sent' })
    expect(audit[0]?.payloadShape).toBe('email:s***@example.test')
    expect(audit[0]?.payloadShape).not.toContain('sergey')
  })
})

describe('reading what a source returned', () => {
  it('turns Cavalier stealer records into dated leaks', async () => {
    const { deps: d } = deps(
      async () =>
        new Response(JSON.stringify({ stealers: [{ date_compromised: '2025-11-02T00:00:00Z' }] })),
    )
    const inventory = await lookupLeaks('a@b.test', [CAVALIER], d)
    expect(inventory.leaks[0]).toMatchObject({ occurredAt: '2025-11-02' })
  })

  it('treats a 404 from the breach API as "nothing found", not as a failure', async () => {
    const { deps: d } = deps(async () => new Response('', { status: 404 }))
    const inventory = await lookupLeaks('a@b.test', [hibp('key')], d)
    expect(inventory.sources[0]?.answered).toBe(true)
    expect(inventory.leaks).toEqual([])
  })
})
