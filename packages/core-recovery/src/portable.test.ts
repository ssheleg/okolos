import { describe, expect, it } from 'vitest'

import { buildChecklist } from './checklist.js'
import { toPortable } from './portable.js'

describe('what you can carry out of the browser', () => {
  it('separates the steps this browser cannot do', () => {
    const portable = toPortable(buildChecklist('pasted-command'))
    expect(portable.elsewhere.length).toBeGreaterThan(0)
    expect(portable.here.length).toBeGreaterThan(0)
  })

  it('marks them in the text too, not only in the split', () => {
    // The text is the thing that actually travels; a distinction that exists
    // only in the object never reaches the person reading it on their phone.
    const portable = toPortable(buildChecklist('pasted-command'))
    expect(portable.text).toContain('(not in this browser)')
  })

  it('carries the reason with every step', () => {
    const portable = toPortable(buildChecklist('pasted-command'))
    for (const step of buildChecklist('pasted-command').steps) {
      expect(portable.text).toContain(step.why)
    }
  })

  it('keeps the order, numbered across both groups', () => {
    // Renumbering per group would lose the ordering, which is the product.
    const list = buildChecklist('pasted-command')
    const portable = toPortable(list)
    expect(portable.text).toContain(`1. ${list.steps[0]?.title}`)
    expect(portable.text).toContain(`2. ${list.steps[1]?.title}`)
  })

  it('names the incident it is about', () => {
    expect(toPortable(buildChecklist('called-number')).text).toContain('after calling a number')
  })
})

describe('what it leaves out', () => {
  it('omits steps already done — nobody needs to carry those', () => {
    const list = buildChecklist('entered-password', [{ stepId: 'change-password', doneAt: 'now' }])
    const portable = toPortable(list)
    expect(portable.text).not.toContain('Change the password you typed')
    expect(portable.text).toContain('3 steps left')
  })

  it('says plainly when there is nothing left to carry', () => {
    const all = buildChecklist('entered-password').steps.map((step) => ({
      stepId: step.id,
      doneAt: 'now',
    }))
    const portable = toPortable(buildChecklist('entered-password', all))
    expect(portable.text).toContain('Nothing left to carry')
    expect(portable.elsewhere).toEqual([])
  })
})
