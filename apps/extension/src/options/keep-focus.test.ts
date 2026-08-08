/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it } from 'vitest'

import { keepingFocus } from './keep-focus.js'

let root: HTMLElement
let field: HTMLInputElement
let other: HTMLInputElement

beforeEach(() => {
  document.body.replaceChildren()
  root = document.createElement('div')
  field = document.createElement('input')
  field.type = 'text'
  other = document.createElement('input')
  other.type = 'text'
  root.append(field)
  document.body.append(root)
  // Outside the repainted subtree, like the rest of the page: an element the
  // repaint removes would be blurred by the removal, not by this module.
  document.body.append(other)
})

/** What the options page does: build a new tree, then move the field into it. */
function repaintMoving(moved: HTMLInputElement = field): void {
  const slot = document.createElement('span')
  const rebuilt = document.createElement('section')
  rebuilt.append(slot)
  root.replaceChildren(rebuilt)
  slot.replaceWith(moved)
}

describe('a repaint that moves the field', () => {
  it('blurs it — which is the whole defect, stated once', () => {
    field.focus()
    expect(document.activeElement).toBe(field)
    repaintMoving()
    // Not an assertion about our code: it is what the DOM does, and the reason
    // this module exists. Native typing needs a focused element to land in.
    expect(document.activeElement).not.toBe(field)
  })

  it('keeps the value, which is why the loss looked impossible', () => {
    field.value = 'someone@example.test'
    repaintMoving()
    expect(field.value).toBe('someone@example.test')
  })
})

describe('keepingFocus', () => {
  it('gives focus back to a field that had it', () => {
    field.focus()
    keepingFocus(field, repaintMoving)
    expect(document.activeElement).toBe(field)
  })

  it('puts the caret back where it was, not at the end', () => {
    field.value = 'someone@example.test'
    field.focus()
    field.setSelectionRange(5, 5)
    keepingFocus(field, repaintMoving)
    expect(field.selectionStart).toBe(5)
    expect(field.selectionEnd).toBe(5)
  })

  it('keeps a selection, not just a caret', () => {
    field.value = 'someone@example.test'
    field.focus()
    field.setSelectionRange(0, 7)
    keepingFocus(field, repaintMoving)
    expect([field.selectionStart, field.selectionEnd]).toEqual([0, 7])
  })

  it('takes nothing from a field that did not have focus', () => {
    // Restoring focus the person did not leave there steals the caret from
    // whatever they were actually using.
    other.focus()
    keepingFocus(field, repaintMoving)
    expect(document.activeElement).toBe(other)
  })

  it('leaves focus alone when nothing was focused at all', () => {
    ;(document.activeElement as HTMLElement | null)?.blur()
    keepingFocus(field, repaintMoving)
    expect(document.activeElement).not.toBe(field)
  })

  it('still repaints when the field cannot take a selection back', () => {
    // `type=email` refuses setSelectionRange in some engines. The repaint must
    // not be undone by a courtesy failing.
    const email = document.createElement('input')
    email.type = 'email'
    root.append(email)
    email.focus()
    let painted = false
    keepingFocus(email, () => {
      painted = true
      repaintMoving(email)
    })
    expect(painted).toBe(true)
    expect(document.activeElement).toBe(email)
  })
})
