import { describe, expect, it } from 'vitest'

import worker from './index.js'
import type { Env } from './router.js'

/**
 * The retention sweep, which no test had ever run.
 *
 * `docs/privacy.md` says appeals are kept for 180 days, and the whole enforcement
 * is four lines in `scheduled()` — a `DELETE` with a cutoff. Nothing checked that
 * the cutoff was 180 days, that the comparison ran the right way round, or that
 * the sweep was wired to the cron at all. A retention policy nobody enforces is a
 * sentence in a privacy page, and a sweep nobody tests is a sentence in a source
 * file.
 */

interface Recorded {
  readonly sql: string
  readonly values: readonly unknown[]
}

function env(options: { fail?: boolean } = {}): Env & { recorded: Recorded[] } {
  const recorded: Recorded[] = []
  return {
    recorded,
    DB: {
      prepare: (sql: string) => ({
        bind: (...values: unknown[]) => ({
          run: async () => {
            recorded.push({ sql, values })
            if (options.fail) throw new Error('database unavailable')
            return {}
          },
          first: async () => null,
          all: async () => ({ results: [] }),
        }),
      }),
    },
  }
}

describe('what the scheduled sweep deletes', () => {
  it('deletes appeals and only appeals', async () => {
    // Listings are public information and feeds are what the product serves; a
    // sweep that reached either would take the service down on a timer.
    const e = env()
    await worker.scheduled({}, e)
    expect(e.recorded).toHaveLength(1)
    expect(e.recorded[0]?.sql).toBe('DELETE FROM appeals WHERE created_at < ?')
  })

  it('keeps them for 180 days, which is the number the privacy page states', async () => {
    const e = env()
    await worker.scheduled({}, e)
    const cutoff = Date.parse(String(e.recorded[0]?.values[0]))
    const days = (Date.now() - cutoff) / 86_400_000
    expect(days).toBeGreaterThan(179.9)
    expect(days).toBeLessThan(180.1)
  })

  it('compares the right way round, so it deletes the old and not the new', async () => {
    /**
     * `created_at < cutoff` deletes what is older than the cutoff. Reversed, the
     * same four lines delete everything *except* the expired rows — every appeal
     * filed in the last six months, silently, on a timer, with the privacy page
     * still claiming a 180-day window.
     */
    const e = env()
    await worker.scheduled({}, e)
    expect(e.recorded[0]?.sql).toContain('created_at < ?')
    expect(e.recorded[0]?.sql).not.toContain('created_at > ?')
  })

  it('binds the cutoff as an ISO timestamp, which is how the column is written', async () => {
    // `created_at` is written with `new Date().toISOString()`. A cutoff bound as
    // a number would compare a number against a string and match nothing —
    // a sweep that runs, reports nothing, and enforces nothing.
    const e = env()
    await worker.scheduled({}, e)
    const bound = e.recorded[0]?.values[0]
    expect(typeof bound).toBe('string')
    expect(String(bound)).toMatch(/^\d{4}-\d{2}-\d{2}T[\d:.]+Z$/)
  })

  it('does not swallow a failure into silence', async () => {
    /**
     * A sweep that fails and says nothing is a retention policy that has stopped
     * without anybody being told. The platform records a rejected `scheduled`
     * invocation and retries it; catching here would take both away.
     */
    await expect(worker.scheduled({}, env({ fail: true }))).rejects.toThrow('database unavailable')
  })
})
