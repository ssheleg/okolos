import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { fromCatalogue, useResolver, type Catalogue } from '@okolos/i18n'

import { injectionDetail } from './warn-words.js'

/** The shipped Russian catalogue: `default_locale` is `ru`, and a fake would let a missing key pass. */
const CATALOGUE = JSON.parse(
  readFileSync(
    path.resolve(import.meta.dirname, '../../_locales/ru/messages.json'),
    'utf8',
  ),
) as Catalogue

useResolver(fromCatalogue(CATALOGUE))

const message = (key: string): string => {
  const entry = CATALOGUE[key]
  if (!entry) throw new Error(`the shipped catalogue has no key "${key}"`)
  return entry.message
}

describe('the injection warning says whether the page was read in full', () => {
  it('says nothing about the scan when the scan finished', () => {
    const said = injectionDetail(1, false, 0)
    expect(said).not.toContain(message('warnScanTruncated').trim())
  })

  it('says the page was too large when the walk was cut short', () => {
    // The one fact on this warning that had no test: `warnScanTruncated` appeared once in
    // the whole repository, at its call site, and nothing read it.
    expect(injectionDetail(1, true, 0)).toContain(message('warnScanTruncated').trim())
  })

  it('carries the truncation alongside the other two facts, not instead of them', () => {
    const said = injectionDetail(3, true, 2)
    expect(said).toContain(message('warnScanTruncated').trim())
    // Two more findings besides this one.
    expect(said).toMatch(/2/)
  })

  it('names neutralisation only when something was neutralised', () => {
    const plain = message('warnInjectionPlain').split('$')[0]?.trim() ?? ''
    expect(injectionDetail(1, false, 0)).toContain(plain)
  })
})
