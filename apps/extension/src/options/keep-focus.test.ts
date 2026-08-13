/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it } from 'vitest'

import { applyFocus, keepingFocus, markFocus } from './keep-focus.js'

let region: HTMLElement

/**
 * A stand-in for one repainted area: a list of rows, each with the same two
 * controls. Nothing here carries an id, because the real renderers do not —
 * queue rows are `data-role="item"` and their buttons are `data-role="done"`,
 * and two rows are indistinguishable by attribute alone.
 */
function paint(rows: number, extraFirst = false): void {
  region.replaceChildren()
  const list = document.createElement('ul')
  list.setAttribute('data-role', 'queue')
  for (let i = 0; i < rows; i += 1) {
    const row = document.createElement('li')
    row.setAttribute('data-role', 'item')
    row.textContent = `row ${i}`
    if (extraFirst && i === 0) {
      const note = document.createElement('span')
      note.setAttribute('data-role', 'note')
      row.append(note)
    }
    for (const role of ['done', 'later']) {
      const button = document.createElement('button')
      button.setAttribute('data-role', role)
      button.type = 'button'
      row.append(button)
    }
    list.append(row)
  }
  region.append(list)
}

beforeEach(() => {
  document.body.replaceChildren()
  region = document.createElement('div')
  document.body.append(region)
})

const button = (row: number, role: string): HTMLButtonElement =>
  region.querySelectorAll('[data-role=item]')[row]?.querySelector(`[data-role=${role}]`) as HTMLButtonElement

describe('focus survives a repaint for any control, not one named field', () => {
  it('returns to the same button in the same row', () => {
    paint(3)
    button(1, 'done').focus()
    keepingFocus(region, document, () => paint(3))
    expect(document.activeElement).toBe(button(1, 'done'))
  })

  it('tells two controls in one row apart', () => {
    paint(2)
    button(0, 'later').focus()
    keepingFocus(region, document, () => paint(2))
    expect(document.activeElement).toBe(button(0, 'later'))
    expect(document.activeElement).not.toBe(button(0, 'done'))
  })

  it('tells the same control in two rows apart', () => {
    paint(3)
    button(2, 'done').focus()
    keepingFocus(region, document, () => paint(3))
    expect(document.activeElement).toBe(button(2, 'done'))
  })

  it('counts position among same-role siblings, not among all of them', () => {
    // The first row gains an extra child before its buttons. A naive index
    // would shift and land focus on the wrong control.
    paint(2, true)
    button(0, 'later').focus()
    keepingFocus(region, document, () => paint(2, true))
    expect(document.activeElement).toBe(button(0, 'later'))
  })
})

describe('a row that acted on itself hands focus to the row that replaced it', () => {
  it('keeps the position when the list shortens', () => {
    // Resolving the top item is the commonest action on this page. The user
    // should end up on the row that took its place — not thrown to the top of
    // the document, which is what happened for every control but one.
    paint(3)
    button(0, 'done').focus()
    keepingFocus(region, document, () => paint(2))
    expect(document.activeElement).toBe(button(0, 'done'))
  })

  it('leaves focus alone when the control is gone entirely', () => {
    paint(2)
    button(1, 'done').focus()
    keepingFocus(region, document, () => paint(1))
    // Not the body's business to receive focus, and not ours to invent a new
    // home for it: moving focus somewhere the user never was is louder than
    // losing it.
    expect(region.contains(document.activeElement)).toBe(false)
  })
})

describe('a text field keeps its caret, not just its focus', () => {
  function withField(): HTMLInputElement {
    region.replaceChildren()
    const field = document.createElement('input')
    field.setAttribute('data-role', 'address')
    field.type = 'text'
    field.value = 'someone@example.test'
    region.append(field)
    return field
  }

  it('restores the selection where the caret was', () => {
    let field = withField()
    field.focus()
    field.setSelectionRange(4, 4)
    keepingFocus(region, document, () => {
      field = withField()
    })
    expect(document.activeElement).toBe(field)
    expect(field.selectionStart).toBe(4)
  })

  it('restores a range, not only a caret', () => {
    let field = withField()
    field.focus()
    field.setSelectionRange(0, 7)
    keepingFocus(region, document, () => {
      field = withField()
    })
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 7])
  })
})

describe('focus the user did not leave in the region is not taken from them', () => {
  it('restores nothing when focus was outside', () => {
    paint(2)
    const outside = document.createElement('button')
    document.body.append(outside)
    outside.focus()
    keepingFocus(region, document, () => paint(2))
    expect(document.activeElement).toBe(outside)
  })

  it('marks nothing when the body holds focus', () => {
    paint(1)
    ;(document.activeElement as HTMLElement | null)?.blur()
    expect(markFocus(region, document)).toBeNull()
  })

  it('marks nothing for the region itself', () => {
    paint(1)
    region.setAttribute('tabindex', '-1')
    region.focus()
    expect(markFocus(region, document)).toBeNull()
  })

  it('applying a null mark is a no-op rather than a reset', () => {
    paint(2)
    button(0, 'done').focus()
    applyFocus(region, null)
    expect(document.activeElement).toBe(button(0, 'done'))
  })
})
