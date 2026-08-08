import { describe, expect, it } from 'vitest'

import { isComplete, settleContext, type BlockContext } from './context.js'

const nap = async (): Promise<void> => {
  /* the policy is what is under test, not the clock */
}

/** Answers in order; repeats the last one once the script runs out. */
function scripted(answers: ReadonlyArray<BlockContext | null>): {
  ask: () => Promise<BlockContext | null>
  calls: () => number
} {
  let index = 0
  return {
    ask: async () => answers[Math.min(index++, answers.length - 1)] ?? null,
    calls: () => index,
  }
}

describe('what counts as an answer', () => {
  it('needs the list to be named', () => {
    expect(isComplete(null)).toBe(false)
    expect(isComplete({ url: 'https://bad.test' })).toBe(false)
    expect(isComplete({ feed: null })).toBe(false)
    expect(isComplete({ feed: '' })).toBe(false)
    expect(isComplete({ feed: 'phishing' })).toBe(true)
  })
})

describe('settling the block context', () => {
  it('paints the first answer immediately, however poor it is', async () => {
    const painted: Array<BlockContext | null> = []
    const { ask } = scripted([null, { feed: 'phishing' }])
    await settleContext(ask, (c) => painted.push(c), nap)
    // The blocked page is not rendering; a delayed first paint is a blank tab.
    expect(painted[0]).toBeNull()
  })

  it('asks again when the background had not answered yet, and repaints', async () => {
    const painted: Array<BlockContext | null> = []
    const { ask } = scripted([null, null, { feed: 'phishing', entryDate: '2026-08-01' }])
    const settled = await settleContext(ask, (c) => painted.push(c), nap)
    expect(settled?.feed).toBe('phishing')
    expect(painted).toHaveLength(2)
    expect(painted[1]?.feed).toBe('phishing')
  })

  it('stops asking the moment the answer is complete', async () => {
    const { ask, calls } = scripted([{ feed: 'phishing' }])
    await settleContext(ask, () => {}, nap)
    expect(calls()).toBe(1)
  })

  it('keeps the honest statement when the answer never arrives', async () => {
    // Trading a stated unknown for an unbounded wait would undo the rule this
    // exists to serve: a refusal is an answer, and it must eventually be given.
    const { ask, calls } = scripted([null])
    const settled = await settleContext(ask, () => {}, nap, { attempts: 3 })
    expect(settled).toBeNull()
    expect(calls()).toBe(4)
  })

  it('abandons the retries once the user has acted', async () => {
    const painted: Array<BlockContext | null> = []
    const { ask } = scripted([null, { feed: 'phishing' }])
    await settleContext(ask, (c) => painted.push(c), nap, { abandoned: () => true })
    // Repainting under someone's hand is worse than a vague source line.
    expect(painted).toHaveLength(1)
  })

  it('treats a thrown answer as no answer rather than a crash', async () => {
    const painted: Array<BlockContext | null> = []
    let first = true
    const ask = async (): Promise<BlockContext | null> => {
      if (first) {
        first = false
        throw new Error('the background is not there')
      }
      return { feed: 'phishing' }
    }
    const settled = await settleContext(ask, (c) => painted.push(c), nap)
    expect(painted[0]).toBeNull()
    expect(settled?.feed).toBe('phishing')
  })
})
