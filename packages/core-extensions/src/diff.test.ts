import { describe, expect, it } from 'vitest'

import { diffInventory, type ExtensionSnapshot } from './diff.js'

function ext(overrides: Partial<ExtensionSnapshot> = {}): ExtensionSnapshot {
  return {
    id: 'abc',
    name: 'Colour Picker',
    version: '1.0.0',
    permissions: ['storage'],
    hostPermissions: [],
    publisher: 'Someone',
    enabled: true,
    ...overrides,
  }
}

describe('the update nobody sees', () => {
  it('reports a permission that was not there before', () => {
    const changes = diffInventory([ext()], [ext({ permissions: ['storage', 'cookies'] })])
    expect(changes[0]).toMatchObject({ kind: 'permission-added', severity: 'critical' })
    expect(changes[0]?.detail).toContain('cookies')
  })

  it('treats a harmless new permission as worth mentioning, not alarming', () => {
    const changes = diffInventory([ext()], [ext({ permissions: ['storage', 'alarms'] })])
    expect(changes[0]).toMatchObject({ kind: 'permission-added', severity: 'major' })
  })

  it('reports a change of publisher as the most serious thing it can find', () => {
    // The code is the same product to the user and a different party's to
    // everyone else.
    const changes = diffInventory([ext()], [ext({ publisher: 'Someone Else' })])
    expect(changes[0]).toMatchObject({ kind: 'publisher-changed', severity: 'critical' })
    expect(changes[0]?.detail).toContain('Someone Else')
  })

  it('reports host access widening to everything', () => {
    const changes = diffInventory([ext()], [ext({ hostPermissions: ['<all_urls>'] })])
    expect(changes[0]).toMatchObject({ kind: 'host-access-widened', severity: 'critical' })
  })

  it('reports a narrower new host as major, not critical', () => {
    const changes = diffInventory([ext()], [ext({ hostPermissions: ['https://example.test/*'] })])
    expect(changes[0]?.severity).toBe('major')
  })
})

describe('the ordinary cases', () => {
  it('says nothing when nothing changed', () => {
    expect(diffInventory([ext()], [ext()])).toEqual([])
  })

  it('notes a newly installed extension without alarm', () => {
    const changes = diffInventory([], [ext()])
    expect(changes[0]).toMatchObject({ kind: 'newly-installed', severity: 'minor' })
  })

  it('notes one that is gone', () => {
    const changes = diffInventory([ext()], [])
    expect(changes[0]).toMatchObject({ kind: 'removed', severity: 'minor' })
  })

  it('does not care about a version bump on its own', () => {
    expect(diffInventory([ext()], [ext({ version: '2.0.0' })])).toEqual([])
  })

  it('reports several changes to one extension separately', () => {
    const changes = diffInventory(
      [ext()],
      [ext({ publisher: 'New Owner', permissions: ['storage', 'tabs'] })],
    )
    expect(changes.map((change) => change.kind)).toEqual(['publisher-changed', 'permission-added'])
  })
})
