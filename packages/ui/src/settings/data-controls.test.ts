/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from 'vitest'

import { renderDataControls, type DataControlsHandlers } from './data-controls.js'

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fromCatalogue, useResolver, type Catalogue } from '@okolos/i18n'

/** The shipped Russian catalogue: `default_locale` is `ru`, and a fake would let a missing key pass. */
const CATALOGUE = JSON.parse(
  readFileSync(
    path.resolve(import.meta.dirname, '../../../../apps/extension/_locales/ru/messages.json'),
    'utf8',
  ),
) as Catalogue

useResolver(fromCatalogue(CATALOGUE))

/** The entry, or a failure that names the key rather than comparing to undefined. */
function message(key: string): string {
  const entry = CATALOGUE[key]
  if (!entry) throw new Error(`the shipped catalogue has no key "${key}"`)
  return entry.message
}

function handlers(overrides: Partial<DataControlsHandlers> = {}): DataControlsHandlers {
  return {
    onExport: vi.fn(async () => undefined),
    onWipe: vi.fn(async () => ({ ok: true, failed: [] as string[] })),
    onWiped: vi.fn(),
    ...overrides,
  }
}

/**
 * A list this renderer is *given*, not the list it must be given.
 *
 * The renderer's promise is narrow on purpose: it names every kind handed to it and
 * refuses an empty hand. Whether that hand holds all nine stores is a fact about
 * the schema, which this package does not depend on — `tools/data-kinds.test.ts`
 * checks it, and checking it here would have meant retyping the store list, which
 * is exactly how the defect survived: the renderer held five of nine, its test held
 * the same five, and two copies of a wrong list read as confirmation.
 */
const KINDS = [
  'dataKindFindings',
  'dataKindJournal',
  'dataKindAudit',
  'dataKindExceptions',
  'dataKindSettings',
  'dataKindSnapshots',
  'dataKindModels',
  'dataKindFeeds',
  'dataKindReuse',
] as const

function mount(
  h = handlers(),
  kinds: readonly string[] = KINDS,
): { el: HTMLElement; h: DataControlsHandlers } {
  const el = renderDataControls(document, h, kinds)
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
    // Every kind, by key. Listing the words here pinned the test to one language
    // and to the exact nouns, neither of which is what this control promises: it
    // promises to name everything it will delete. And the list comes from the
    // schema, because a list retyped in the test agrees with a wrong renderer.
    for (const key of KINDS) {
      expect(confirm, `the confirmation does not name ${key}`).toContain(message(key))
    }
  })

  it('draws one row per kind it was given, and no more', () => {
    // Counted as well as contained: `toContain` on the joined text passes when the
    // list is drawn twice, or when one row holds two kinds.
    const { el } = mount()
    el.querySelector<HTMLButtonElement>('[data-role=wipe]')?.click()
    expect(el.querySelectorAll('[data-role=confirm] li')).toHaveLength(KINDS.length)
  })

  it('refuses to render a confirmation that names nothing', () => {
    // An empty list would draw a dialog listing no data over a button that
    // deletes all of it, which reads as "nothing will be deleted". Louder at the
    // seam than wrong on the screen.
    expect(() => renderDataControls(document, handlers(), [])).toThrow(/must name what it deletes/)
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
      expect(failure).toContain(message('dataWipePartial').split('$')[0]?.trim())
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
