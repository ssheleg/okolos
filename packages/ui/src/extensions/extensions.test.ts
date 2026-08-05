/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { InventoryChange } from '@okolos/core-extensions'

import { renderExtensions, type ExtensionsHandlers, type ExtensionsState } from './extensions.js'

function handlers(overrides: Partial<ExtensionsHandlers> = {}): ExtensionsHandlers {
  return { onDisable: vi.fn(), onTrust: vi.fn(), onInspect: vi.fn(), ...overrides }
}

const CHANGE: InventoryChange = {
  kind: 'permission-added',
  id: 'abc',
  name: 'Colour Picker',
  detail: 'Colour Picker now asks for cookies, which it did not before.',
  severity: 'critical',
}

const NOTE =
  'No browser hands one extension another’s code, so nothing here can be analysed on its own.'

const ROW = { id: 'abc', name: 'Colour Picker', version: '2.0.0', permissions: ['storage'], enabled: true }

function render(state: ExtensionsState, h = handlers()): HTMLElement {
  const el = renderExtensions(document, state, h)
  document.body.append(el)
  return el
}

const role = (root: HTMLElement, name: string) => root.querySelector<HTMLElement>(`[data-role=${name}]`)

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('the delta comes first', () => {
  it('shows what changed above the inventory', () => {
    const el = render({ kind: 'ready', changes: [CHANGE], installed: [ROW], analysis: null, analysisNote: NOTE })
    const roles = [...el.querySelectorAll('[data-role=change], [data-role=installed]')].map((node) =>
      node.getAttribute('data-role'),
    )
    expect(roles[0]).toBe('change')
  })

  it('says what the change actually was', () => {
    const el = render({ kind: 'ready', changes: [CHANGE], installed: [], analysis: null, analysisNote: NOTE })
    expect(role(el, 'detail')?.textContent).toContain('cookies')
  })

  it('carries the severity, so the styling has something to key off', () => {
    const el = render({ kind: 'ready', changes: [CHANGE], installed: [], analysis: null, analysisNote: NOTE })
    expect(role(el, 'change')?.getAttribute('data-severity')).toBe('critical')
  })

  it('says plainly when nothing changed', () => {
    const el = render({ kind: 'ready', changes: [], installed: [ROW], analysis: null, analysisNote: NOTE })
    expect(role(el, 'no-changes')?.textContent).toMatch(/nothing has changed/i)
  })
})

describe('the action is real', () => {
  it('disables the extension the change was about', () => {
    // A security screen whose only verb is "review" leaves the user exactly
    // where they started.
    const h = handlers()
    const el = render({ kind: 'ready', changes: [CHANGE], installed: [], analysis: null, analysisNote: NOTE }, h)
    role(el, 'change-actions')?.querySelector<HTMLElement>('[data-role=disable]')?.click()
    expect(h.onDisable).toHaveBeenCalledWith('abc')
  })

  it('lets the user accept a change instead', () => {
    const h = handlers()
    const el = render({ kind: 'ready', changes: [CHANGE], installed: [], analysis: null, analysisNote: NOTE }, h)
    role(el, 'trust')?.click()
    expect(h.onTrust).toHaveBeenCalledWith('abc')
  })

  it('offers disabling from the inventory too, not only from a change', () => {
    const h = handlers()
    const el = render({ kind: 'ready', changes: [], installed: [ROW], analysis: null, analysisNote: NOTE }, h)
    role(el, 'installed')?.querySelector<HTMLElement>('[data-role=disable]')?.click()
    expect(h.onDisable).toHaveBeenCalledWith('abc')
  })

  it('does not offer to disable something already off', () => {
    const el = render({
      kind: 'ready',
      changes: [],
      installed: [{ ...ROW, enabled: false }],
      analysis: null,
      analysisNote: NOTE,
    })
    expect(role(el, 'installed')?.querySelector('[data-role=disable]')).toBeNull()
    expect(role(el, 'disabled')?.textContent).toMatch(/already off/i)
  })
})

describe('what it will not claim', () => {
  it('never shows an empty list in place of a failure', () => {
    const el = render({ kind: 'error', message: 'the store is unreadable' })
    expect(role(el, 'error-note')?.textContent).toMatch(/not a statement that nothing changed/i)
    expect(role(el, 'no-changes')).toBeNull()
  })

  it('says when this browser will not answer at all', () => {
    const el = render({ kind: 'unsupported', why: 'this browser does not let an extension read the others' })
    expect(role(el, 'unsupported')?.textContent).toMatch(/does not let/i)
  })

  it('states when a package could not be read rather than implying it was clean', () => {
    const el = render({ kind: 'ready', changes: [], installed: [ROW], analysis: null, analysisNote: NOTE })
    expect(role(el, 'analysis-note')?.textContent).toMatch(/nothing here can be analysed/i)
  })
})

describe('inspecting a package the user supplies', () => {
  const REPORT = {
    findings: [
      { kind: 'remote-code' as const, evidence: 'importScripts("https://cdn.test/x.js")', where: 'a.js' },
    ],
    endpoints: ['https://cdn.test'],
    minified: false,
    note: 'What is listed is what was found in the text. None of it is proof of intent.',
  }

  it('explains why nothing can be analysed on its own', () => {
    // Silence here would read as "nothing to report" rather than "this cannot
    // be done from a browser extension at all".
    const el = render({ kind: 'ready', changes: [], installed: [], analysis: null, analysisNote: NOTE })
    expect(role(el, 'analysis-note')?.textContent).toMatch(/nothing here can be analysed/i)
  })

  it('offers a file the user chooses, and labels the control', () => {
    const el = render({ kind: 'ready', changes: [], installed: [], analysis: null, analysisNote: NOTE })
    const picker = role(el, 'inspect') as HTMLInputElement
    expect(picker.type).toBe('file')
    expect(el.querySelector('label')?.getAttribute('for')).toBe(picker.id)
  })

  it('shows what was found, verbatim', () => {
    const el = render({
      kind: 'ready',
      changes: [],
      installed: [],
      analysis: REPORT,
      analysisNote: NOTE,
    })
    expect(role(el, 'evidence')?.textContent).toContain('importScripts')
    expect(role(el, 'finding')?.getAttribute('data-kind')).toBe('remote-code')
  })

  it('shows the report’s own caveat beside its findings', () => {
    // Evidence, not an accusation: eval appears in polyfills and minified code
    // looks obfuscated. Filing that away would turn a list into a verdict.
    const el = render({
      kind: 'ready',
      changes: [],
      installed: [],
      analysis: REPORT,
      analysisNote: NOTE,
    })
    expect(role(el, 'analysis-caveat')?.textContent).toMatch(/no.*proof of intent/i)
  })

  it('says plainly when a clean file is clean', () => {
    const el = render({
      kind: 'ready',
      changes: [],
      installed: [],
      analysis: { findings: [], endpoints: [], minified: false, note: 'ok' },
      analysisNote: NOTE,
    })
    expect(role(el, 'analysis-summary')?.textContent).toMatch(/nothing of note/i)
  })
})
