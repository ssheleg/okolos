import { describe, expect, it } from 'vitest'

import { RISKY_PAIRS, standingFindings } from './standing.js'
import type { ExtensionSnapshot } from './diff.js'

/**
 * The two facts that are true the first time an extension is seen.
 *
 * `diffInventory` answers "what moved since last time", which is where most of the risk
 * is — seven years of trust turned into spyware by a quiet update. But a sideloaded
 * extension is not a change, and neither is a permission set that was alarming on day
 * one: a product that only reports deltas never reports either (B-56).
 */

function ext(overrides: Partial<ExtensionSnapshot> = {}): ExtensionSnapshot {
  return {
    id: 'abc',
    name: 'Colour Picker',
    version: '1.0.0',
    permissions: ['storage'],
    hostPermissions: [],
    publisher: 'https://clients2.google.com/service/update2/crx',
    enabled: true,
    ...overrides,
  }
}

describe('how the extension got here', () => {
  it('reports a sideload as the most serious of the two', () => {
    // The one that arrives without being asked for: another program on the machine put
    // it there.
    const [found] = standingFindings(ext({ installType: 'sideload' }))
    expect(found).toMatchObject({ kind: 'not-from-store', severity: 'critical' })
  })

  it('reports an unpacked development build, less loudly', () => {
    // Usually one the person loaded themselves — worth saying, not worth alarming.
    const [found] = standingFindings(ext({ installType: 'development' }))
    expect(found).toMatchObject({ kind: 'not-from-store', severity: 'major' })
  })

  it('says nothing about one from the store', () => {
    expect(standingFindings(ext({ installType: 'normal' }))).toEqual([])
  })

  it('says nothing about one an administrator pushed', () => {
    /**
     * Deliberate. An extension installed by a workplace policy is not a surprise to the
     * person whose machine it is, and they cannot remove it either — reporting it is an
     * alarm with no action behind it, on a screen whose whole worth is that everything on
     * it can be acted on.
     */
    expect(standingFindings(ext({ installType: 'admin' }))).toEqual([])
  })

  it('says nothing when the browser did not tell us', () => {
    // A snapshot stored before the field existed, or a browser with no `management`.
    // "We could not tell" must not read as "it came from the store" — but it must not
    // raise an alarm either, which would fire on every old row at once.
    expect(standingFindings(ext())).toEqual([])
  })
})

describe('permissions that are ordinary alone', () => {
  it('names the pair that has no innocent reading', () => {
    // Everything you visit, the sessions you are signed into, and the ability to change
    // what leaves the browser — in one extension.
    const [found] = standingFindings(
      ext({ permissions: ['cookies', 'webRequest'], hostPermissions: ['<all_urls>'] }),
    )
    expect(found).toMatchObject({
      kind: 'reads-everything-and-more',
      severity: 'critical',
      everywhere: true,
    })
    expect(found?.pair).toEqual(['cookies', 'webRequest'])
  })

  it('is quieter when the same pair is held for one site', () => {
    // A password manager on one bank's domain is not the same thing as one everywhere.
    const [found] = standingFindings(
      ext({ permissions: ['cookies', 'webRequest'], hostPermissions: ['https://bank.test/*'] }),
    )
    expect(found).toMatchObject({ severity: 'major', everywhere: false })
  })

  it('says nothing about either permission alone', () => {
    expect(standingFindings(ext({ permissions: ['cookies'], hostPermissions: ['<all_urls>'] }))).toEqual([])
    expect(standingFindings(ext({ permissions: ['webRequest'] }))).toEqual([])
  })

  it('reports one pair, not every overlapping one', () => {
    // `cookies` + `webRequest` + `scripting` matches three pairs. Three sentences about
    // one extension is a wall, and the first already says what it is.
    const found = standingFindings(
      ext({ permissions: ['cookies', 'webRequest', 'scripting'], hostPermissions: ['<all_urls>'] }),
    )
    expect(found.filter((entry) => entry.kind === 'reads-everything-and-more')).toHaveLength(1)
  })

  it('recognises every spelling of "everywhere"', () => {
    for (const host of ['<all_urls>', '*://*/*', 'https://*/*', 'http://*/*']) {
      const [found] = standingFindings(ext({ permissions: ['cookies', 'scripting'], hostPermissions: [host] }))
      expect(found?.everywhere, host).toBe(true)
    }
  })

  it('treats an unrecorded host list as unknown, not as empty', () => {
    // `null` is what a row stored before host permissions existed looks like. Read as an
    // empty list it would say "held for one site" about an extension that may hold it
    // everywhere — the quiet direction, which is the wrong one to guess in.
    const [found] = standingFindings(ext({ permissions: ['cookies', 'scripting'], hostPermissions: null }))
    expect(found?.everywhere).toBe(false)
  })
})

describe('both at once', () => {
  it('reports each, because they are different facts', () => {
    const found = standingFindings(
      ext({
        installType: 'sideload',
        permissions: ['cookies', 'scripting'],
        hostPermissions: ['<all_urls>'],
      }),
    )
    expect(found.map((entry) => entry.kind)).toEqual(['not-from-store', 'reads-everything-and-more'])
  })

  it('says nothing at all about an ordinary extension', () => {
    // The list must be empty for the common case, or the screen becomes noise and the
    // one that matters is lost in it.
    expect(standingFindings(ext({ installType: 'normal', permissions: ['storage', 'alarms'] }))).toEqual([])
  })

  it('keeps every pair a real pair, so a rule nobody can predict cannot creep in', () => {
    // Named pairs rather than "three of these eight": a person has to be able to read the
    // rule and agree with it.
    for (const pair of RISKY_PAIRS) expect(pair).toHaveLength(2)
    expect(new Set(RISKY_PAIRS.map((pair) => pair.join('+'))).size).toBe(RISKY_PAIRS.length)
  })
})
