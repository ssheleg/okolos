import { expect, test } from './fixtures.js'

/**
 * SCN-017 and SCN-018 — the extensions watch.
 *
 * A test profile has no other extensions to change under it, so what is
 * asserted here is the half that can be: the screen reaches the browser, reads
 * the inventory, and reports a real state. The delta logic itself is covered
 * against fixtures in core-extensions.
 *
 * Every assertion is unconditional on purpose. The first version of this file
 * branched on the state and returned early when it was not `ready` — which
 * meant that losing the `management` permission, the exact regression this
 * screen exists to survive, would have turned the test green by skipping it.
 */

test('the screen reports the state of this browser rather than an empty list', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)

  const panel = page.locator('[data-role=extensions]')
  // `management` is in the manifest, so this is not a maybe: the screen must
  // reach the browser. Accepting `unsupported` here would accept the permission
  // silently going missing.
  await expect(panel).toHaveAttribute('data-state', 'ready')
  await expect(panel.locator('[data-role=unsupported]')).toHaveCount(0)
  await expect(panel.locator('[data-role=no-changes]')).toBeVisible()
})

test('the inventory lists what is installed, with what each may do', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)

  const panel = page.locator('[data-role=extensions]')
  await expect(panel).toHaveAttribute('data-state', 'ready')

  // Okolos leaves itself out of its own report, so a profile carrying only this
  // extension has an empty inventory — and says the number rather than showing
  // a blank area that could mean anything.
  await expect(panel.locator('[data-role=installed] h2')).toHaveText('Installed (0)')
  await expect(panel.locator('[data-role=installed-row]')).toHaveCount(0)
})
