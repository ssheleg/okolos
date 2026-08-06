import { describe, expect, it } from 'vitest'

import { groupLeaks, isInfostealer, FRESH_WITHIN_DAYS } from './group.js'
import type { Leak } from './merge.js'

const NOW = '2026-08-06T00:00:00.000Z'

function leak(overrides: Partial<Leak> = {}): Leak {
  return {
    name: 'ExampleCorp',
    occurredAt: '2026-07-01',
    source: 'HIBP',
    classes: ['email addresses', 'passwords'],
    ...overrides,
  }
}

describe('what counts as an infected machine', () => {
  it('recognises a source that names the stealer', () => {
    expect(isInfostealer(leak({ name: 'Infostealer infection' }))).toBe(true)
    expect(isInfostealer(leak({ name: 'RedLine' }))).toBe(true)
  })

  it('recognises it by what was taken, whatever the record is called', () => {
    // A source reporting session cookies has described a compromised machine
    // whether or not it uses the word.
    expect(isInfostealer(leak({ name: 'Unnamed', classes: ['session cookies'] }))).toBe(true)
  })

  it('does not mistake an ordinary breach for one', () => {
    expect(isInfostealer(leak())).toBe(false)
  })
})

describe('the two piles', () => {
  it('puts a recent infection in its own group, above the rest', () => {
    const groups = groupLeaks(
      [leak(), leak({ name: 'Infostealer infection', occurredAt: '2026-07-20' })],
      NOW,
    )
    expect(groups[0]?.urgency).toBe('fresh-infostealer')
    expect(groups[1]?.urgency).toBe('historical')
  })

  it('says why the pile is its own pile', () => {
    // The response differs: cookies survive a password change. A date-sorted
    // list makes an infection look like a slightly newer breach.
    const groups = groupLeaks([leak({ name: 'Infostealer infection', occurredAt: '2026-07-20' })], NOW)
    expect(groups[0]?.why).toMatch(/session cookies/i)
    expect(groups[0]?.why).toMatch(/sign out/i)
  })

  it('treats an old infection as history', () => {
    const old = leak({ name: 'Infostealer infection', occurredAt: '2020-01-01' })
    expect(groupLeaks([old], NOW)[0]?.urgency).toBe('historical')
  })

  it('puts an undated record in history rather than inventing urgency', () => {
    const undated = leak({ name: 'Infostealer infection', occurredAt: null })
    expect(groupLeaks([undated], NOW)[0]?.urgency).toBe('historical')
  })

  it('omits a group that has nothing in it', () => {
    expect(groupLeaks([leak()], NOW)).toHaveLength(1)
  })

  it('returns nothing at all for nothing at all', () => {
    expect(groupLeaks([], NOW)).toEqual([])
  })

  it('draws the line where it says it does', () => {
    const inside = new Date(Date.parse(NOW) - (FRESH_WITHIN_DAYS - 1) * 86_400_000).toISOString()
    const outside = new Date(Date.parse(NOW) - (FRESH_WITHIN_DAYS + 1) * 86_400_000).toISOString()
    const stealer = { name: 'Infostealer infection' }
    expect(groupLeaks([leak({ ...stealer, occurredAt: inside })], NOW)[0]?.urgency).toBe(
      'fresh-infostealer',
    )
    expect(groupLeaks([leak({ ...stealer, occurredAt: outside })], NOW)[0]?.urgency).toBe(
      'historical',
    )
  })
})
