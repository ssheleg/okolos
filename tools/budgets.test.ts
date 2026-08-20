import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

// Relative paths, not package names: `tools/` is not a workspace member, so vitest
// cannot resolve `@okolos/platform` from here (the same reason `docs.test.ts` reaches
// for `../packages/net/src/destinations.js`). The file is what matters anyway.
import { SURFACE_MOUNT_MS, WORKER_REGISTER_MS } from '../e2e/budgets.js'
import { RPC_TIMEOUT_MS } from '../packages/platform/src/adapter.js'

/**
 * Three waits in three files, and their order is the whole point.
 *
 * They were inverted and nothing said so. `SURFACE_MOUNT_MS` was 20 s while the
 * extension's own `RPC_TIMEOUT_MS` is 30 s, so a test abandoned the wait ten seconds
 * before the product would have called the call failed — and Playwright's per-test
 * timeout was 30 s, the same number as the product's deadline, so it killed the test
 * at the instant either side might have said something. The observable result was
 * "44 × locator resolved to 0 elements" and two nights of guessing (B-73, and the
 * SURFACE_MOUNT_MS incident before it).
 *
 * Asserted rather than commented, because three numbers in three files drift into an
 * inversion the moment one is tuned alone — and the inversion is invisible: every
 * test still passes, right up to the one run where the worker is slow.
 */

const root = path.resolve(import.meta.dirname, '..')

/** The per-test timeout, read from the config rather than restated here. */
function playwrightTimeout(): number {
  const config = readFileSync(path.join(root, 'playwright.config.ts'), 'utf8')
  const found = /^\s*timeout:\s*([\d_]+),/m.exec(config)
  if (found === null) throw new Error('playwright.config.ts declares no timeout')
  return Number((found[1] as string).replaceAll('_', ''))
}

describe('the waits an e2e test can stack', () => {
  it('lets the product reach its own deadline before the test stops watching', () => {
    // Otherwise a slow answer and a broken product are the same observation, and
    // the message names neither.
    expect(SURFACE_MOUNT_MS).toBeGreaterThan(RPC_TIMEOUT_MS)
  })

  it('gives a single test room for both of its waits', () => {
    /**
     * A test waits for the worker to register and then for the surface to mount.
     * When the outer timeout is smaller than that sum, the failure is Playwright's
     * — "Test timeout of N exceeded" — and the two budgets, each with a sentence
     * ready to explain itself, never get to print it.
     */
    expect(playwrightTimeout()).toBeGreaterThan(WORKER_REGISTER_MS + SURFACE_MOUNT_MS)
  })

  it('reads the config rather than restating it', () => {
    // A number copied into this file would agree with itself forever.
    expect(playwrightTimeout()).toBe(75_000)
    const config = readFileSync(path.join(root, 'playwright.config.ts'), 'utf8')
    expect(config).toContain('75_000')
  })

  it('keeps every wait under the ceiling a person will sit through', () => {
    // The other direction matters too: budgets exist so a slow runner cannot fail a
    // CSS test, not so a hung suite can hang for a quarter of an hour.
    for (const [name, ms] of Object.entries({ SURFACE_MOUNT_MS, WORKER_REGISTER_MS })) {
      expect(ms, `${name} is longer than two minutes`).toBeLessThan(120_000)
    }
    expect(playwrightTimeout()).toBeLessThan(300_000)
  })
})
