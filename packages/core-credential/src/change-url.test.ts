import { describe, expect, it } from 'vitest'

import { CHANGE_PASSWORD_PATH, changePasswordUrl } from './change-url.js'

/**
 * The address the "change password" button opens, and the strings that must not become
 * one.
 *
 * The host reaching this function comes from an origin, and until 2026-08-20 two callers
 * built the address by concatenation. That gives the host authority over the navigation,
 * and the sentence the user reads names one site while the browser goes to another.
 */
describe('the change-password address', () => {
  it('is the site plus the published path', () => {
    expect(changePasswordUrl('shop.test')).toBe(`https://shop.test${CHANGE_PASSWORD_PATH}`)
  })

  it('refuses a host that hands the authority to somebody else', () => {
    // `https://good.test@evil.test/…` loads evil.test. The banner said good.test.
    expect(changePasswordUrl('good.test@evil.test')).toBeNull()
  })

  it('refuses a host that walks the path', () => {
    expect(changePasswordUrl('shop.test/../../admin')).toBeNull()
    expect(changePasswordUrl('shop.test#')).toBeNull()
  })

  it('refuses a host carrying credentials or a port', () => {
    expect(changePasswordUrl('user:pw@shop.test')).toBeNull()
    expect(changePasswordUrl('shop.test:8443')).toBeNull()
  })

  it('refuses nothing at all rather than producing https:///', () => {
    expect(changePasswordUrl('')).toBeNull()
  })

  it('accepts the host as the browser spells it, whatever the caller typed', () => {
    // An origin's hostname is already lowercase; a host typed by hand may not be.
    expect(changePasswordUrl('SHOP.test')).toBe(`https://shop.test${CHANGE_PASSWORD_PATH}`)
  })

  /**
   * The case only the hostname comparison catches, and the reason it exists.
   *
   * A first version of this test asserted the `@` form and passed with that comparison
   * deleted — the credentials check was catching it, so the comparison had no case of
   * its own and would have been removed by anyone tidying up. This is its case: the URL
   * parser rewrites an internationalised host into punycode, so what gets navigated is
   * not the string the caller named. Every host that legitimately reaches here comes
   * from `new URL(origin).hostname` and is punycode already; a Unicode one means
   * somebody typed it, and the address the user was shown is not the address the browser
   * would open.
   */
  it('refuses a host the parser rewrites into something else', () => {
    // "shоp.test" with a Cyrillic о. Measured, not guessed: the parser returns
    // xn--shp-ted.test, which is not the string anybody was shown.
    expect(changePasswordUrl('sh\u043Ep.test')).toBeNull()
    // The punycode form itself round-trips, so the check refuses the rewrite rather
    // than the alphabet.
    expect(changePasswordUrl('xn--shp-ted.test')).toBe(
      `https://xn--shp-ted.test${CHANGE_PASSWORD_PATH}`,
    )
  })
})
