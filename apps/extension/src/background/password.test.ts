import { describe, expect, it, vi } from 'vitest'
import type { AuditEntry } from '@okolos/contracts'

import { checkSubmittedPassword, COMMON_SHA1 } from './password.js'

const RARE = 'A1B2C3D4E5F60718293A4B5C6D7E8F9012345678'

function deps(overrides: Partial<Parameters<typeof checkSubmittedPassword>[1]> = {}) {
  const audit: AuditEntry[] = []
  return {
    audit,
    deps: {
      writeAudit: async (entry: AuditEntry) => {
        audit.push(entry)
      },
      now: () => '2026-08-05T12:00:00.000Z',
      newId: () => 'a-1',
      transport: async () => new Response(''),
      ...overrides,
    },
  }
}

describe('the worst passwords cost nothing', () => {
  it('are answered from the built-in list with no request', async () => {
    const transport = vi.fn()
    const { deps: d, audit } = deps({ transport })
    const verdict = await checkSubmittedPassword(COMMON_SHA1[2] as string, d)

    expect(verdict).toMatchObject({ compromised: true, offline: true })
    expect(transport).not.toHaveBeenCalled()
    // And nothing is written to the audit log either, because nothing was sent.
    expect(audit).toEqual([])
  })
})

describe('everything else', () => {
  it('sends five characters and says so in the audit log', async () => {
    const { deps: d, audit } = deps({
      transport: async () => new Response(`${RARE.slice(5)}:9\n`),
    })
    const verdict = await checkSubmittedPassword(RARE, d)

    expect(verdict).toMatchObject({ compromised: true, count: 9 })
    expect(audit).toHaveLength(1)
    expect(audit[0]).toMatchObject({ purpose: 'password-range', outcome: 'sent' })
    expect(audit[0]?.payloadShape).toBe(`hash-prefix:${RARE.slice(0, 5)}`)
  })

  it('asks for a padded response, so the size gives nothing away', async () => {
    const seen: Array<Record<string, string> | undefined> = []
    const { deps: d } = deps({
      transport: async (spec: { headers?: Record<string, string> }) => {
        seen.push(spec.headers)
        return new Response('')
      },
    })
    await checkSubmittedPassword(RARE, d)
    expect(seen[0]).toMatchObject({ 'Add-Padding': 'true' })
  })

  it('never puts the password or its full digest in the request', async () => {
    const urls: string[] = []
    const { deps: d } = deps({
      transport: async (spec: { url: string }) => {
        urls.push(spec.url)
        return new Response('')
      },
    })
    await checkSubmittedPassword(RARE, d)

    expect(urls[0]).toContain(RARE.slice(0, 5))
    expect(urls[0]).not.toContain(RARE.slice(5))
  })

  it('reports a failure as a failure, not as a clean password', async () => {
    const { deps: d } = deps({
      transport: async () => {
        throw new Error('offline')
      },
    })
    const verdict = await checkSubmittedPassword(RARE, d)
    expect(verdict.source).toBe('nothing')
    expect(verdict.compromised).toBe(false)
    expect(verdict.explain).toMatch(/could not be checked/i)
  })
})

describe('the built-in list itself', () => {
  it('is what it claims to be: SHA-1 digests, uppercase hex', () => {
    for (const digest of COMMON_SHA1) {
      expect(digest).toMatch(/^[0-9A-F]{40}$/)
    }
  })

  it('contains the digest of "password", computed rather than remembered', async () => {
    // Guarding against exactly the mistake made while writing this file: a
    // hand-typed digest that looks plausible and matches nothing.
    const bytes = await crypto.subtle.digest('SHA-1', new TextEncoder().encode('password'))
    const hex = [...new Uint8Array(bytes)]
      .map((byte) => byte.toString(16).padStart(2, '0'))
      .join('')
      .toUpperCase()
    expect(COMMON_SHA1).toContain(hex)
  })

  it('has no duplicates', () => {
    expect(new Set(COMMON_SHA1).size).toBe(COMMON_SHA1.length)
  })
})
