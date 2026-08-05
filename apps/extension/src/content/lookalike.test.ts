/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { warnIfLookalike, type LookalikeDeps } from './lookalike.js'

function deps(overrides: Partial<LookalikeDeps> = {}): LookalikeDeps {
  return {
    doc: document,
    hostname: () => 'g00gle.com',
    trusted: async () => [],
    trust: vi.fn(async () => undefined),
    leave: vi.fn(),
    ...overrides,
  }
}

/** The surface is closed to the page, so the handle is how a test reaches it. */
let root: ShadowRoot | null = null
const shadow = () => root
const comparison = () => document.querySelector('[data-role=comparison]')

beforeEach(() => {
  document.body.innerHTML = ''
  root = null
})

describe('when the address imitates a known one', () => {
  it('warns, without blocking the page', async () => {
    const warning = await warnIfLookalike(deps())
    expect(warning?.verdict).toMatchObject({ resembles: 'google.com' })
    expect(document.querySelector('okolos-banner')).not.toBeNull()
  })

  it('opens the comparison on request', async () => {
    root = (await warnIfLookalike(deps()))?.root ?? null
    shadow()?.querySelector<HTMLElement>('[data-role=primary]')?.click()
    expect(comparison()).not.toBeNull()
  })

  it('leaves the page when the user chooses to', async () => {
    const leave = vi.fn()
    root = (await warnIfLookalike(deps({ leave })))?.root ?? null
    shadow()?.querySelector<HTMLElement>('[data-role=primary]')?.click()
    comparison()?.querySelector<HTMLElement>('[data-role=leave]')?.click()
    expect(leave).toHaveBeenCalledTimes(1)
  })

  it('remembers a site the user says is legitimate', async () => {
    const trust = vi.fn(async () => undefined)
    root = (await warnIfLookalike(deps({ trust })))?.root ?? null
    shadow()?.querySelector<HTMLElement>('[data-role=primary]')?.click()
    comparison()?.querySelector<HTMLElement>('[data-role=trust]')?.click()
    expect(trust).toHaveBeenCalledWith('g00gle.com')
  })

  it('takes the warning away once the user has decided', async () => {
    root = (await warnIfLookalike(deps()))?.root ?? null
    shadow()?.querySelector<HTMLElement>('[data-role=primary]')?.click()
    comparison()?.querySelector<HTMLElement>('[data-role=trust]')?.click()
    expect(document.querySelector('okolos-banner')).toBeNull()
    expect(comparison()).toBeNull()
  })
})

describe('when it does not', () => {
  it('says nothing about the real thing', async () => {
    expect(await warnIfLookalike(deps({ hostname: () => 'google.com' }))).toBeNull()
    expect(document.querySelector('okolos-banner')).toBeNull()
  })

  it('says nothing about a site the user already trusted', async () => {
    expect(await warnIfLookalike(deps({ trusted: async () => ['g00gle.com'] }))).toBeNull()
  })

  it('treats a trusted domain as one of the names worth imitating', async () => {
    // Once someone tells us a site matters to them, imitations of it matter too.
    const warning = await warnIfLookalike(
      deps({ hostname: () => 'my-bаnk.test', trusted: async () => ['my-bank.test'] }),
    )
    expect(warning?.verdict).toMatchObject({ resembles: 'my-bank.test' })
  })

  it('says nothing about an ordinary site', async () => {
    expect(await warnIfLookalike(deps({ hostname: () => 'example.test' }))).toBeNull()
  })
})
