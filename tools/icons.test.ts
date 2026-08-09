import { describe, expect, it } from 'vitest'

// @ts-expect-error — a plain .mjs generator, deliberately untyped
import { BACKGROUND, RING } from './icons.mjs'

/**
 * The constraint a toolbar icon actually has to satisfy.
 *
 * `tools/manifest.test.ts` asserts the committed PNGs equal what `draw()`
 * produces — which keeps the binaries honest and says nothing about whether the
 * mark can be seen. It agrees with whatever the generator decides, so a change
 * making both colours dark would leave the icon invisible on a dark toolbar
 * with every gate green.
 *
 * One artwork is rendered against a light toolbar and a dark one at the same
 * moment, so it cannot follow a theme token — the colours here are the icon's
 * own, and this is the rule that makes that safe. WCAG 2.2 (1.4.11) asks 3:1
 * for a graphical object needed to understand the content, and a product's
 * only mark in the browser chrome is exactly that.
 */

/** Chrome's own toolbar surfaces, light and dark. */
const TOOLBARS = {
  'light toolbar': [0xff, 0xff, 0xff],
  'light toolbar, grey': [0xf1, 0xf3, 0xf4],
  'dark toolbar': [0x29, 0x2a, 0x2d],
  'dark toolbar, deeper': [0x20, 0x21, 0x24],
} as const

const MINIMUM = 3

function luminance([r, g, b]: readonly number[]): number {
  const channel = (raw: number): number => {
    const c = (raw as number) / 255
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(r as number) + 0.7152 * channel(g as number) + 0.0722 * channel(b as number)
}

function contrast(a: readonly number[], b: readonly number[]): number {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x)
  return ((hi as number) + 0.05) / ((lo as number) + 0.05)
}

describe('the mark stays visible on both toolbars', () => {
  it('reads the generator, so an empty import cannot pass as agreement', () => {
    expect(BACKGROUND).toHaveLength(3)
    expect(RING).toHaveLength(3)
  })

  it('keeps its own two colours legible against each other', () => {
    // If the ring stopped standing out from the plate there would be no mark
    // to be visible, whatever the toolbar behind it.
    expect(contrast(BACKGROUND as number[], RING as number[])).toBeGreaterThanOrEqual(MINIMUM)
  })

  for (const [name, toolbar] of Object.entries(TOOLBARS)) {
    it(`is carried by at least one of its colours against the ${name}`, () => {
      const plate = contrast(BACKGROUND as number[], toolbar)
      const ring = contrast(RING as number[], toolbar)
      // Either is enough, and which one changes by toolbar: on light the plate
      // carries the silhouette at 14.63:1 while the ring is invisible against
      // the chrome at 1.23:1, and on dark they swap. Requiring both would fail
      // an icon that works.
      expect(
        Math.max(plate, ring),
        `neither colour clears ${MINIMUM}:1 on the ${name} — plate ${plate.toFixed(2)}:1, ring ${ring.toFixed(2)}:1`,
      ).toBeGreaterThanOrEqual(MINIMUM)
    })
  }
})
