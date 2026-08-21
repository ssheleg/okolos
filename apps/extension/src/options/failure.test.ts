/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it } from 'vitest'

import { FAILURE_ROLE, showFailure } from './failure.js'

let root: HTMLElement

beforeEach(() => {
  document.body.innerHTML = ''
  root = document.createElement('div')
  root.id = 'root'
  document.body.append(root)
})

const slots = (): NodeListOf<Element> => root.querySelectorAll(`[data-role='${FAILURE_ROLE}']`)

describe('a failed action answers on the page', () => {
  it('says what happened, at the top where the page starts', () => {
    showFailure(document, root, 'the store refused the write')
    expect(slots()).toHaveLength(1)
    expect(root.firstElementChild?.textContent).toBe('the store refused the write')
  })

  it('is announced, because the reader is looking at the control they pressed', () => {
    showFailure(document, root, 'no')
    expect(root.firstElementChild?.getAttribute('role')).toBe('alert')
  })

  it('is one slot: a second failure replaces the first rather than stacking', () => {
    // The defect SCN-023 records from the wipe screen — three clicks on a failing action
    // produced three identical lines.
    showFailure(document, root, 'first')
    showFailure(document, root, 'second')
    expect(slots()).toHaveLength(1)
    expect(slots()[0]?.textContent).toBe('second')
  })

  it('goes away when there is nothing to say, rather than lingering as stale news', () => {
    showFailure(document, root, 'first')
    expect(showFailure(document, root, null)).toBeNull()
    expect(slots()).toHaveLength(0)
  })

  it('leaves whatever else is on the page alone', () => {
    const panel = document.createElement('section')
    panel.setAttribute('data-role', 'queue-section')
    root.append(panel)
    showFailure(document, root, 'no')
    expect(root.querySelector('[data-role=queue-section]')).not.toBeNull()
    showFailure(document, root, null)
    expect(root.querySelector('[data-role=queue-section]')).not.toBeNull()
  })
})
