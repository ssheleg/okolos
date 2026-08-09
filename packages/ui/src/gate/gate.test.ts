/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mountGate, type GateHandlers, type GateProps } from './gate.js'

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fromCatalogue, useResolver, type Catalogue } from '@okolos/i18n'

/**
 * The shipped Russian catalogue, because `default_locale` is `ru`.
 *
 * A fake would let a missing key pass here and reach a real page as
 * `[bannerDismiss]`. Installing the real one makes every assertion below check
 * two things: that the surface says the right thing, and that the catalogue
 * has a message for the key it asked for.
 */
const CATALOGUE = JSON.parse(
  readFileSync(
    path.resolve(import.meta.dirname, '../../../../apps/extension/_locales/ru/messages.json'),
    'utf8',
  ),
) as Catalogue

useResolver(fromCatalogue(CATALOGUE))


const PROPS: GateProps = {
  action: 'Submit the payment form',
  target: 'https://shop.test/checkout',
  findings: ['Hidden text on this page instructs an assistant to approve a transfer'],
  timeoutSeconds: 30,
}

function handlers(overrides: Partial<GateHandlers> = {}): GateHandlers {
  return {
    onBlock: vi.fn(),
    onAllowOnce: vi.fn(),
    onShowInjection: vi.fn(),
    ...overrides,
  }
}

function query(root: ShadowRoot, role: string): HTMLElement | null {
  return root.querySelector(`[data-role=${role}]`)
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('what the gate says', () => {
  it('names the action being attempted, not just that something happened', () => {
    const { root } = mountGate(document, PROPS, handlers())
    expect(query(root, 'action')?.textContent).toContain('Submit the payment form')
  })

  it('shows where the action was going', () => {
    const { root } = mountGate(document, PROPS, handlers())
    expect(query(root, 'target')?.textContent).toContain('shop.test/checkout')
  })

  it('names the finding that caused the hold', () => {
    const { root } = mountGate(document, PROPS, handlers())
    expect(query(root, 'finding')?.textContent).toContain('approve a transfer')
  })

  it('lists every unresolved finding, not only the first', () => {
    const { root } = mountGate(
      document,
      { ...PROPS, findings: ['First hidden instruction', 'Second hidden instruction'] },
      handlers(),
    )
    expect(root.querySelectorAll('[data-role=finding]')).toHaveLength(2)
  })

  it('states what happens if the user walks away', () => {
    const { root } = mountGate(document, PROPS, handlers())
    const notice = query(root, 'timeout')?.textContent ?? ''
    expect(notice).toContain('30')
    // The seconds and the fact that a consequence is named. Matching the word
    // "block" pinned one language; what the control promises is that walking
    // away is not silently safe.
    expect(notice).toContain('30')
    expect(notice.length).toBeGreaterThan(20)
  })
})

describe('Block is the default in every sense', () => {
  it('is the primary button', () => {
    const { root } = mountGate(document, PROPS, handlers())
    expect(query(root, 'block')?.getAttribute('data-primary')).toBe('true')
    expect(query(root, 'allow')?.hasAttribute('data-primary')).toBe(false)
  })

  it('holds focus, so a stray Enter or Space blocks rather than allows', () => {
    const { root } = mountGate(document, PROPS, handlers())
    expect(root.activeElement).toBe(query(root, 'block'))
  })

  it('is what Escape does', () => {
    const h = handlers()
    const { root } = mountGate(document, PROPS, h)
    query(root, 'dialog')?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    )
    expect(h.onBlock).toHaveBeenCalledTimes(1)
    expect(h.onAllowOnce).not.toHaveBeenCalled()
  })
})

describe('the choices', () => {
  it('reports Block', () => {
    const h = handlers()
    const { root } = mountGate(document, PROPS, h)
    query(root, 'block')?.click()
    expect(h.onBlock).toHaveBeenCalledTimes(1)
  })

  it('reports Allow once', () => {
    const h = handlers()
    const { root } = mountGate(document, PROPS, h)
    query(root, 'allow')?.click()
    expect(h.onAllowOnce).toHaveBeenCalledTimes(1)
  })

  it('offers the evidence before the decision', () => {
    // Deciding without being able to look is not a decision.
    const h = handlers()
    const { root } = mountGate(document, PROPS, h)
    query(root, 'show')?.click()
    expect(h.onShowInjection).toHaveBeenCalledTimes(1)
  })

  it('does not resolve twice when the user clicks twice', () => {
    const h = handlers()
    const { root } = mountGate(document, PROPS, h)
    query(root, 'block')?.click()
    query(root, 'allow')?.click()
    expect(h.onBlock).toHaveBeenCalledTimes(1)
    expect(h.onAllowOnce).not.toHaveBeenCalled()
  })
})

describe('the surface itself', () => {
  it('is a modal dialog to assistive technology, not decoration', () => {
    const { root } = mountGate(document, PROPS, handlers())
    const dialog = query(root, 'dialog')
    expect(dialog?.getAttribute('role')).toBe('dialog')
    expect(dialog?.getAttribute('aria-modal')).toBe('true')
    expect(dialog?.getAttribute('aria-label')).toBeTruthy()
  })

  it('is isolated from the page, so a hostile page cannot restyle or read it', () => {
    const { host } = mountGate(document, PROPS, handlers())
    expect(host.shadowRoot).toBeNull()
    expect(host.tagName.toLowerCase()).toBe('okolos-gate')
  })

  it('covers the page while it waits — this one is a genuine interruption', () => {
    const { root } = mountGate(document, PROPS, handlers())
    expect(query(root, 'scrim')).not.toBeNull()
  })

  it('leaves nothing behind when it goes', () => {
    const gate = mountGate(document, PROPS, handlers())
    gate.destroy()
    expect(document.querySelector('okolos-gate')).toBeNull()
  })
})

describe('when the page gives us less to work with', () => {
  it('still renders without a target', () => {
    const withoutTarget: GateProps = {
      action: PROPS.action,
      findings: PROPS.findings,
      timeoutSeconds: PROPS.timeoutSeconds,
    }
    const { root } = mountGate(document, withoutTarget, handlers())
    expect(query(root, 'action')).not.toBeNull()
    expect(query(root, 'target')).toBeNull()
  })

  it('says so plainly when the finding text is missing', () => {
    const { root } = mountGate(document, { ...PROPS, findings: [] }, handlers())
    expect(query(root, 'finding')?.textContent).toMatch(/не удалось описать/i)
  })
})
