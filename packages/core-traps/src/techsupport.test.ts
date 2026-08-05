import { describe, expect, it } from 'vitest'

import { detectTechSupport, type TechSupportEvidence } from './techsupport.js'

const SCARE =
  'SECURITY ALERT: Your computer has been locked. Windows Defender detected a trojan. Call technical support immediately at +1 (888) 555-0142. Do not restart your PC.'

function evidence(overrides: Partial<TechSupportEvidence> = {}): TechSupportEvidence {
  return { text: SCARE, forcedFullscreen: true, dialogLoop: false, ...overrides }
}

describe('what a browser-lock page looks like', () => {
  it('is caught when it takes the screen and tells you to call', () => {
    const verdict = detectTechSupport(evidence())
    expect(verdict?.confidence).toBe('high')
    expect(verdict?.signals).toContain('fullscreen-you-did-not-ask-for')
  })

  it('shows the number, so the user sees what they were about to call', () => {
    expect(detectTechSupport(evidence())?.phone).toContain('888')
  })

  it('is caught without fullscreen when the wording is unambiguous', () => {
    const verdict = detectTechSupport(evidence({ forcedFullscreen: false }))
    expect(verdict?.confidence).toBe('medium')
  })

  it('notices the borrowed brand name', () => {
    expect(detectTechSupport(evidence())?.signals).toContain('borrows-a-familiar-name')
  })
})

describe('what it says about its own limits', () => {
  it('reports dialogs it cannot suppress rather than implying it stopped them', () => {
    // The dialogs are raised in a world a content script cannot reach. Claiming
    // otherwise would be the one lie that gets someone stuck.
    const verdict = detectTechSupport(evidence({ dialogLoop: true }))
    expect(verdict?.dialogsUnsuppressed).toBe(true)
  })

  it('is quiet about dialogs when there are none', () => {
    expect(detectTechSupport(evidence())?.dialogsUnsuppressed).toBe(false)
  })
})

describe('what it refuses to call an attack', () => {
  it('a video that went fullscreen because the user asked', () => {
    expect(
      detectTechSupport({ text: 'Now playing', forcedFullscreen: false, dialogLoop: false }),
    ).toBeNull()
  })

  it('a genuine security page that names no phone number and traps nobody', () => {
    expect(
      detectTechSupport({
        text: 'Security alert: we detected a new sign-in to your account.',
        forcedFullscreen: false,
        dialogLoop: false,
      }),
    ).toBeNull()
  })

  it('a support page that asks you to call, without the scare', () => {
    expect(
      detectTechSupport({
        text: 'Need help? Call technical support on +1 (800) 555-0100.',
        forcedFullscreen: false,
        dialogLoop: false,
      }),
    ).toBeNull()
  })

  it('a fullscreen page with nothing alarming on it', () => {
    expect(
      detectTechSupport({ text: 'Presentation mode', forcedFullscreen: true, dialogLoop: false }),
    ).toBeNull()
  })
})
