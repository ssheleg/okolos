/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { buildChecklist } from '@okolos/core-recovery'

import { renderRecovery, type RecoveryHandlers } from './recovery.js'

function handlers(overrides: Partial<RecoveryHandlers> = {}): RecoveryHandlers {
  return { onToggle: vi.fn(), onArchive: vi.fn(), onCopy: vi.fn(), ...overrides }
}

function render(kind: string, progress: Array<{ stepId: string; doneAt: string }> = [], h = handlers()) {
  const el = renderRecovery(document, buildChecklist(kind, progress), h)
  document.body.append(el)
  return el
}

const role = (root: HTMLElement, name: string) => root.querySelector<HTMLElement>(`[data-role=${name}]`)

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('the list itself', () => {
  it('is ordered, with the most damaging step first', () => {
    const el = render('pasted-command')
    expect(el.querySelector('[data-role=step]')?.getAttribute('data-step')).toBe('disconnect')
  })

  it('gives every step its reason', () => {
    const el = render('pasted-command')
    for (const step of el.querySelectorAll('[data-role=step]')) {
      expect(step.querySelector('[data-role=why]')?.textContent?.length ?? 0).toBeGreaterThan(20)
    }
  })

  it('says which steps cannot be done here', () => {
    // Discovering that halfway through is where people stop.
    const el = render('pasted-command')
    expect(role(el, 'elsewhere')).not.toBeNull()
  })
})

describe('progress', () => {
  it('counts what is left', () => {
    expect(role(render('entered-password'), 'progress')?.textContent).toContain('4 steps left')
  })

  it('marks a finished step and reduces the count', () => {
    const el = render('entered-password', [{ stepId: 'change-password', doneAt: 'now' }])
    expect(el.querySelector('[data-step=change-password]')?.getAttribute('data-done')).toBe('true')
    expect(role(el, 'progress')?.textContent).toContain('3 steps left')
  })

  it('reports a step being ticked', () => {
    const h = handlers()
    const el = render('entered-password', [], h)
    el.querySelector<HTMLInputElement>('[data-role=done]')?.click()
    expect(h.onToggle).toHaveBeenCalledWith('change-password', true)
  })

  it('offers to archive only once everything is done', () => {
    expect(role(render('entered-password'), 'archive')).toBeNull()
    const all = buildChecklist('entered-password').steps.map((step) => ({ stepId: step.id, doneAt: 'now' }))
    expect(role(render('entered-password', all), 'archive')).not.toBeNull()
  })
})

describe('when we do not know what happened', () => {
  it('says the list is the broad one rather than answering a different question', () => {
    expect(role(render('something-nobody-defined'), 'generic')?.textContent).toMatch(/broadest safe/i)
  })
})

describe('reachable without a mouse', () => {
  it('associates every checkbox with its label', () => {
    // A checkbox whose label is merely adjacent is an unlabelled checkbox to
    // everything except a sighted mouse user.
    const el = render('pasted-command')
    for (const item of el.querySelectorAll('[data-role=step]')) {
      const box = item.querySelector('input[type=checkbox]')
      const label = item.querySelector('label')
      expect(box?.id).toBeTruthy()
      expect(label?.getAttribute('for')).toBe(box?.id)
    }
  })
})

describe('taking the rest with you', () => {
  it('shows the remaining steps as text, whether or not the clipboard works', () => {
    // A clipboard permission the browser declines must not be the thing that
    // strands someone mid-recovery.
    const el = render('pasted-command')
    expect(role(el, 'portable-text')?.textContent).toContain('Disconnect this device')
  })

  it('says how many of them this browser cannot do', () => {
    expect(role(render('pasted-command'), 'portable-why')?.textContent).toMatch(
      /cannot be done in this browser/i,
    )
  })

  it('says outright that nothing is sent anywhere', () => {
    // The alternative design — syncing the incident to a server so it appears
    // on the phone — is the one this product cannot make.
    expect(role(render('pasted-command'), 'portable-why')?.textContent).toMatch(/nothing is sent/i)
  })

  it('copies exactly what it displays', () => {
    const h = handlers()
    const el = render('pasted-command', [], h)
    role(el, 'copy')?.click()
    expect(h.onCopy).toHaveBeenCalledWith(role(el, 'portable-text')?.textContent)
  })

  it('renders the text even with no copy handler at all', () => {
    const el = renderRecovery(document, buildChecklist('pasted-command'), {
      onToggle: vi.fn(),
      onArchive: vi.fn(),
    })
    document.body.append(el)
    expect(el.querySelector('[data-role=portable-text]')).not.toBeNull()
    expect(el.querySelector('[data-role=copy]')).toBeNull()
  })

  it('offers nothing to carry once everything is done', () => {
    const all = buildChecklist('entered-password').steps.map((step) => ({
      stepId: step.id,
      doneAt: 'now',
    }))
    const el = render('entered-password', all)
    expect(role(el, 'portable')).toBeNull()
    expect(role(el, 'archive')).not.toBeNull()
  })
})
