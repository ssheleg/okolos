import { describe, expect, it } from 'vitest'

import { labelsAbove, publicSuffixOf, registrableDomain, registrableLabel } from './suffix.js'

/**
 * Where a name stops belonging to whoever registered it.
 *
 * Every rule in `check.ts` asks whether a brand is standing where it does not
 * belong, and before this module the answer was computed from "the
 * second-to-last label". That is right for `paypal.com` and wrong for every
 * two-label suffix on the web, which is how twenty-one genuine hosts out of a
 * thirty-four-host sample came to be reported as impersonation.
 */

describe('the suffix the registry owns', () => {
  it('takes the longest match, so a two-label suffix beats its last label', () => {
    expect(publicSuffixOf('amazon.co.uk')).toBe('co.uk')
    expect(publicSuffixOf('nalog.gov.ru')).toBe('gov.ru')
    expect(publicSuffixOf('amazon.com.br')).toBe('com.br')
  })

  it('falls back to the last label for a suffix it does not know', () => {
    // The safe direction: an unknown two-label suffix makes the registrable
    // domain one label too short, which can only lose a finding, never invent
    // one. Named in the module and pinned here.
    expect(publicSuffixOf('paypal.com')).toBe('com')
    expect(publicSuffixOf('evil.test')).toBe('test')
    expect(publicSuffixOf('example.zzz.zz')).toBe('zz')
  })

  it('answers for a bare suffix and for nothing at all', () => {
    expect(publicSuffixOf('co.uk')).toBe('co.uk')
    expect(publicSuffixOf('')).toBe('')
  })
})

describe('the domain the registrant holds', () => {
  it('is the suffix plus one label, however many labels the suffix has', () => {
    expect(registrableDomain('accounts.google.com')).toBe('google.com')
    expect(registrableDomain('www.amazon.co.uk')).toBe('amazon.co.uk')
    expect(registrableDomain('pfr.gov.ru')).toBe('pfr.gov.ru')
  })

  it('returns the host itself when there is nothing above the suffix', () => {
    // A bare `co.uk` is a suffix, not a domain. Inventing a registrant for it
    // would be the same mistake in the other direction.
    expect(registrableDomain('co.uk')).toBe('co.uk')
    expect(registrableDomain('com')).toBe('com')
  })

  it('names the label the registrant chose', () => {
    expect(registrableLabel('login.pаypal.co.uk')).toBe('pаypal')
    expect(registrableLabel('nalog.gov.ru')).toBe('nalog')
    expect(registrableLabel('')).toBe('')
  })
})

describe('the labels in front of the registrant’s own domain', () => {
  it('is empty for a brand on its own site, whatever the suffix', () => {
    // The case the whole module exists for: read as "everything but the last
    // label", `amazon.co.uk` offered up `amazon` as a subdomain of `co`.
    expect(labelsAbove('amazon.co.uk')).toEqual([])
    expect(labelsAbove('amazon.com.br')).toEqual([])
    expect(labelsAbove('paypal.com')).toEqual([])
  })

  it('names what a registrant put in front of their own name', () => {
    expect(labelsAbove('accounts.google.com')).toEqual(['accounts'])
    expect(labelsAbove('paypal.com.evil.test')).toEqual(['paypal', 'com'])
    expect(labelsAbove('a.b.c.evil.test')).toEqual(['a', 'b', 'c'])
  })
})
