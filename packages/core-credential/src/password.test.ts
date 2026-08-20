import { describe, expect, it, vi } from 'vitest'

import { checkPassword, PREFIX_LENGTH, type PasswordCheckDeps } from './password.js'

/** SHA-1 of "password", uppercase — the canonical example in every corpus. */
const COMMON = '5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8'
const RARE = 'A1B2C3D4E5F60718293A4B5C6D7E8F9012345678'

function deps(overrides: Partial<PasswordCheckDeps> = {}): PasswordCheckDeps {
  return {
    sha1: RARE,
    localSuffixes: () => [],
    fetchRange: async () => ({ body: '0000000000000000000000000000000000:5\n' }),
    ...overrides,
  }
}

describe('a password the device already recognises', () => {
  it('is answered without any request at all', async () => {
    // The point of the ordering: the most common passwords in the world are
    // exactly the ones whose users can least afford the exposure.
    const fetchRange = vi.fn()
    const verdict = await checkPassword(
      deps({
        sha1: COMMON,
        localSuffixes: (prefix) => (prefix === COMMON.slice(0, PREFIX_LENGTH) ? [COMMON.slice(PREFIX_LENGTH)] : []),
        fetchRange: fetchRange as unknown as PasswordCheckDeps['fetchRange'],
      }),
    )

    expect(verdict.compromised).toBe(true)
    expect(verdict.offline).toBe(true)
    expect(fetchRange).not.toHaveBeenCalled()
  })

  it('says the answer never left the device', async () => {
    const verdict = await checkPassword(
      deps({ sha1: COMMON, localSuffixes: () => [COMMON.slice(PREFIX_LENGTH)] }),
    )
    expect(verdict.explain).toEqual({ code: 'in-common-list' })
  })
})

describe('a password the device does not recognise', () => {
  it('sends only the first five characters of the fingerprint', async () => {
    const seen: string[] = []
    await checkPassword(
      deps({
        fetchRange: async (prefix) => {
          seen.push(prefix)
          return { body: '' }
        },
      }),
    )
    expect(seen).toEqual([RARE.slice(0, 5)])
    expect(seen[0]).toHaveLength(5)
  })

  it('is reported as compromised when its suffix is in the range', async () => {
    const verdict = await checkPassword(
      deps({ fetchRange: async () => ({ body: `${RARE.slice(PREFIX_LENGTH)}:42\n` }) }),
    )
    expect(verdict).toMatchObject({ compromised: true, count: 42, source: 'range query' })
  })

  it('is reported as clean when it is not', async () => {
    const verdict = await checkPassword(deps())
    expect(verdict.compromised).toBe(false)
    expect(verdict.explain.code).toMatch(/absent|found/)
  })

  it('matches a suffix whatever case the server used', async () => {
    const verdict = await checkPassword(
      deps({ fetchRange: async () => ({ body: `${RARE.slice(PREFIX_LENGTH).toLowerCase()}:7\n` }) }),
    )
    expect(verdict.compromised).toBe(true)
  })

  it('does not turn a line it cannot read into a compromise', async () => {
    // This test used to assert the opposite, under a name — "reads a count of
    // zero as a count, not as absence" — that describes a different case than
    // the one it fed. Its body sends `:not-a-number`, and it required the
    // verdict to be `compromised: true, count: 0`, which reaches the user as
    // "This password appears 0 times in breached data".
    //
    // A sentence refuted by its own number is a false alarm, and a false alarm
    // in a password checker is what teaches people to dismiss the real one.
    // The file already states the principle two describes above: an unanswerable
    // question is not a clean bill of health — and it is not a guilty verdict
    // either.
    const verdict = await checkPassword(
      deps({ fetchRange: async () => ({ body: `${RARE.slice(PREFIX_LENGTH)}:not-a-number\n` }) }),
    )
    expect(verdict.compromised).toBe(false)
    expect(verdict.count).toBeNull()
    expect(verdict.explain).toEqual({ code: 'unreadable' })
  })
})

describe('when the check cannot be made', () => {
  it('does not report a clean password it could not verify', async () => {
    const verdict = await checkPassword(
      deps({
        fetchRange: async () => {
          throw new Error('offline')
        },
      }),
    )
    expect(verdict.source).toBe('nothing')
    expect(verdict.explain.code).toBe('unreachable')
  })
})

describe('what a range response is allowed to mean', () => {
  const SHA1 = '5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8'
  const suffix = SHA1.slice(5)
  const check = (body: string) =>
    checkPassword({
      sha1: SHA1,
      localSuffixes: () => [],
      fetchRange: async () => ({ body, padded: true }),
    })

  it('does not call a padding entry a breach', async () => {
    /**
     * The request carries `Add-Padding: true`, which asks the API to invent
     * entries so the response is a constant size. Those entries are documented
     * as carrying a count of zero, and a client is meant to discard them.
     *
     * This one did not: a zero count reached the verdict as `compromised:
     * true` and produced the sentence "This password appears 0 times in
     * breached data" — a compromise verdict that refutes itself in its own
     * number. A false alarm is what gets a security product uninstalled.
     */
    const verdict = await check(`${suffix}:0`)
    expect(verdict.compromised).toBe(false)
  })

  it('reports a response it cannot read as unread, not as a breach', async () => {
    // The count fell back to zero when it would not parse, and zero was a hit.
    // A line the client cannot read says nothing about the password.
    const verdict = await check(`${suffix}:not-a-number`)
    expect(verdict.compromised).toBe(false)
    expect(verdict.count).toBeNull()
    expect(['unreadable', 'unreachable']).toContain(verdict.explain.code)
  })

  it('still reports a real hit, with its real count', async () => {
    const verdict = await check(`${suffix}:12345`)
    expect(verdict).toMatchObject({ compromised: true, count: 12345 })
  })

  it('is not fooled by a longer suffix that contains ours', async () => {
    expect((await check(`AB${suffix}:9`)).compromised).toBe(false)
  })

  it('reads a response whose lines end in CRLF', async () => {
    expect((await check(`${suffix}:7\r\nOTHER:1\r\n`)).compromised).toBe(true)
  })
})
