import { describe, expect, it } from 'vitest'

import { buildChecklist, INCIDENTS } from './checklist.js'

describe('the order is the product', () => {
  it('puts disconnecting first after a pasted command', () => {
    // Everything else is pointless while something is still talking to whoever
    // placed it.
    expect(buildChecklist('pasted-command').steps[0]?.id).toBe('disconnect')
  })

  it('puts removing remote access first after a support call', () => {
    expect(buildChecklist('called-number').steps[0]?.id).toBe('remote-access')
  })

  it('puts the scan after the accounts, not before', () => {
    const ids = buildChecklist('pasted-command').steps.map((step) => step.id)
    expect(ids.indexOf('scan')).toBeGreaterThan(ids.indexOf('passwords-elsewhere'))
  })

  it('changes the typed password first when that is all that happened', () => {
    expect(buildChecklist('entered-password').steps[0]?.id).toBe('change-password')
  })
})

describe('every step says why', () => {
  it('for every incident, without exception', () => {
    for (const steps of Object.values(INCIDENTS)) {
      for (const step of steps) {
        expect(step.why.length).toBeGreaterThan(20)
      }
    }
  })

  it('and says when a step cannot be done here', () => {
    const step = buildChecklist('pasted-command').steps.find((entry) => entry.id === 'passwords-elsewhere')
    expect(step?.elsewhere).toBe(true)
    expect(step?.why).toMatch(/affected device/i)
  })
})

describe('progress', () => {
  it('counts what is left', () => {
    const list = buildChecklist('entered-password', [{ stepId: 'change-password', doneAt: 'now' }])
    expect(list.remaining).toBe(list.steps.length - 1)
  })

  it('ignores a step that is not in this checklist', () => {
    const list = buildChecklist('entered-password', [{ stepId: 'scan', doneAt: 'now' }])
    expect(list.done).toEqual([])
  })

  it('does not count the same step twice', () => {
    const list = buildChecklist('entered-password', [
      { stepId: 'sessions', doneAt: 'a' },
      { stepId: 'sessions', doneAt: 'b' },
    ])
    expect(list.done).toEqual(['sessions'])
  })
})

describe('when we do not know what happened', () => {
  it('gives the broadest safe list', () => {
    expect(buildChecklist('not-sure').steps.length).toBeGreaterThan(3)
  })

  it('says so when it fell back, rather than answering a different question quietly', () => {
    const list = buildChecklist('something-nobody-defined')
    expect(list.generic).toBe(true)
    expect(list.kind).toBe('not-sure')
  })

  it('is not generic when the incident was named', () => {
    expect(buildChecklist('pasted-command').generic).toBe(false)
  })
})
