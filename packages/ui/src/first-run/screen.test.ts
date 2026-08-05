/** @vitest-environment happy-dom */
import { describe, expect, it, vi } from 'vitest'

import { renderFirstRun, type CheckRow } from './screen.js'

const handlers = { onContinue: vi.fn(), onSkip: vi.fn(), onOpenAudit: vi.fn() }

function rows(overrides: Partial<CheckRow>[] = []): CheckRow[] {
  const base: CheckRow[] = [
    { id: 'detector', label: 'Hidden-instruction detection', state: 'ok', note: 'active on every page you open' },
    { id: 'storage', label: 'Local storage', state: 'ok', note: 'ready' },
  ]
  return overrides.length > 0 ? (overrides as CheckRow[]) : base
}

describe('the first thing a new user sees', () => {
  it('lists every check by name rather than spinning without a label', () => {
    const el = renderFirstRun(document, { checks: rows(), findings: 0 }, handlers)
    const labels = [...el.querySelectorAll('[data-role=check-label]')].map((n) => n.textContent)
    expect(labels).toContain('Hidden-instruction detection')
    expect(el.querySelector('[data-role=spinner]:not([aria-label])')).toBeNull()
  })

  it('names what it did NOT check, and why', () => {
    // The scenario promises a scan of open tabs and installed extensions. Both
    // need permissions this version deliberately does not request, so the
    // screen says so instead of implying a scan that never ran.
    const el = renderFirstRun(
      document,
      {
        checks: rows([
          { id: 'detector', label: 'Hidden-instruction detection', state: 'ok', note: 'active' },
          {
            id: 'extensions',
            label: 'Installed extensions',
            state: 'unavailable',
            note: 'needs the extensions permission, which arrives with that feature',
          },
        ]),
        findings: 0,
      },
      handlers,
    )
    const unavailable = el.querySelector('[data-state=unavailable]')
    expect(unavailable?.textContent).toContain('needs the extensions permission')
  })

  it('says plainly that nothing was found, with what was actually checked', () => {
    const el = renderFirstRun(document, { checks: rows(), findings: 0 }, handlers)
    expect(el.querySelector('[data-role=result]')?.textContent).toContain('Nothing found')
    expect(el.querySelector('[data-role=result]')?.textContent).toContain('2 checks ran')
  })

  it('offers the next action only when there is something to act on', () => {
    const clean = renderFirstRun(document, { checks: rows(), findings: 0 }, handlers)
    expect(clean.querySelector<HTMLButtonElement>('[data-role=continue]')?.disabled).toBe(true)

    const found = renderFirstRun(document, { checks: rows(), findings: 3 }, handlers)
    const cta = found.querySelector<HTMLButtonElement>('[data-role=continue]')
    expect(cta?.disabled).toBe(false)
    expect(cta?.textContent).toContain('See what to do first')
  })

  it('links to the audit panel before asking for any trust', () => {
    const el = renderFirstRun(document, { checks: rows(), findings: 0 }, handlers)
    el.querySelector<HTMLButtonElement>('[data-role=what-this-sends]')?.click()
    expect(handlers.onOpenAudit).toHaveBeenCalled()
  })

  it('reports a failed check with its reason rather than hiding it', () => {
    const el = renderFirstRun(
      document,
      {
        checks: rows([
          { id: 'storage', label: 'Local storage', state: 'failed', note: 'database locked' },
        ]),
        findings: 0,
      },
      handlers,
    )
    expect(el.querySelector('[data-state=failed]')?.textContent).toContain('database locked')
    expect(el.querySelector('[data-role=retry]')).not.toBeNull()
  })

  it('says the run was partial when any check did not complete', () => {
    const el = renderFirstRun(
      document,
      {
        checks: rows([
          { id: 'a', label: 'One', state: 'ok', note: '' },
          { id: 'b', label: 'Two', state: 'failed', note: 'nope' },
        ]),
        findings: 0,
      },
      handlers,
    )
    expect(el.querySelector('[data-role=result]')?.textContent).toContain('This run was partial')
  })
})
