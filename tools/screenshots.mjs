#!/usr/bin/env node
/**
 * Screenshots of the product, taken from the product.
 *
 *   pnpm screenshots     # writes docs/store/screenshots/*.png
 *
 * Not mock-ups. A listing image that shows a screen the extension does not draw
 * is the same defect as a document claiming a capability nobody built — and it
 * is the version a reviewer and a user both see first.
 *
 * Each shot is taken from the built extension, at the size the store requires,
 * with the state seeded through the same storage the product uses.
 */
import { chromium } from '@playwright/test'
import { mkdirSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const BUILD = path.join(root, 'apps/extension/dist/chrome')
const OUT = path.join(root, 'docs/store/screenshots')

/** What the store asks for. Anything else is rejected at upload. */
const SIZE = { width: 1280, height: 800 }

mkdirSync(OUT, { recursive: true })

const context = await chromium.launchPersistentContext('', {
  channel: 'chromium',
  // The listing is Russian first, and `chrome.i18n` answers in the browser's
  // language — so without this the shots come out in English and the store
  // page shows a product that is not the one a Russian visitor installs.
  args: [`--disable-extensions-except=${BUILD}`, `--load-extension=${BUILD}`, '--lang=ru'],
  locale: 'ru-RU',
  viewport: SIZE,
})

let [worker] = context.serviceWorkers()
if (!worker) worker = await context.waitForEvent('serviceworker', { timeout: 20_000 })
const id = new URL(worker.url()).host

async function shot(name, open) {
  const page = await context.newPage()
  await page.setViewportSize(SIZE)
  await open(page)
  await page.waitForTimeout(400)
  await page.screenshot({ path: path.join(OUT, `${name}.png`) })
  await page.close()
  console.log(`   ${name}.png`)
}

console.log('\n── screenshots, from the built extension')

await shot('01-interstitial', async (page) => {
  // The block screen, shown as a page rather than reached through a real block:
  // the shot is of the same renderer either way, and seeding a feed here would
  // photograph the test harness instead of the product.
  await page.goto(`chrome-extension://${id}/interstitial.html`)
})

await shot('02-first-run', async (page) => {
  await page.goto(`chrome-extension://${id}/first-run.html`)
})

await shot('03-self-audit', async (page) => {
  await page.goto(`chrome-extension://${id}/options.html`)
})

await shot('04-popup', async (page) => {
  await page.goto(`chrome-extension://${id}/popup.html`)
})

await context.close()
console.log(`\nwrote to ${path.relative(root, OUT)} at ${SIZE.width}×${SIZE.height}`)
