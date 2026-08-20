import { describe, expect, it, vi } from 'vitest'

import { failOpen, type FailOpenDeps } from './fail-open.js'

/**
 * Fail open, and say so.
 *
 * The wrapper around the page scan swallowed every fault into a `console.warn`, so a
 * scan that never produced a verdict was indistinguishable from a page with nothing
 * hidden on it — no banner, no record, and the person believing the page had been
 * checked. Found by reading a CI trace whose console held eight preload warnings and
 * not one line from this product (B-74).
 */

function deps(overrides: Partial<FailOpenDeps> = {}): FailOpenDeps {
  return {
    warn: vi.fn(),
    note: vi.fn(async () => undefined),
    ...overrides,
  }
}

describe('failing open', () => {
  it('says nothing when the work finished', async () => {
    const d = deps()
    await expect(failOpen(async () => undefined, d)).resolves.toBe(true)
    expect(d.warn).not.toHaveBeenCalled()
    expect(d.note).not.toHaveBeenCalled()
  })

  it('leaves a record, not only a console line', async () => {
    // The whole defect in one assertion: the console was the only record, and the
    // console is a record for nobody.
    const d = deps()
    const boom = new Error('the background service refused "page/candidates": failed')
    await expect(
      failOpen(async () => {
        throw boom
      }, d),
    ).resolves.toBe(false)

    expect(d.warn).toHaveBeenCalledWith(boom)
    expect(d.note).toHaveBeenCalledWith(boom)
  })

  it('never rethrows — that is the "open" in fail open', async () => {
    /**
     * A detector fault must not break the page a person is trying to use. This is the
     * property the original had right and the only one it had right, so it is asserted
     * rather than assumed.
     */
    const d = deps()
    await expect(
      failOpen(async () => {
        throw new Error('a detector threw')
      }, d),
    ).resolves.toBe(false)
  })

  it('survives a journal that cannot be written', async () => {
    // The page is often broken in exactly the way that also breaks storage, and the
    // note is the least important thing happening at that moment.
    const d = deps({
      note: vi.fn(async () => {
        throw new Error('database gone')
      }),
    })
    await expect(
      failOpen(async () => {
        throw new Error('a detector threw')
      }, d),
    ).resolves.toBe(false)
  })

  it('does not swallow a synchronous throw either', async () => {
    // `work` is typed async, but a throw before the first await is synchronous, and a
    // wrapper that only catches rejections would let it out.
    const d = deps()
    await expect(
      failOpen(() => {
        throw new Error('thrown before any await')
      }, d),
    ).resolves.toBe(false)
    expect(d.note).toHaveBeenCalled()
  })

  it('reports the cause, so the record can name what happened', async () => {
    /**
     * "The check did not finish" without a reason leaves a reader unable to tell a
     * restarting worker from a version skew — which is the difference between "it will
     * be fine next time" and "this build cannot talk to that one".
     */
    const seen: unknown[] = []
    await failOpen(
      async () => {
        throw new Error('the background service refused "page/candidates": unsupported')
      },
      { warn: () => {}, note: async (cause) => void seen.push(cause) },
    )
    expect(String(seen[0])).toContain('unsupported')
  })
})
