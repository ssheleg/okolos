/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { INCIDENTS, type IncidentKind } from '@okolos/core-recovery'

import { INCIDENT_LABEL_KEY, PICK_ORDER, renderIncidentPicker } from './picker.js'

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fromCatalogue, useResolver, type Catalogue } from '@okolos/i18n'

/**
 * The way in for someone the product did not warn in time.
 *
 * Every checklist opened because a detector fired — a ClickFix warning, a trap, a journal
 * link. A person who ran the pasted command and realised afterwards had nowhere to go,
 * while SCN-025's entry point read "the recovery entry in the popup" and SCR-13's `empty`
 * state read "the picker, nothing else". Recorded since they were written, never built
 * (B-59).
 */
const CATALOGUE = JSON.parse(
  readFileSync(
    path.resolve(import.meta.dirname, '../../../../apps/extension/_locales/ru/messages.json'),
    'utf8',
  ),
) as Catalogue

useResolver(fromCatalogue(CATALOGUE))

const message = (key: string): string => {
  const entry = CATALOGUE[key]
  if (!entry) throw new Error(`the shipped catalogue has no key "${key}"`)
  return entry.message
}

beforeEach(() => {
  document.body.innerHTML = ''
})

function render(onPick = vi.fn()): { el: HTMLElement; onPick: ReturnType<typeof vi.fn> } {
  const el = renderIncidentPicker(document, { onPick })
  document.body.append(el)
  return { el, onPick }
}

describe('the choices a person is offered', () => {
  it('offers one for every playbook that exists, and none that does not', () => {
    /**
     * SCR-13's Elements line listed "installed something" as a fifth choice and
     * `core-recovery` has no steps for it: offering it would hand back the broad list
     * under a specific name, which is the screen claiming to know more than it does.
     */
    const offered = [...document.body.querySelectorAll('[data-role=pick]')]
    expect(offered).toHaveLength(0)

    const { el } = render()
    const kinds = [...el.querySelectorAll('[data-role=pick]')].map((node) =>
      node.getAttribute('data-kind'),
    )
    expect(kinds.sort()).toEqual(Object.keys(INCIDENTS).sort())
  })

  it('puts "not sure" last, so it is not the one you pick by giving up', () => {
    // First on the list, it is what a hurried person chooses to skip the question — and
    // the checklist they get is the broad one when a specific one existed.
    expect(PICK_ORDER[PICK_ORDER.length - 1]).toBe('not-sure')
    const { el } = render()
    const last = [...el.querySelectorAll('[data-role=pick]')].pop()
    expect(last?.getAttribute('data-kind')).toBe('not-sure')
  })

  it('labels every choice from the catalogue', () => {
    const { el } = render()
    for (const kind of PICK_ORDER) {
      const node = el.querySelector(`[data-role=pick][data-kind="${kind}"]`)
      expect(node?.textContent, kind).toBe(message(INCIDENT_LABEL_KEY[kind]))
      expect(node?.textContent, kind).not.toMatch(/^\[/)
    }
  })

  it('asks the question rather than only listing answers', () => {
    // A list of four sentences with no question above them is a screen a frightened
    // person has to interpret. The ask also says what "not sure" will do.
    const { el } = render()
    expect(el.querySelector('[data-role=pick-ask]')?.textContent).toBe(message('recoveryPickAsk'))
    expect(el.querySelector('h1')?.textContent).toBe(message('recoveryPickTitle'))
  })
})

describe('picking one', () => {
  it('hands back the kind the checklist builder knows', () => {
    const { el, onPick } = render()
    const button = el.querySelector<HTMLElement>('[data-role=pick][data-kind="called-number"]')
    button?.click()

    expect(onPick).toHaveBeenCalledWith('called-number')
    const picked = onPick.mock.calls[0]?.[0] as IncidentKind
    expect(Object.hasOwn(INCIDENTS, picked), 'a kind with no playbook was offered').toBe(true)
  })

  it('reports nothing until something is chosen', () => {
    // A screen that decides for the user is worse than one that waits.
    const { onPick } = render()
    expect(onPick).not.toHaveBeenCalled()
  })
})
