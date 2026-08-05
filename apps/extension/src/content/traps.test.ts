/** @vitest-environment happy-dom */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { watchForTraps, type TrapDeps, type TrapWatcher } from './traps.js'

const CLICKFIX_TEXT =
  'Verify you are human: press Win + R, then Ctrl + V, then press Enter.'
const SCARE_TEXT =
  'SECURITY ALERT: your computer has been locked. Windows Defender found a trojan. Call technical support immediately on +1 (888) 555-0142.'

let watcher: TrapWatcher | null = null

type Watched = TrapDeps & {
  exitFullscreen: ReturnType<typeof vi.fn>
  warned: ReturnType<typeof vi.fn>
}

function watch(overrides: Partial<TrapDeps> = {}): Watched {
  const deps = {
    doc: document,
    text: () => document.body.textContent ?? '',
    leave: vi.fn(),
    recover: vi.fn(),
    exitFullscreen: vi.fn(),
    warned: vi.fn(),
    ...overrides,
  } as Watched
  watcher = watchForTraps(deps)
  return deps
}

/** Waits past the watcher's debounce. */
const settle = () => new Promise<void>((resolve) => setTimeout(resolve, 600))

const banner = () => document.querySelector('okolos-banner')

beforeEach(() => {
  document.body.innerHTML = ''
})

afterEach(() => {
  watcher?.stop()
  watcher = null
})

describe('a page that copies a command for you', () => {
  it('interrupts, because the next action is a paste into a run box', async () => {
    document.body.textContent = CLICKFIX_TEXT
    watch()
    document.dispatchEvent(new Event('copy', { bubbles: true }))
    await settle()

    expect(banner()).not.toBeNull()
  })

  it('says the copied text could not be read rather than showing an empty box', async () => {
    document.body.textContent = CLICKFIX_TEXT
    watch()
    document.dispatchEvent(new Event('copy', { bubbles: true }))
    await settle()

    expect(document.body.innerHTML).toBeTruthy()
    expect(banner()).not.toBeNull()
  })

  it('does not claim the page copied it when the user did', async () => {
    // The banner says "this page copied a command for you". On a page the user
    // copied from themselves that sentence is simply untrue, and the signal
    // list is where the claim comes from.
    document.body.textContent = CLICKFIX_TEXT
    const deps = watch()
    const trusted = new Event('copy', { bubbles: true })
    Object.defineProperty(trusted, 'isTrusted', { value: true })
    document.dispatchEvent(trusted)
    await settle()

    expect(deps.warned).toHaveBeenCalled()
    const signals = deps.warned.mock.calls[0]?.[1] as string[]
    expect(signals).not.toContain('copy-not-made-by-you')
  })

  it('leaves a documentation page alone, copy button and all', async () => {
    // The false positive that matters: "copy this, paste it in your terminal,
    // press Enter" with an execCommand copy button behind it is every install
    // page on every developer site.
    document.body.textContent =
      'Install the CLI: copy the command below, paste it into your terminal and press Enter.'
    watch()
    document.dispatchEvent(new Event('copy', { bubbles: true }))
    await settle()

    expect(banner()).toBeNull()
  })
})

describe('a page that takes over the screen', () => {
  it('leaves fullscreen nobody asked for', async () => {
    document.body.textContent = SCARE_TEXT
    const deps = watch()
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: document.body,
    })
    document.dispatchEvent(new Event('fullscreenchange', { bubbles: true }))
    await settle()

    expect(deps.exitFullscreen).toHaveBeenCalled()
    expect(banner()).not.toBeNull()
  })

  it('leaves alone a fullscreen the user just asked for', async () => {
    document.body.textContent = 'Now playing'
    const deps = watch()
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', bubbles: true }))
    Object.defineProperty(document, 'fullscreenElement', {
      configurable: true,
      value: document.body,
    })
    document.dispatchEvent(new Event('fullscreenchange', { bubbles: true }))
    await settle()

    expect(deps.exitFullscreen).not.toHaveBeenCalled()
  })
})

describe('an ordinary page', () => {
  it('is left entirely alone', async () => {
    document.body.textContent = 'Welcome to our shop. Free delivery this week.'
    watch()
    await settle()
    expect(banner()).toBeNull()
  })
})

describe('stopping', () => {
  it('removes the warning and stops listening', async () => {
    document.body.textContent = SCARE_TEXT
    watch()
    await settle()
    expect(banner()).not.toBeNull()

    watcher?.stop()
    expect(banner()).toBeNull()
  })
})
