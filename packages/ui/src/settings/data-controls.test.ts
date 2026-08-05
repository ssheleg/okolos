/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from 'vitest'

import { renderDataControls, type DataControlsHandlers } from './data-controls.js'

function handlers(overrides: Partial<DataControlsHandlers> = {}): DataControlsHandlers {
  return {
    onExport: vi.fn(async () => undefined),
    onWipe: vi.fn(async () => ({ ok: true, failed: [] as string[] })),
    onWiped: vi.fn(),
    ...overrides,
  }
}

function mount(h = handlers()): { el: HTMLElement; h: DataControlsHandlers } {
  const el = renderDataControls(document, h)
  document.body.replaceChildren(el)
  return { el, h }
}

describe('leaving costs one click and no residue', () => {
  it('offers export without any confirmation — nothing is destroyed', async () => {
    const { el, h } = mount()
    el.querySelector<HTMLButtonElement>('[data-role=export]')?.click()
    expect(h.onExport).toHaveBeenCalledOnce()
    expect(el.querySelector('[data-role=confirm]')).toBeNull()
  })
})

describe('wiping asks once, and says what it will take', () => {
  it('does not delete on the first click', async () => {
    const { el, h } = mount()
    el.querySelector<HTMLButtonElement>('[data-role=wipe]')?.click()
    expect(h.onWipe).not.toHaveBeenCalled()
  })

  it('names every category it is about to delete', () => {
    const { el } = mount()
    el.querySelector<HTMLButtonElement>('[data-role=wipe]')?.click()
    const confirm = el.querySelector('[data-role=confirm]')?.textContent ?? ''
    for (const category of ['findings', 'journal', 'outbound log', 'trusted domains', 'settings']) {
      expect(confirm).toContain(category)
    }
  })

  it('deletes only after the second, explicit confirmation', async () => {
    const { el, h } = mount()
    el.querySelector<HTMLButtonElement>('[data-role=wipe]')?.click()
    el.querySelector<HTMLButtonElement>('[data-role=confirm-yes]')?.click()
    await vi.waitFor(() => expect(h.onWipe).toHaveBeenCalledOnce())
  })

  it('lets the user back out, leaving everything in place', () => {
    const { el, h } = mount()
    el.querySelector<HTMLButtonElement>('[data-role=wipe]')?.click()
    el.querySelector<HTMLButtonElement>('[data-role=confirm-no]')?.click()
    expect(h.onWipe).not.toHaveBeenCalled()
    expect(el.querySelector('[data-role=confirm]')).toBeNull()
  })
})

describe('a wipe that half-worked never reports success', () => {
  it('names the stores it could not clear and offers a retry', async () => {
    const h = handlers({ onWipe: vi.fn(async () => ({ ok: false, failed: ['journal'] })) })
    const { el } = mount(h)
    el.querySelector<HTMLButtonElement>('[data-role=wipe]')?.click()
    el.querySelector<HTMLButtonElement>('[data-role=confirm-yes]')?.click()

    await vi.waitFor(() => {
      const failure = el.querySelector('[data-role=wipe-failed]')?.textContent ?? ''
      expect(failure).toContain('journal')
      expect(failure).toContain('not deleted')
    })
    expect(el.querySelector('[data-role=wipe-retry]')).not.toBeNull()
  })

  it('tells the caller only when everything really went', async () => {
    const h = handlers()
    const { el } = mount(h)
    el.querySelector<HTMLButtonElement>('[data-role=wipe]')?.click()
    el.querySelector<HTMLButtonElement>('[data-role=confirm-yes]')?.click()
    await vi.waitFor(() => expect(h.onWiped).toHaveBeenCalledOnce())
  })

  it('does not announce success when the wipe was partial', async () => {
    const h = handlers({ onWipe: vi.fn(async () => ({ ok: false, failed: ['settings'] })) })
    const { el } = mount(h)
    el.querySelector<HTMLButtonElement>('[data-role=wipe]')?.click()
    el.querySelector<HTMLButtonElement>('[data-role=confirm-yes]')?.click()
    await vi.waitFor(() => expect(el.querySelector('[data-role=wipe-failed]')).not.toBeNull())
    expect(h.onWiped).not.toHaveBeenCalled()
  })
})
