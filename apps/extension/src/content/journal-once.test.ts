import { describe, expect, it, vi } from 'vitest'

import { createJournalOnce } from './journal-once.js'

/**
 * One fact, one record — and a failed write is not a record.
 *
 * The journal has a retention period, so ten identical lines evict the thing that
 * happened once. Three writers could produce them: restore's standing refusal (B-64),
 * the surface slot's refused claims, and the scan's give-up.
 */

describe('recording a fact once', () => {
  it('writes the first time', async () => {
    const once = createJournalOnce()
    const write = vi.fn(async () => undefined)
    await expect(once.record('a', write)).resolves.toBe('written')
    expect(write).toHaveBeenCalledTimes(1)
  })

  it('does not write the same fact twice', async () => {
    // Ten presses on one node used to be ten identical records.
    const once = createJournalOnce()
    const write = vi.fn(async () => undefined)
    for (let press = 0; press < 10; press += 1) await once.record('a', write)
    expect(write).toHaveBeenCalledTimes(1)
    expect(once.size()).toBe(1)
  })

  it('still writes a different fact', async () => {
    /**
     * The other side of the guard. A restore whose outcome changed — one node put
     * back, another still refused — is new information, and a check that could not
     * tell it apart would have replaced a flood with silence.
     */
    const once = createJournalOnce()
    const write = vi.fn(async () => undefined)
    await once.record('one node could not be put back', write)
    await once.record('two nodes could not be put back', write)
    expect(write).toHaveBeenCalledTimes(2)
  })

  it('retries after a write that failed, because nothing was recorded', async () => {
    /**
     * Remembering before the write would turn a failed write into a fact nobody ever
     * records — absence reading as a pass, on the record that exists to prove
     * something happened.
     */
    const once = createJournalOnce()
    let attempts = 0
    const write = vi.fn(async () => {
      attempts += 1
      if (attempts === 1) throw new Error('the background is restarting')
    })

    await expect(once.record('a', write)).resolves.toBe('failed')
    expect(once.size(), 'a failed write was remembered as done').toBe(0)
    await expect(once.record('a', write)).resolves.toBe('written')
    expect(write).toHaveBeenCalledTimes(2)
  })

  it('does not let a failed write reject into the caller', async () => {
    // Every caller is on a path where the note is the least important thing happening.
    const once = createJournalOnce()
    await expect(
      once.record('a', async () => {
        throw new Error('database gone')
      }),
    ).resolves.toBe('failed')
  })

  it('keeps the facts of one frame to that frame to that frame', async () => {
    // Two instances, two memories: a content script runs per frame, and a fact about
    // one frame's node says nothing about another's.
    const a = createJournalOnce()
    const b = createJournalOnce()
    const write = vi.fn(async () => undefined)
    await a.record('same key', write)
    await b.record('same key', write)
    expect(write).toHaveBeenCalledTimes(2)
  })
})
