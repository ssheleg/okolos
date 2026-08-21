import { expect, test } from './fixtures.js'

/**
 * No area of the extension's own page scrolls sideways in a narrow window.
 *
 * An options page opens in whatever window the person has, and a page that scrolls
 * horizontally is one where the right-hand end of every sentence is behind a gesture. Nothing
 * checked this: the screenshots and the looks were all 1280 wide, and the design system had no
 * recorded floor.
 *
 * Measured 2026-08-21 at 420 and at 320. Everything held at 420. At 320 exactly one screen
 * scrolled, and the cause was a native `<input type=file>`, whose intrinsic width — 373px —
 * does not shrink.
 *
 * **The popup is deliberately not here.** Its body asks for `--ok-size-popup` and the browser
 * opens a window that size; measuring it inside a 320px viewport measures a case that does not
 * occur.
 */

const NARROW = { width: 320, height: 900 }

const AREAS = [
  { hash: '', role: 'overview' },
  { hash: '#recovery', role: 'incident-picker' },
  { hash: '#recovery=pasted-command', role: 'recovery' },
  { hash: '#queue', role: 'queue-section' },
  { hash: '#journal', role: 'journal' },
  { hash: '#leaks', role: 'leaks-section' },
  { hash: '#extensions', role: 'extensions' },
  { hash: '#trusted', role: 'trusted' },
  { hash: '#audit', role: 'self-audit' },
  { hash: '#data', role: 'data-controls' },
] as const

for (const { hash, role } of AREAS) {
  test(`the ${role} area fits a 320px window`, async ({ context, extensionId }) => {
    const page = await context.newPage()
    await page.setViewportSize(NARROW)
    await page.goto(`chrome-extension://${extensionId}/options.html${hash}`)
    await expect(page.locator(`[data-role=${role}]`)).toHaveCount(1)

    const overflow = await page.evaluate(() => {
      const de = document.documentElement
      const wide: string[] = []
      if (de.scrollWidth > de.clientWidth + 1) {
        for (const el of document.querySelectorAll('#root *')) {
          const rect = el.getBoundingClientRect()
          if (rect.right > de.clientWidth + 1) {
            wide.push(
              `${(el as HTMLElement).dataset.role ?? el.tagName} reaches ${Math.round(rect.right)}px`,
            )
          }
        }
      }
      return { document: de.scrollWidth, viewport: de.clientWidth, wide: wide.slice(0, 4) }
    })

    expect(
      overflow.wide,
      `the page is ${overflow.document}px wide in a ${overflow.viewport}px window`,
    ).toEqual([])
    expect(overflow.document, 'the page scrolls sideways').toBeLessThanOrEqual(
      overflow.viewport + 1,
    )
  })
}
