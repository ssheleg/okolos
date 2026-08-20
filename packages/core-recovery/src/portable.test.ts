import { describe, expect, it } from 'vitest'

import { buildChecklist } from './checklist.js'
import { toPortable } from './portable.js'

describe('what you can carry out of the browser', () => {
  it('separates the steps this browser cannot do', () => {
    const portable = toPortable(buildChecklist('pasted-command'))
    expect(portable.elsewhere.length).toBeGreaterThan(0)
    expect(portable.here.length).toBeGreaterThan(0)
  })

  it('marks them in the order too, not only in the split', () => {
    // The distinction has to survive into what travels, and `ordered` is what the
    // surface renders from — a fact that existed only in `elsewhere` would never reach
    // the person reading this on their phone.
    const portable = toPortable(buildChecklist('pasted-command'))
    expect(portable.ordered.some((entry) => entry.step.elsewhere)).toBe(true)
  })

  it('keeps the order, numbered across both groups', () => {
    /**
     * Renumbering per group would lose the ordering, which is the product.
     *
     * The text these numbers end up in is assembled by the surface now (B-75), and the
     * assertions about its words live in `packages/ui/src/recovery/recovery.test.ts`.
     * What remains this package's business is the sequence itself.
     */
    const list = buildChecklist('pasted-command')
    const portable = toPortable(list)
    expect(portable.ordered.map((entry) => entry.index)).toEqual(
      portable.ordered.map((_entry, at) => at + 1),
    )
    expect(portable.ordered[0]?.step.id).toBe(list.steps[0]?.id)
    expect(portable.ordered[1]?.step.id).toBe(list.steps[1]?.id)
  })

  it('numbers only what remains', () => {
    // A finished step is not carried, and the numbering closes over the gap rather
    // than leaving a hole a reader would take for a missing instruction.
    const list = buildChecklist('pasted-command', [{ stepId: 'disconnect', doneAt: 'now' }])
    const portable = toPortable(list)
    expect(portable.ordered.some((entry) => entry.step.id === 'disconnect')).toBe(false)
    expect(portable.ordered[0]?.index).toBe(1)
  })
})

describe('what it leaves out', () => {
  it('omits steps already done — nobody needs to carry those', () => {
    const list = buildChecklist('entered-password', [{ stepId: 'change-password', doneAt: 'now' }])
    const portable = toPortable(list)
    expect(portable.ordered.some((entry) => entry.step.id === 'change-password')).toBe(false)
    expect(portable.ordered).toHaveLength(list.steps.length - 1)
  })

  it('has nothing to carry when every step is done', () => {
    /**
     * The sentence a person reads in that case — "nothing left to carry" — is the
     * surface's, and `packages/ui/src/recovery/recovery.test.ts` asserts it. What is
     * checked here is the state it is derived from: an empty sequence, and no split.
     */
    const all = buildChecklist('entered-password').steps.map((step) => ({
      stepId: step.id,
      doneAt: 'now',
    }))
    const portable = toPortable(buildChecklist('entered-password', all))
    expect(portable.ordered).toEqual([])
    expect(portable.elsewhere).toEqual([])
    expect(portable.here).toEqual([])
  })
})
