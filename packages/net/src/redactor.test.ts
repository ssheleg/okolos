import { describe, expect, it } from 'vitest'

import { findForbiddenContent } from './redactor.js'

/**
 * The redactor's own tests.
 *
 * It had none until 2026-08-08 — it was exercised only through
 * `request.test.ts`, where what is asserted is that a forbidden request is
 * refused, not what counts as forbidden. A guard covered only through its
 * caller is a guard whose rules nobody has read back.
 */

describe('what the guard already caught', () => {
  it('an address in the query', () => {
    expect(findForbiddenContent('https://api.test/c?email=someone@example.test')).toEqual({
      reason: 'email',
      where: 'url',
    })
  })

  it('a raw absolute URL in the body', () => {
    expect(findForbiddenContent('https://api.test/x', 'see https://victim.test/p')).toEqual({
      reason: 'absolute-url',
      where: 'body',
    })
  })

  it('markup, which is how page content arrives', () => {
    expect(findForbiddenContent('https://api.test/x', '<div>hidden</div>')).toEqual({
      reason: 'markup',
      where: 'body',
    })
  })

  it('and leaves our own origin and path alone', () => {
    // The endpoint's own URL looks like a URL. Only the parts a caller fills
    // are inspected.
    expect(findForbiddenContent('https://api.okolos.test/v1/range/A1B2C')).toBeNull()
  })
})

describe('a URL that has been through encodeURIComponent', () => {
  /**
   * The hole this closes. The guard read the raw query string, so it caught
   * `?u=https://victim.test/page` — a form nobody writes, because a URL in a
   * query string is percent-encoded by every API that has ever taken one.
   * `?u=https%3A%2F%2Fvictim.test%2Fpage` went straight through, and that is
   * exactly the shape of "someone added a debug parameter in a hurry" that
   * this file's own docstring says it exists to catch.
   */
  it('is caught in the query, not only in its raw form', () => {
    const url = `https://api.test/x?u=${encodeURIComponent('https://victim.test/secret')}`
    expect(findForbiddenContent(url)).toEqual({ reason: 'absolute-url', where: 'url' })
  })

  it('is caught in the body too', () => {
    const body = `page=${encodeURIComponent('https://victim.test/secret')}`
    expect(findForbiddenContent('https://api.test/x', body)).toEqual({
      reason: 'absolute-url',
      where: 'body',
    })
  })

  it('is caught when it was encoded twice', () => {
    // Double encoding happens by accident whenever a value is passed
    // through two layers that each encode.
    const once = encodeURIComponent('https://victim.test/secret')
    const url = `https://api.test/x?u=${encodeURIComponent(once)}`
    expect(findForbiddenContent(url)).toEqual({ reason: 'absolute-url', where: 'url' })
  })

  it('catches an encoded address as well as an encoded URL', () => {
    const url = `https://api.test/x?q=${encodeURIComponent('someone@example.test')}`
    expect(findForbiddenContent(url)).toEqual({ reason: 'email', where: 'url' })
  })

  it('survives a malformed escape instead of throwing on it', () => {
    // A lone % is not valid percent-encoding, and decodeURIComponent throws on
    // it. The choke point throwing would take down a request it was only
    // supposed to inspect.
    expect(() => findForbiddenContent('https://api.test/x?q=100%')).not.toThrow()
    expect(findForbiddenContent('https://api.test/x?q=100%')).toBeNull()
  })

  it('still lets a clean k-anonymity prefix through', () => {
    // The check that matters most: this must not start blocking the product's
    // own traffic. A five-character hash prefix is what the password check
    // sends, and it carries nothing.
    expect(findForbiddenContent('https://api.test/range/A1B2C')).toBeNull()
  })
})

describe('the address exception is declared, not accidental', () => {
  const CAVALIER = `https://cavalier.hudsonrock.com/api/json/v2/osint-tools/search-by-email?email=${encodeURIComponent('someone@example.test')}`
  const HIBP = `https://haveibeenpwned.com/api/v3/breachedaccount/${encodeURIComponent('someone@example.test')}?truncateResponse=false`

  it('refuses an address nobody declared', () => {
    expect(findForbiddenContent(CAVALIER)).toEqual({ reason: 'email', where: 'url' })
  })

  it('permits it when the request says it carries one', () => {
    expect(findForbiddenContent(CAVALIER, undefined, 'address')).toBeNull()
  })

  it('inspects the path, where the most sensitive value this product sends lives', () => {
    // Until 2026-08-08 only the query and fragment were read, on the grounds
    // that the path belongs to our own endpoints. HIBP takes the address as a
    // path segment, so the one value that mattered most was never looked at.
    expect(findForbiddenContent(HIBP)).toEqual({ reason: 'email', where: 'url' })
    expect(findForbiddenContent(HIBP, undefined, 'address')).toBeNull()
  })

  it('does not turn the declaration into a blanket permit', () => {
    // Declaring an address says nothing about page content. A leak lookup that
    // started carrying a URL or markup is still refused.
    const withUrl = `https://api.test/x?u=${encodeURIComponent('https://victim.test/p')}`
    expect(findForbiddenContent(withUrl, undefined, 'address')).toEqual({
      reason: 'absolute-url',
      where: 'url',
    })
    expect(findForbiddenContent('https://api.test/x', '<div>page</div>', 'address')).toEqual({
      reason: 'markup',
      where: 'body',
    })
  })

  it('inspects the whole string when the URL will not parse', () => {
    // A guard that gives up on malformed input is a guard with an escape hatch.
    expect(findForbiddenContent('not a url at all someone@example.test')).toEqual({
      reason: 'email',
      where: 'url',
    })
  })
})
