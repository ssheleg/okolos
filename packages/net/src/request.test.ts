import { describe, expect, it, vi } from 'vitest'
import type { AuditEntry } from '@okolos/contracts'

import { RedactionError, request } from './request.js'
import type { RequestDeps, RequestSpec } from './request.js'

function spec(overrides: Partial<RequestSpec> = {}): RequestSpec {
  return {
    url: 'https://api.pwnedpasswords.com/range/5BAA6',
    method: 'GET',
    purpose: 'password-range',
    payloadShape: 'hash-prefix:5BAA6',
    triggeredBy: 'user:password-check',
    ...overrides,
  }
}

function deps(overrides: Partial<RequestDeps> = {}): RequestDeps & { calls: string[] } {
  const calls: string[] = []
  const base: RequestDeps = {
    writeAudit: async (entry: AuditEntry) => {
      calls.push(`audit:${entry.outcome}`)
    },
    transport: async () => {
      calls.push('transport')
      return new Response('ok', { status: 200 })
    },
    now: () => '2026-08-04T12:00:00.000Z',
    newId: () => 'a-1',
  }
  return { ...base, ...overrides, calls }
}

describe('request — the audit entry is a precondition, not a record', () => {
  it('writes the audit entry before the transport runs', async () => {
    const d = deps()
    await request(spec(), d)
    expect(d.calls).toEqual(['audit:sent', 'transport'])
  })

  it('does not send at all when the audit write fails', async () => {
    const d = deps({
      writeAudit: async () => {
        throw new Error('storage unavailable')
      },
    })

    await expect(request(spec(), d)).rejects.toThrow(/audit/i)
    expect(d.calls).not.toContain('transport')
  })

  it('records destination, purpose and payload shape verbatim', async () => {
    const written: AuditEntry[] = []
    const d = deps({
      writeAudit: async (entry) => {
        written.push(entry)
      },
    })

    await request(spec(), d)

    expect(written).toHaveLength(1)
    expect(written[0]).toMatchObject({
      destination: 'api.pwnedpasswords.com',
      purpose: 'password-range',
      payloadShape: 'hash-prefix:5BAA6',
      triggeredBy: 'user:password-check',
      outcome: 'sent',
    })
  })

  it('logs a host, never a path with parameters', async () => {
    // A real destination, because the destination is checked now: the test used
    // `feeds.example.test` with the password-range purpose, which reads fine on a
    // page and is a host that purpose may not reach.
    const written: AuditEntry[] = []
    const d = deps({
      writeAudit: async (entry) => {
        written.push(entry)
      },
    })

    await request(spec({ url: 'https://api.pwnedpasswords.com/range/5BAA6?v=3' }), d)

    expect(written[0]?.destination).toBe('api.pwnedpasswords.com')
  })
})

describe('redactor — catches the leak in development, not after release', () => {
  const forbidden: Array<[string, RequestSpec]> = [
    ['an email address in the url', spec({ url: 'https://api.test/check?e=user@example.com' })],
    [
      'a full page url in the body',
      spec({ method: 'POST', body: 'page=https://bank.example.test/account?token=abc' }),
    ],
    ['markup from the page', spec({ method: 'POST', body: '<div class="x">secret</div>' })],
  ]

  for (const [name, bad] of forbidden) {
    it(`refuses ${name}`, async () => {
      const d = deps()
      await expect(request(bad, d)).rejects.toBeInstanceOf(RedactionError)
      expect(d.calls).toEqual(['audit:blocked-by-redactor'])
    })
  }

  it('allows a hash prefix, which is the whole point of k-anonymity', async () => {
    const d = deps()
    await expect(request(spec(), d)).resolves.toBeInstanceOf(Response)
  })
})

describe('transport failure', () => {
  it('records the failure and rethrows rather than swallowing it', async () => {
    const written: AuditEntry[] = []
    const d = deps({
      writeAudit: async (entry) => {
        written.push(entry)
      },
      transport: async () => {
        throw new Error('offline')
      },
    })

    await expect(request(spec(), d)).rejects.toThrow('offline')
    expect(written.map((e) => e.outcome)).toEqual(['sent', 'failed'])
  })
})

describe('a malformed request is refused, not crashed through', () => {
  it('rejects an unparseable url before anything else happens', async () => {
    const d = deps()
    await expect(request(spec({ url: 'not a url' }), d)).rejects.toThrow(/not a valid URL/)
    expect(d.calls).not.toContain('transport')
  })
})

describe('purpose is closed', () => {
  it('rejects a purpose the audit panel has no wording for', async () => {
    const d = deps()
    const bogus = spec({ purpose: 'exfiltrate' as never })
    await expect(request(bogus, d)).rejects.toThrow(/purpose/i)
    expect(d.calls).not.toContain('transport')
  })
})

describe('a spy cannot go around it', () => {
  it('never touches the global fetch', async () => {
    const globalFetch = vi.spyOn(globalThis, 'fetch')
    const d = deps()
    await request(spec(), d)
    expect(globalFetch).not.toHaveBeenCalled()
    globalFetch.mockRestore()
  })
})
