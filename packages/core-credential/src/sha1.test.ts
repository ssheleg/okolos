import { describe, expect, it } from 'vitest'

import { sha1Hex } from './sha1.js'

/**
 * Ours must agree with the browser's, and that is a test rather than a hope.
 *
 * `crypto.subtle` is `[SecureContext]` and the manifest matches plain-HTTP pages,
 * so on any `http://` page the platform's digest threw and the password check's
 * `catch` swallowed it — the reuse and breach check did not run at all, on exactly
 * the pages where a password sent in the clear matters most.
 */

/** The platform's implementation, for the comparison this file exists to make. */
async function platformSha1(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-1', new TextEncoder().encode(text))
  return [...new Uint8Array(digest)]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}

describe('the standard vectors', () => {
  // FIPS 180-4 and the two everybody knows. A wrong implementation that happens
  // to be self-consistent passes nothing here.
  it.each([
    ['', 'DA39A3EE5E6B4B0D3255BFEF95601890AFD80709'],
    ['abc', 'A9993E364706816ABA3E25717850C26C9CD0D89D'],
    ['password', '5BAA61E4C9B93F3F0682250B6CF8331B7EE68FD8'],
    [
      'abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq',
      '84983E441C3BD26EBAAE4AA1F95129E5E54670F1',
    ],
  ])('hashes %j', (input, expected) => {
    expect(sha1Hex(input)).toBe(expected)
  })
})

describe('agreement with the platform, which is what makes this a replacement', () => {
  it.each([
    'a',
    'hunter2',
    'correct horse battery staple',
    // 55, 56 and 64 bytes: the padding boundaries, where a hand-written
    // implementation goes wrong and a self-consistent one stays wrong.
    'x'.repeat(55),
    'x'.repeat(56),
    'x'.repeat(63),
    'x'.repeat(64),
    'x'.repeat(65),
    'x'.repeat(1000),
    // Non-ASCII, because a password field takes it and the encoding decides the
    // bytes: a wrong encoding gives a wrong prefix and a wrong breach answer.
    'пароль',
    'p@ssw0rd — with an em dash',
    '👍🏽 emoji',
  ])('agrees on %j', async (input) => {
    expect(sha1Hex(input)).toBe(await platformSha1(input))
  })

  it('agrees on a long random string, so the comparison is not only on chosen inputs', async () => {
    const bytes = new Uint8Array(2048)
    crypto.getRandomValues(bytes)
    const text = [...bytes].map((b) => String.fromCharCode(32 + (b % 90))).join('')
    expect(sha1Hex(text)).toBe(await platformSha1(text))
  })
})

describe('what the range API needs', () => {
  it('returns upper-case hex, forty characters', () => {
    // The prefix sent to Have I Been Pwned is the first five characters, and the
    // API compares them case-sensitively.
    const digest = sha1Hex('password')
    expect(digest).toMatch(/^[0-9A-F]{40}$/)
    expect(digest.slice(0, 5)).toBe('5BAA6')
  })
})
