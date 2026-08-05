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
    expect(verdict.explain).toMatch(/nothing was sent/i)
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
    expect(verdict.explain).toMatch(/only the first five/i)
  })

  it('matches a suffix whatever case the server used', async () => {
    const verdict = await checkPassword(
      deps({ fetchRange: async () => ({ body: `${RARE.slice(PREFIX_LENGTH).toLowerCase()}:7\n` }) }),
    )
    expect(verdict.compromised).toBe(true)
  })

  it('reads a count of zero as a count, not as absence', async () => {
    const verdict = await checkPassword(
      deps({ fetchRange: async () => ({ body: `${RARE.slice(PREFIX_LENGTH)}:not-a-number\n` }) }),
    )
    expect(verdict.compromised).toBe(true)
    expect(verdict.count).toBe(0)
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
    expect(verdict.explain).toMatch(/could not be checked/i)
  })
})
