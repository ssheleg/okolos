/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mergeLeaks } from '@okolos/core-leaks'

import { renderLeaks, type LeaksHandlers, type LeaksState } from './leaks.js'

function handlers(overrides: Partial<LeaksHandlers> = {}): LeaksHandlers {
  return {
    onCheck: vi.fn(),
    onResolve: vi.fn(),
    onChangePassword: vi.fn(),
    onCheckReuse: vi.fn(),
    ...overrides,
  }
}

function render(state: LeaksState, h = handlers()): HTMLElement {
  const el = renderLeaks(document, state, h)
  document.body.append(el)
  return el
}

const role = (root: HTMLElement, name: string) => root.querySelector<HTMLElement>(`[data-role=${name}]`)

const NOW = '2026-08-06T00:00:00.000Z'

const LEAK = {
  name: 'ExampleCorp',
  occurredAt: '2024-03-01',
  source: 'HIBP',
  classes: ['email addresses', 'passwords'],
}

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('the number and its basis', () => {
  it('shows the coverage line beside the total, not beneath the fold', () => {
    const inventory = mergeLeaks([
      { name: 'HIBP', answered: true, leaks: [LEAK] },
      { name: 'Cavalier', answered: false, why: 'timed out' },
    ])
    const el = render({ kind: 'ready', inventory, now: NOW })

    expect(role(el, 'total')?.textContent).toContain('1 breach')
    expect(role(el, 'coverage')?.textContent).toMatch(/may be incomplete/i)
  })

  it('says what a clean result was checked against', () => {
    const inventory = mergeLeaks([{ name: 'HIBP', answered: true, leaks: [] }])
    const el = render({ kind: 'ready', inventory, now: NOW })
    expect(role(el, 'total')?.textContent).toMatch(/no breaches/i)
    expect(role(el, 'coverage')?.textContent).toContain('HIBP')
  })

  it('lists what each breach exposed', () => {
    const inventory = mergeLeaks([{ name: 'HIBP', answered: true, leaks: [LEAK] }])
    const el = render({ kind: 'ready', inventory, now: NOW })
    expect(role(el, 'classes')?.textContent).toContain('passwords')
  })

  it('lets the user mark one as dealt with', () => {
    const h = handlers()
    const inventory = mergeLeaks([{ name: 'HIBP', answered: true, leaks: [LEAK] }])
    render({ kind: 'ready', inventory, now: NOW }, h).querySelector<HTMLElement>('[data-role=resolve]')?.click()
    expect(h.onResolve).toHaveBeenCalledWith('ExampleCorp')
  })
})

describe('before and during', () => {
  it('says what checking will send before it is asked for', () => {
    // This asserted the word "hashed", and so pinned a false claim in place:
    // the leak sources take no hash, and the address itself is what goes. A
    // test can hold a lie steady as easily as a truth.
    const idle = role(render({ kind: 'idle' }), 'idle')?.textContent ?? ''
    expect(idle, 'the idle state must say the address is sent').toMatch(/sends your address/i)
    expect(idle, 'and must not imply the leak check is hashed').not.toMatch(/hashed form/i)
    expect(idle, 'while keeping the password check distinct').toMatch(/partial hash/i)
  })

  it('says it is working rather than showing an empty list', () => {
    const el = render({ kind: 'checking' })
    expect(role(el, 'status')).not.toBeNull()
    expect(role(el, 'total')).toBeNull()
  })
})

describe('when it fails', () => {
  it('never lets a failure read as good news', () => {
    const el = render({ kind: 'error', message: 'the network is unavailable' })
    expect(role(el, 'error-note')?.textContent).toMatch(/not a statement that nothing has leaked/i)
    expect(role(el, 'total')).toBeNull()
  })
})

