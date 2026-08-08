import { describe, expect, it } from 'vitest'

import { shadowMode } from './shadow.js'

/**
 * Which shadow-root mode the in-page surfaces get.
 *
 * One line, and the whole reason the banner cannot be hidden by the page it
 * warns about. It is asserted here as well as in the bundle gate, because the
 * bundle gate checks the artefact and this checks the rule.
 */

describe('the shadow root the page cannot reach into', () => {
  it('is closed unless a test build asked otherwise', () => {
    // The flag is replaced at build time. Undefined means an ordinary build,
    // and an ordinary build is closed.
    expect(shadowMode()).toBe('closed')
  })
})
