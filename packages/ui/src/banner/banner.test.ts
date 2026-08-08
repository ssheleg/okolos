/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { mountBanner, type BannerHandlers, type BannerProps } from './banner.js'

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

function props(overrides: Partial<BannerProps> = {}): BannerProps {
  return {
    variant: 'injection',
    severity: 'major',
    headline: 'This page carries instructions written for an AI assistant',
    detail: 'They were removed before your assistant could read them.',
    sourceLine: 'Found by: hidden-text rules · checked just now',
    ...overrides,
  }
}

function handlers(overrides: Partial<BannerHandlers> = {}): BannerHandlers {
  return { onPrimary: vi.fn(), onRetry: vi.fn(), onDispute: vi.fn(), onDismiss: vi.fn(), ...overrides }
}

beforeEach(() => {
  document.body.innerHTML = ''
})

/** The banner lives in a closed root; tests reach in through the handle. */
function shadowOf(handle: ReturnType<typeof mountBanner>): ShadowRoot {
  return handle.root
}

describe('the page cannot reach the warning', () => {
  it('mounts inside a closed shadow root', () => {
    const handle = mountBanner(document, props(), handlers())
    expect(handle.host.shadowRoot).toBeNull()
    expect(shadowOf(handle).querySelector('[data-role=headline]')).not.toBeNull()
  })

  it('leaves nothing of itself in the page document', () => {
    const handle = mountBanner(document, props(), handlers())
    expect(document.querySelector('[data-role=headline]')).toBeNull()
    handle.destroy()
    expect(document.body.children).toHaveLength(0)
  })
})

describe('what it says', () => {
  it('states the finding in one sentence and names where the verdict came from', () => {
    const handle = mountBanner(document, props(), handlers())
    const root = shadowOf(handle)
    expect(root.querySelector('[data-role=headline]')?.textContent).toContain(
      'instructions written for an AI assistant',
    )
    expect(root.querySelector('[data-role=source]')?.textContent).toContain('hidden-text rules')
  })

  it('carries severity as text, never as colour alone', () => {
    const handle = mountBanner(document, props({ severity: 'critical' }), handlers())
    const label = shadowOf(handle).querySelector('[data-role=severity]')
    expect(label?.textContent?.trim()).toBe('Критично')
  })

  it('announces itself to assistive technology', () => {
    const handle = mountBanner(document, props(), handlers())
    const panel = shadowOf(handle).querySelector('[data-role=panel]')
    expect(panel?.getAttribute('role')).toBe('alert')
    expect(panel?.getAttribute('aria-live')).toBe('assertive')
  })

  it('shows exactly one primary action', () => {
    const handle = mountBanner(document, props(), handlers())
    expect(shadowOf(handle).querySelectorAll('[data-primary=true]')).toHaveLength(1)
  })
})

describe('every verdict is disputable', () => {
  it('offers "this is wrong" on every variant', () => {
    for (const variant of ['injection', 'lookalike', 'clickfix', 'download', 'password'] as const) {
      const handle = mountBanner(document, props({ variant }), handlers())
      expect(shadowOf(handle).querySelector('[data-role=dispute]')).not.toBeNull()
      handle.destroy()
    }
  })

  it('calls the dispute handler rather than silently hiding itself', () => {
    const onDispute = vi.fn()
    const handle = mountBanner(document, props(), handlers({ onDispute }))
    shadowOf(handle).querySelector<HTMLButtonElement>('[data-role=dispute]')?.click()
    expect(onDispute).toHaveBeenCalledOnce()
  })
})

describe('blocking variants are harder to wave away than the rest', () => {
  it('a ClickFix warning cannot be dismissed by a stray Escape', () => {
    const onDismiss = vi.fn()
    const handle = mountBanner(document, props({ variant: 'clickfix' }), handlers({ onDismiss }))
    shadowOf(handle)
      .querySelector('[data-role=panel]')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(onDismiss).not.toHaveBeenCalled()
  })

  it('an advisory warning does close on Escape', () => {
    const onDismiss = vi.fn()
    const handle = mountBanner(document, props({ variant: 'lookalike' }), handlers({ onDismiss }))
    shadowOf(handle)
      .querySelector('[data-role=panel]')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(onDismiss).toHaveBeenCalledOnce()
  })
})

describe('when something goes wrong inside the warning', () => {
  it('shows the failure and keeps the warning on screen', () => {
    const handle = mountBanner(document, props(), handlers())
    handle.showError('Could not load the details')
    const root = shadowOf(handle)
    expect(root.querySelector('[data-role=error]')?.textContent).toContain('Could not load')
    // The warning itself must survive: an error in the detail view is not a
    // reason to stop telling the user the page is dangerous.
    expect(root.querySelector('[data-role=headline]')).not.toBeNull()
    expect(root.querySelector('[data-role=retry]')).not.toBeNull()
  })
})
