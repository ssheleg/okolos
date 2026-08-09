import { expect, outbound, serve, test } from './fixtures.js'

/**
 * The suite does not reach the internet, and this is what says so.
 *
 * It was not a hypothetical. The extension pulls its blocking feed from the
 * production worker at every service-worker boot and nothing stopped it, so
 * every run depended on a deployed service being up and on what it happened to
 * be serving. It cost one flake directly: SCN-007 seeded a feed naming
 * `fixture.test`, installed the rules, and then lost a race to the real feed
 * landing and replacing them with four production domains.
 *
 * Two things are asserted here, and the second is the one that matters:
 * requests to the outside are refused, and the refusal is *observed* — a check
 * that only proves "nothing was recorded" would pass just as happily on a
 * fixture that had stopped recording.
 */

const PAGE = `<!doctype html><html><body><p>ordinary</p></body></html>`

test('nothing in this suite reaches a real host', async ({ context, extensionId }) => {
  await serve(context, PAGE)

  // Boot the extension the way every other spec does, then give the
  // service worker the chance it takes to pull its feed.
  const page = await context.newPage()
  await page.goto(`chrome-extension://${extensionId}/options.html`)
  await page.goto('https://fixture.test/')
  await expect(page.locator('p')).toHaveText('ordinary')

  // The extension really did try — that is the point of the interception.
  // Without this the next assertion would be satisfied by a recorder that had
  // simply stopped working.
  await expect
    .poll(() => outbound.length, { timeout: 15_000, message: 'the extension made no outbound request at all — either it stopped pulling its feed, or the fixture stopped recording' })
    .toBeGreaterThan(0)

  const escaped = outbound.filter(
    (url) => !url.startsWith('https://fixture.test/') && !url.startsWith('chrome-extension://'),
  )
  expect(escaped.length, `attempted: ${escaped.join(', ')}`).toBeGreaterThan(0)

  /**
   * The assertion that cannot be satisfied by the recorder.
   *
   * The first version of this test checked only what `outbound` held, and a
   * planted defect proved it hollow: changing the fixture to record a request
   * and then let it through to the real internet left the test green. What is
   * checked now is the product's own consequence — the feed pull failed with
   * the fixture's 503, and said so in the journal. A suite that reached
   * production would have fetched a real feed and written nothing of the kind.
   */
  await page.goto(`chrome-extension://${extensionId}/options.html`)
  const refusal = await expect
    .poll(
      async () =>
        page.evaluate(async () => {
          const open = indexedDB.open('okolos')
          const db = await new Promise<IDBDatabase>((resolve, reject) => {
            open.onsuccess = () => resolve(open.result)
            open.onerror = () => reject(open.error)
          })
          const all = await new Promise<unknown[]>((resolve, reject) => {
            const request = db.transaction(['journal']).objectStore('journal').getAll()
            request.onsuccess = () => resolve(request.result as unknown[])
            request.onerror = () => reject(request.error)
          })
          db.close()
          return JSON.stringify(all)
        }),
      {
        timeout: 15_000,
        message: 'the journal never recorded a failed feed fetch, so the pull reached something real',
      },
    )
    .toContain('503')
  void refusal

  const hosts = [...new Set(escaped.map((url) => new URL(url).host))]
  // Only destinations the privacy policy already declares. A new host appearing
  // here is a new thing the product sends somewhere, and it should be a
  // decision rather than a diff nobody read.
  const declared = [
    'okolos-proxy.sergeysheleg4.workers.dev',
    'api.pwnedpasswords.com',
    'haveibeenpwned.com',
    'cavalier.hudsonrock.com',
  ]
  for (const host of hosts) {
    expect(declared, `${host} is contacted at boot and is not in the declared set`).toContain(host)
  }
})
