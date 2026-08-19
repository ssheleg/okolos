import { describe, expect, it } from 'vitest'

import { SEVERITY_ORDER, worstOf, type Severity } from './verdict.js'

/**
 * The ordering of severities, tested where it now lives.
 *
 * It was a private constant in the content script for as long as the content script
 * was the only thing that ranked verdicts. The moment the background needed the same
 * order — to name the worst finding inside an embedded frame — the choice was to copy
 * four numbers or to move them beside the type they order. Copying is how the wipe
 * confirmation came to name five stores of nine: two copies agree with each other,
 * and neither has to agree with anything else.
 */

const of = (severity: Severity, id: string) => ({ severity, id })

describe('SEVERITY_ORDER', () => {
  it('ranks every severity the type allows', () => {
    // A severity added to the union and forgotten here would sort as `undefined`,
    // which compares false against everything and quietly puts the new — probably
    // more severe — case last. `Record<Severity, number>` fails the build on that,
    // and this says the same thing where a test run can see it.
    const ranked = Object.keys(SEVERITY_ORDER).sort()
    expect(ranked).toEqual(['critical', 'info', 'major', 'minor'])
  })

  it('orders them worst first, with no ties', () => {
    // Ties matter: two severities sharing a number make `worstOf` depend on input
    // order, which is how "the worst thing is the first thing" stops being true
    // without any test noticing.
    const values = Object.values(SEVERITY_ORDER)
    expect(new Set(values).size).toBe(values.length)
    expect(SEVERITY_ORDER.critical).toBeGreaterThan(SEVERITY_ORDER.major)
    expect(SEVERITY_ORDER.major).toBeGreaterThan(SEVERITY_ORDER.minor)
    expect(SEVERITY_ORDER.minor).toBeGreaterThan(SEVERITY_ORDER.info)
  })
})

describe('worstOf', () => {
  it('picks the most severe, wherever it sits in the list', () => {
    // Both orders, because a sort that returns its input unchanged passes the
    // first arrangement and fails nothing.
    expect(worstOf([of('info', 'a'), of('critical', 'b'), of('minor', 'c')])?.id).toBe('b')
    expect(worstOf([of('critical', 'b'), of('info', 'a')])?.id).toBe('b')
  })

  it('returns undefined for an empty list rather than a fabricated verdict', () => {
    // The content script casts the result, so a silent `undefined` there would
    // become a banner rendered from nothing. Callers are entitled to be told.
    expect(worstOf([])).toBeUndefined()
  })

  it('does not reorder the list it was given', () => {
    // `sort` mutates. The verdicts handed in are also the ones written to the
    // database and sent back to the page, and a surface that reorders its caller's
    // data is a surface whose caller has a bug it cannot see.
    const input = [of('info', 'a'), of('critical', 'b')]
    worstOf(input)
    expect(input.map((v) => v.id)).toEqual(['a', 'b'])
  })
})
