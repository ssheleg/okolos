/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { mergeLeaks } from '@okolos/core-leaks'

import { renderLeaks, type LeaksHandlers, type LeaksState } from './leaks.js'

function handlers(overrides: Partial<LeaksHandlers> = {}): LeaksHandlers {
  return { onCheck: vi.fn(), onResolve: vi.fn(), ...overrides }
}

function render(state: LeaksState, h = handlers()): HTMLElement {
  const el = renderLeaks(document, state, h)
  document.body.append(el)
  return el
}

const role = (root: HTMLElement, name: string) => root.querySelector<HTMLElement>(`[data-role=${name}]`)

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
    const el = render({ kind: 'ready', inventory })

    expect(role(el, 'total')?.textContent).toContain('1 breach')
    expect(role(el, 'coverage')?.textContent).toMatch(/may be incomplete/i)
  })

  it('says what a clean result was checked against', () => {
    const inventory = mergeLeaks([{ name: 'HIBP', answered: true, leaks: [] }])
    const el = render({ kind: 'ready', inventory })
    expect(role(el, 'total')?.textContent).toMatch(/no breaches/i)
    expect(role(el, 'coverage')?.textContent).toContain('HIBP')
  })

  it('lists what each breach exposed', () => {
    const inventory = mergeLeaks([{ name: 'HIBP', answered: true, leaks: [LEAK] }])
    const el = render({ kind: 'ready', inventory })
    expect(role(el, 'classes')?.textContent).toContain('passwords')
  })

  it('lets the user mark one as dealt with', () => {
    const h = handlers()
    const inventory = mergeLeaks([{ name: 'HIBP', answered: true, leaks: [LEAK] }])
    render({ kind: 'ready', inventory }, h).querySelector<HTMLElement>('[data-role=resolve]')?.click()
    expect(h.onResolve).toHaveBeenCalledWith('ExampleCorp')
  })
})

describe('before and during', () => {
  it('says what checking will send before it is asked for', () => {
    expect(role(render({ kind: 'idle' }), 'idle')?.textContent).toMatch(/hashed form/i)
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
