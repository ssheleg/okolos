/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it } from 'vitest'

import { whilePending } from './pending.js'

let region: HTMLElement
let button: HTMLButtonElement

beforeEach(() => {
  document.body.replaceChildren()
  region = document.createElement('div')
  button = document.createElement('button')
  button.type = 'button'
  region.append(button)
  document.body.append(region)
})

describe('a press is visible before its result arrives', () => {
  it('marks the pressed control while the work runs', async () => {
    button.focus()
    let seen: string | null = null
    await whilePending(document, region, async () => {
      seen = button.getAttribute('data-pending')
    })
    expect(seen).toBe('true')
  })

  it('tells assistive technology the control is busy', async () => {
    button.focus()
    let busy: string | null = null
    await whilePending(document, region, async () => {
      busy = button.getAttribute('aria-busy')
    })
    expect(busy).toBe('true')
  })

  it('stops the same action being fired twice while it is running', async () => {
    button.focus()
    let disabledDuring = false
    await whilePending(document, region, async () => {
      disabledDuring = button.disabled
    })
    expect(disabledDuring).toBe(true)
  })

  it('leaves the control on screen — a vanishing button reads as success', async () => {
    button.focus()
    await whilePending(document, region, async () => {
      expect(region.contains(button)).toBe(true)
      expect(button.hidden).toBe(false)
    })
  })

  it('returns what the work returned', async () => {
    button.focus()
    await expect(whilePending(document, region, async () => 'done')).resolves.toBe('done')
  })
})

describe('a failure gives the control back rather than leaving it dead', () => {
  it('clears the mark and re-throws', async () => {
    button.focus()
    await expect(
      whilePending(document, region, async () => {
        throw new Error('storage is gone')
      }),
    ).rejects.toThrow('storage is gone')

    expect(button.getAttribute('data-pending')).toBeNull()
    expect(button.getAttribute('aria-busy')).toBeNull()
    expect(button.disabled).toBe(false)
  })

  it('restores a control that was already disabled to being disabled', async () => {
    button.disabled = true
    button.focus()
    await expect(
      whilePending(document, region, async () => {
        throw new Error('nope')
      }),
    ).rejects.toThrow()
    expect(button.disabled).toBe(true)
  })

  it('does not swallow the failure — the caller decides what is said', async () => {
    button.focus()
    let told = false
    try {
      await whilePending(document, region, async () => {
        throw new Error('boom')
      })
    } catch {
      told = true
    }
    expect(told).toBe(true)
  })
})

describe('nothing is marked when nothing was pressed', () => {
  it('leaves an unfocused page alone', async () => {
    await whilePending(document, region, async () => {
      expect(region.querySelector('[data-pending]')).toBeNull()
    })
  })

  it('ignores focus outside the repainted region', async () => {
    const outside = document.createElement('button')
    document.body.append(outside)
    outside.focus()
    await whilePending(document, region, async () => {
      expect(outside.getAttribute('data-pending')).toBeNull()
    })
  })

  it('ignores a focused element that is not a button', async () => {
    const field = document.createElement('input')
    region.append(field)
    field.focus()
    await whilePending(document, region, async () => {
      expect(field.getAttribute('data-pending')).toBeNull()
    })
  })
})