describe('the credit the data carries with it', () => {
  it('names Have I Been Pwned and CC BY 4.0 on the screen that shows its data', () => {
    // The licence requires attribution wherever the data appears. A README a
    // user never opens is not where it appears.
    const inventory = mergeLeaks([{ name: 'HIBP', answered: true, leaks: [LEAK] }])
    const el = render({ kind: 'ready', inventory, now: NOW })
    expect(role(el, 'attribution')?.textContent).toContain('Have I Been Pwned')
    expect(role(el, 'attribution')?.textContent).toContain('CC BY 4.0')
  })

  it('carries it in every state, including the one that found nothing', () => {
    // "Nothing found" is still a result computed from someone else's work.
    for (const state of [
      { kind: 'idle' } as const,
      { kind: 'checking' } as const,
      { kind: 'error', message: 'offline' } as const,
      { kind: 'ready', inventory: mergeLeaks([{ name: 'HIBP', answered: true, leaks: [] }]), now: NOW } as const,
    ]) {
      document.body.innerHTML = ''
      expect(role(render(state), 'attribution')).not.toBeNull()
    }
  })
})

describe('the two piles, and what each is for', () => {
  const infection = {
    name: 'Infostealer infection',
    occurredAt: '2026-07-20',
    source: 'Hudson Rock Cavalier',
    classes: ['saved passwords', 'session cookies'],
  }

  it('separates a recent infection from an old breach', () => {
    // One list makes an infected machine look like a slightly newer breach.
    const inventory = mergeLeaks([{ name: 'HIBP', answered: true, leaks: [LEAK, infection] }])
    const el = render({ kind: 'ready', inventory, now: NOW })
    const urgencies = [...el.querySelectorAll('[data-role=leak-group]')].map((group) =>
      group.getAttribute('data-urgency'),
    )
    expect(urgencies).toEqual(['fresh-infostealer', 'historical'])
  })

  it('says why the urgent pile is urgent', () => {
    const inventory = mergeLeaks([{ name: 'Cavalier', answered: true, leaks: [infection] }])
    const el = render({ kind: 'ready', inventory, now: NOW })
    expect(role(el, 'group-why')?.textContent).toMatch(/session cookies/i)
  })
})

describe('the repair each entry offers', () => {
  const withDomain = { ...LEAK, domain: 'examplecorp.test' }

  it('offers the service its own change-password page', () => {
    const h = handlers()
    const inventory = mergeLeaks([{ name: 'HIBP', answered: true, leaks: [withDomain] }])
    render({ kind: 'ready', inventory, now: NOW }, h)
      .querySelector<HTMLElement>('[data-role=change-password]')
      ?.click()
    expect(h.onChangePassword).toHaveBeenCalledWith(expect.objectContaining({ domain: 'examplecorp.test' }))
  })

  it('says there is nowhere to send you when the source named no site', () => {
    // A button that guesses the address of a login page is worse than a
    // sentence admitting we do not have it.
    const inventory = mergeLeaks([{ name: 'HIBP', answered: true, leaks: [LEAK] }])
    const el = render({ kind: 'ready', inventory, now: NOW })
    expect(role(el, 'change-password')).toBeNull()
    expect(role(el, 'no-domain')?.textContent).toMatch(/nowhere to send you/i)
  })

  it('offers the reuse check on every entry, domain or not', () => {
    const h = handlers()
    const inventory = mergeLeaks([{ name: 'HIBP', answered: true, leaks: [LEAK] }])
    render({ kind: 'ready', inventory, now: NOW }, h)
      .querySelector<HTMLElement>('[data-role=check-reuse]')
      ?.click()
    expect(h.onCheckReuse).toHaveBeenCalledTimes(1)
  })

  it('calls the resolve control what the screen record calls it', () => {
    const inventory = mergeLeaks([{ name: 'HIBP', answered: true, leaks: [LEAK] }])
    const el = render({ kind: 'ready', inventory, now: NOW })
    expect(role(el, 'resolve')?.textContent).toBe('Mark resolved')
  })
})
