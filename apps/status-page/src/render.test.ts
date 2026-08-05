/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { renderStatus, type StatusHandlers, type StatusState } from './render.js'

function handlers(overrides: Partial<StatusHandlers> = {}): StatusHandlers {
  return { onCheck: vi.fn(), onAppeal: vi.fn(), ...overrides }
}

function render(state: StatusState, h = handlers()): HTMLElement {
  const el = renderStatus(document, state, h)
  document.body.append(el)
  return el
}

const role = (root: HTMLElement, name: string) => root.querySelector<HTMLElement>(`[data-role=${name}]`)

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('an owner arriving with no account', () => {
  it('is told none is needed', () => {
    expect(role(render({ kind: 'idle' }), 'hint')?.textContent).toMatch(/no account/i)
  })

  it('can check a domain in one control', () => {
    const h = handlers()
    const el = render({ kind: 'idle' }, h)
    ;(role(el, 'domain') as HTMLInputElement).value = 'mysite.test'
    role(el, 'check')?.click()
    expect(h.onCheck).toHaveBeenCalledWith('mysite.test')
  })
})

describe('what the answer says', () => {
  it('states plainly when nothing is recorded', () => {
    const el = render({ kind: 'not-listed', domain: 'mysite.test' })
    expect(role(el, 'verdict')?.textContent).toContain('Nothing is recorded')
    expect(role(el, 'note')?.textContent).toMatch(/not coming from here/i)
  })

  it('names the list and the date when there is one', () => {
    const el = render({
      kind: 'listed',
      domain: 'mysite.test',
      feed: 'OpenPhish',
      entryDate: '2026-08-01',
      appealTo: 'OpenPhish',
    })
    expect(role(el, 'verdict')?.textContent).toContain('OpenPhish')
    expect(role(el, 'verdict')?.textContent).toContain('2026-08-01')
  })

  it('sends the owner upstream when the listing is not ours', () => {
    const el = render({
      kind: 'listed',
      domain: 'mysite.test',
      feed: 'OpenPhish',
      entryDate: '2026-08-01',
      appealTo: 'OpenPhish',
    })
    expect(role(el, 'upstream')?.textContent).toMatch(/their own appeal process/i)
    expect(role(el, 'appeal')).toBeNull()
  })

  it('offers an appeal when the listing is ours', () => {
    const h = handlers()
    const el = render(
      { kind: 'listed', domain: 'mysite.test', feed: 'okolos', entryDate: '2026-08-01', appealTo: 'okolos' },
      h,
    )
    role(el, 'appeal')?.click()
    expect(h.onAppeal).toHaveBeenCalledWith('mysite.test')
  })

  it('gives a reference an owner can quote', () => {
    const el = render({ kind: 'appealed', domain: 'mysite.test', reference: 'OK-1A2B3C' })
    expect(role(el, 'reference')?.textContent).toContain('OK-1A2B3C')
  })
})

describe('when the lookup fails', () => {
  it('never lets a failure read as "your site is fine"', () => {
    const el = render({ kind: 'unknown', domain: 'mysite.test', detail: 'the service is unavailable' })
    expect(role(el, 'error-note')?.textContent).toMatch(/does not mean the domain is clear/i)
    expect(role(el, 'verdict')).toBeNull()
  })
})
