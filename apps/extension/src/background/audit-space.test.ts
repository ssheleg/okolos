import { describe, expect, it, vi } from 'vitest'

import { isOutOfSpace, spaceAwareWrite } from './audit-space.js'

describe('recognising a full device', () => {
  it('knows the name every engine uses', () => {
    const err = new Error('nope')
    err.name = 'QuotaExceededError'
    expect(isOutOfSpace(err)).toBe(true)
  })

  it('reads the message when the name is missing', () => {
    expect(isOutOfSpace(new Error('The quota has been exceeded.'))).toBe(true)
  })

  it('does not mistake an ordinary failure for a full device', () => {
    // Sweeping on every write failure would delete the user's journal because
    // a transaction happened to abort.
    expect(isOutOfSpace(new Error('transaction aborted'))).toBe(false)
    expect(isOutOfSpace(null)).toBe(false)
    expect(isOutOfSpace('quota')).toBe(false)
  })
})

describe('writing when there is no room', () => {
  const full = () => {
    const err = new Error('out of space')
    err.name = 'QuotaExceededError'
    return err
  }

  it('writes straight through when there is room', async () => {
    const write = vi.fn(async () => undefined)
    const freeSpace = vi.fn(async () => undefined)
    await spaceAwareWrite({ write, freeSpace, report: vi.fn() })({ id: 'a' })
    expect(write).toHaveBeenCalledTimes(1)
    expect(freeSpace, 'nothing was deleted for a write that worked').not.toHaveBeenCalled()
  })

  it('sweeps once and succeeds', async () => {
    let room = false
    const write = vi.fn(async () => {
      if (!room) throw full()
    })
    const report = vi.fn()
    await spaceAwareWrite({
      write,
      freeSpace: async () => {
        room = true
      },
      report,
    })({ id: 'a' })

    expect(write).toHaveBeenCalledTimes(2)
    expect(report).toHaveBeenCalledWith('swept-to-make-room')
  })

  it('gives up after one sweep rather than looping', async () => {
    // A loop here would sit between the user and every request the extension
    // makes. If a sweep did not make room, the next will not either.
    const write = vi.fn(async () => {
      throw full()
    })
    const freeSpace = vi.fn(async () => undefined)
    const report = vi.fn()

    await expect(spaceAwareWrite({ write, freeSpace, report })({ id: 'a' })).rejects.toThrow()
    expect(write).toHaveBeenCalledTimes(2)
    expect(freeSpace).toHaveBeenCalledTimes(1)
    expect(report).toHaveBeenCalledWith('still-full')
  })

  it('passes an unrelated failure straight up without deleting anything', async () => {
    const freeSpace = vi.fn(async () => undefined)
    const write = async () => {
      throw new Error('transaction aborted')
    }
    await expect(
      spaceAwareWrite({ write, freeSpace, report: vi.fn() })({ id: 'a' }),
    ).rejects.toThrow(/aborted/)
    expect(freeSpace).not.toHaveBeenCalled()
  })
})
