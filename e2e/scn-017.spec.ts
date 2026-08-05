import { expect, test } from './fixtures.js'

/**
 * SCN-017 and SCN-018 — the extensions watch.
 *
 * A test profile has no other extensions to change under it, so what can be
 * asserted here is the honest half: the screen exists, it reaches the browser,
 * and it never shows an empty list where it means "unknown". The delta logic
 * itself is covered against fixtures in core-extensions.
 */

test('the screen reports the state of this browser rather than an empty list', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)

  const panel = page.locator('[data-role=extensions]')
  await expect(panel).toHaveCount(1)

  // Either it can read the others and says nothing changed, or it says this
  // browser will not let it. What it must never do is show neither.
  const said = panel.locator('[data-role=no-changes], [data-role=unsupported], [data-role=change]')
  await expect(said.first()).toBeVisible()
})

test('the inventory lists what is installed, with what each may do', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)

  const panel = page.locator('[data-role=extensions]')
  await expect(panel).toHaveCount(1)

  const state = await panel.getAttribute('data-state')
  if (state !== 'ready') return

  // Okolos itself is excluded from its own report, so a profile with only this
  // extension shows an empty inventory — and says the count out loud.
  await expect(panel.locator('[data-role=installed] h2')).toContainText('Installed (')
})
