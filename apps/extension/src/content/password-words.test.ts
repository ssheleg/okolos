import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it, vi } from 'vitest'

import { fromCatalogue, useResolver, type Catalogue } from '@okolos/i18n'
import type { FrameLine } from '@okolos/contracts'

import {
  passwordDetail,
  passwordLines,
  passwordSentence,
  passwordSourceKey,
  type PasswordVerdict,
} from './password-words.js'

const CATALOGUE = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, '../../_locales/ru/messages.json'), 'utf8'),
) as Catalogue

useResolver(fromCatalogue(CATALOGUE))

function verdict(over: Partial<PasswordVerdict> = {}): PasswordVerdict {
  return { explain: { code: 'in-common-list' }, reusedOn: [], reuseUnknown: false, ...over }
}

describe('the words for a leak verdict', () => {
  it('is always two lines: what was found, then where else it is used', () => {
    const lines = passwordLines(verdict())
    expect(lines).toHaveLength(2)
    expect(lines[0]?.explainKey).toBe('pwdExplainCommon')
    expect(lines[1]?.explainKey).toBe('warnPasswordReuseNone')
  })

  /**
   * The three answers about reuse, and the two that must never be one sentence.
   * "Not seen anywhere else" and "never seen at all" read the same to a reader and
   * mean opposite things about how much this device knows.
   */
  it('never reads its own emptiness as reassurance', () => {
    expect(passwordLines(verdict({ reuseUnknown: true }))[1]?.explainKey).toBe(
      'warnPasswordReuseUnknown',
    )
    expect(passwordLines(verdict({ reusedOn: [] }))[1]?.explainKey).toBe('warnPasswordReuseNone')
    const many = passwordLines(verdict({ reusedOn: ['a.test', 'b.test'] }))[1]
    expect(many?.explainKey).toBe('warnPasswordReuse')
    expect(many?.explainArgs).toEqual(['2', 'a.test, b.test'])
  })

  /**
   * The count crosses as a number and is formatted by the reader's runtime. It used to
   * cross already formatted by `toLocaleString('en')` — an English thousands separator
   * chosen inside a package that cannot know the locale (B-75).
   */
  it('formats the count here, and names no locale while doing it', () => {
    /**
     * Asserted on the **call**, not on the digits, and that is the only assertion that
     * can hold. Comparing the output against `toLocaleString('en')` proves nothing under
     * an English test runner — the two are identical there, which is exactly the
     * environment where the original defect looked correct. So the spy watches what was
     * passed: a locale argument at all is the defect, whichever locale it names.
     */
    const spy = vi.spyOn(Number.prototype, 'toLocaleString')
    try {
      const [found] = passwordLines(verdict({ explain: { code: 'found', count: 1234567 } }))
      expect(found?.explainKey).toBe('pwdExplainFound')
      expect(found?.explainArgs[0]).toBe((1234567).toLocaleString())
      expect(spy).toHaveBeenCalled()
      for (const call of spy.mock.calls) expect(call).toEqual([])
    } finally {
      spy.mockRestore()
    }
  })

  it('carries a browser error as data, not as a message of ours', () => {
    const [found] = passwordLines(
      verdict({ explain: { code: 'unreachable', detail: 'NetworkError' } }),
    )
    expect(found?.explainArgs).toEqual(['NetworkError'])
    expect(found?.explainArgKeys).toEqual([null])
    expect(passwordSentence(found as FrameLine)).toContain('NetworkError')
  })

  it('shows an unknown code as itself rather than dropping the verdict', () => {
    const lines = passwordLines(verdict({ explain: { code: 'weather-is-bad' } }))
    expect(passwordDetail(lines)).toContain('[weather-is-bad]')
  })

  it('names which source answered, as a key the surface resolves', () => {
    expect(passwordSourceKey(true)).toBe('warnPasswordSourceOffline')
    expect(passwordSourceKey(false)).toBe('warnPasswordSourceOnline')
    expect(CATALOGUE[passwordSourceKey(true)]).toBeDefined()
    expect(CATALOGUE[passwordSourceKey(false)]).toBeDefined()
  })

  it('resolves every line it produces against the shipped catalogue', () => {
    const codes = ['in-common-list', 'unreachable', 'unreadable', 'absent', 'found']
    const dead = codes
      .flatMap((code) => passwordLines(verdict({ explain: { code, count: 1, detail: 'x' } })))
      .filter((line) => CATALOGUE[line.explainKey] === undefined)
    expect(dead.map((line) => line.explainKey), 'these lines have no message').toEqual([])
  })
})
