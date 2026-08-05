/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { watchCredentialFields, type CredentialDeps, type CredentialWatcher } from './credential.js'

const NOW = '2026-08-05T12:00:00.000Z'
let watcher: CredentialWatcher | null = null

function watch(overrides: Partial<CredentialDeps> = {}): CredentialDeps {
  const deps: CredentialDeps = {
    doc: document,
    host: () => 'shop.test',
    now: () => NOW,
    facts: async () => ({
      trusted: false,
      firstSeen: '2026-08-05T09:00:00.000Z',
      secure: true,
      postsTo: null,
      resembles: null,
    }),
    trust: vi.fn(async () => undefined),
    leave: vi.fn(),
    ...overrides,
  }
  watcher = watchCredentialFields(deps)
  return deps
}

const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 0))
const banner = () => document.querySelector('okolos-banner')

function field(html = '<input id="p" type="password">'): HTMLElement {
  document.body.innerHTML = html
  return document.querySelector('input') as HTMLElement
}

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  watcher?.stop()
  watcher = null
})

describe('when the field is focused', () => {
  it('warns about a site this device has only just met', async () => {
    watch()
    field().dispatchEvent(new Event('focusin', { bubbles: true }))
    await settle()
    expect(banner()).not.toBeNull()
  })

  it('says nothing on a site the user trusts', async () => {
    watch({
      facts: async () => ({
        trusted: true,
        firstSeen: null,
        secure: false,
        postsTo: null,
        resembles: null,
      }),
    })
    field().dispatchEvent(new Event('focusin', { bubbles: true }))
    await settle()
    expect(banner()).toBeNull()
  })

  it('warns only once, however often focus moves', async () => {
    watch()
    const input = field()
    input.dispatchEvent(new Event('focusin', { bubbles: true }))
    await settle()
    document.querySelector('okolos-banner')?.remove()
    input.dispatchEvent(new Event('focusin', { bubbles: true }))
    await settle()
    expect(banner()).toBeNull()
  })

  it('ignores an ordinary text field', async () => {
    watch()
    field('<input id="q" type="text">').dispatchEvent(new Event('focusin', { bubbles: true }))
    await settle()
    expect(banner()).toBeNull()
  })

  it('watches a card number field too', async () => {
    watch()
    field('<input id="c" autocomplete="cc-number">').dispatchEvent(
      new Event('focusin', { bubbles: true }),
    )
    await settle()
    expect(banner()).not.toBeNull()
  })
})

describe('where the form sends it', () => {
  it('notices a form posting to another origin', async () => {
    const deps = watch({
      facts: async () => ({
        trusted: false,
        firstSeen: '2020-01-01T00:00:00.000Z',
        secure: true,
        postsTo: null,
        resembles: null,
      }),
    })
    document.body.innerHTML =
      '<form action="https://collector.test/steal"><input id="p" type="password"></form>'
    document.querySelector('input')?.dispatchEvent(new Event('focusin', { bubbles: true }))
    await settle()

    // Established site, encrypted, nothing else wrong — only the destination.
    expect(banner()).not.toBeNull()
    expect(deps.leave).not.toHaveBeenCalled()
  })

  it('says nothing about a form posting to itself', async () => {
    watch({
      facts: async () => ({
        trusted: false,
        firstSeen: '2020-01-01T00:00:00.000Z',
        secure: true,
        postsTo: null,
        resembles: null,
      }),
    })
    document.body.innerHTML = '<form action="/login"><input id="p" type="password"></form>'
    document.querySelector('input')?.dispatchEvent(new Event('focusin', { bubbles: true }))
    await settle()
    expect(banner()).toBeNull()
  })
})

describe('when we know nothing', () => {
  it('stays silent rather than warning from an empty hand', async () => {
    watch({
      facts: async () => {
        throw new Error('storage unavailable')
      },
    })
    field().dispatchEvent(new Event('focusin', { bubbles: true }))
    await settle()
    expect(banner()).toBeNull()
  })
})
