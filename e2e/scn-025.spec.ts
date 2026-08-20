import { expect, test } from './fixtures.js'

/**
 * SCN-025 — the recovery checklist, reached the way a frightened person reaches
 * it: from the warning that just interrupted them.
 */

test('the checklist opens on the incident it was sent for, worst step first', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html#recovery=pasted-command`)

  const recovery = page.locator('[data-role=recovery]')
  await expect(recovery).toHaveCount(1)
  await expect(recovery.locator('[data-role=step]').first()).toHaveAttribute('data-step', 'disconnect')
  await expect(recovery.locator('[data-role=elsewhere]').first()).toContainText('cannot be done in this browser')
})

test('progress survives closing the page', async ({ context, extensionId }) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html#recovery=entered-password`)
  await page.locator('[data-role=step] [data-role=done]').first().click()
  await expect(page.locator('[data-step=change-password]')).toHaveAttribute('data-done', 'true')

  const reopened = await context.newPage()
  await reopened.goto(`chrome-extension://${extensionId}/options.html#recovery=entered-password`)
  await expect(reopened.locator('[data-step=change-password]')).toHaveAttribute('data-done', 'true')
})

test('an incident nobody defined gets the broad list, and is told so', async ({
  context,
  extensionId,
}) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html#recovery=whatever-this-was`)
  await expect(page.locator('[data-role=generic]')).toContainText('broadest safe')
})

test('the steps this browser cannot do can be taken to one that can', async ({
  context,
  extensionId,
}) => {
  // Five of the nine steps in this checklist are not browser work. Finding that
  // out halfway through, with no way to carry the list, is where people stop.
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html#recovery=pasted-command`)

  const portable = page.locator('[data-role=portable]')
  await expect(portable).toHaveCount(1)
  await expect(portable.locator('[data-role=portable-why]')).toContainText('nothing is sent')

  const text = await portable.locator('[data-role=portable-text]').innerText()
  expect(text).toContain('Disconnect this device')
  expect(text).toContain('(not in this browser)')
  // The reason travels with the step, or the list gets abandoned at the first
  // inconvenient one.
  expect(text).toContain('Why:')
})

test('what is already done is not carried', async ({ context, extensionId }) => {
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html#recovery=entered-password`)

  await expect(page.locator('[data-role=portable-text]')).toContainText('Change the password')
  await page.locator('[data-role=step] [data-role=done]').first().click()
  await expect(page.locator('[data-role=portable-text]')).not.toContainText('Change the password')
})

test('an address nobody could have produced still renders the checklist', async ({
  context,
  extensionId,
}) => {
  /**
   * Two addresses that blanked this page, and it is the page a person opens while
   * something is already going wrong.
   *
   * `%E0%A4%A` is an incomplete escape. `routeFor` decodes once and deliberately
   * keeps it raw — there is a unit test for that — and `recoverySection` then decoded
   * a second time, threw `URIError`, and never reached `replaceChildren`: a completely
   * blank page with an unhandled rejection in the console.
   *
   * `constructor` is a name off `Object.prototype`, and `kind in INCIDENTS` said yes
   * to it. The lookup returned a function, `steps.some(...)` threw, and the render
   * died the same way.
   *
   * Neither is an address this product produces. Both are addresses a person can be
   * sent, and a screen for a bad afternoon may not be the thing that fails.
   */
  for (const hash of ['#recovery=%E0%A4%A', '#recovery=constructor', '#recovery=__proto__']) {
    const page = await context.newPage()
    const errors: string[] = []
    page.on('pageerror', (error) => errors.push(error.message))

    await page.goto(`chrome-extension://${extensionId}/options.html${hash}`)

    // Something is on the screen, and it is the checklist rather than an empty shell.
    const recovery = page.locator('[data-role=recovery]')
    await expect(recovery, `${hash} rendered no checklist`).toHaveCount(1)
    await expect(recovery.locator('[data-role=step]').first()).toBeAttached()

    // And it says it is the broad list rather than pretending to know the incident.
    await expect(recovery.locator('[data-role=generic]'), `${hash} did not admit the fallback`)
      .toHaveCount(1)

    expect(errors, `${hash} threw on the page: ${errors.join(' | ')}`).toEqual([])
    await page.close()
  }
})
