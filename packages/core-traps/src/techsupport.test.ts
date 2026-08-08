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

describe('the same scam, in the language its victims read', () => {
  /**
   * The tech-support page pattern was matched in English only, like the
   * ClickFix one and like all nine injection signals before them. Russian
   * tech-support scams are among the most common there are — a locked-screen
   * page, a number to call, a borrowed brand — and every one of them went
   * through clean.
   */
  const scam = (text: string, extra: Partial<TechSupportEvidence> = {}) =>
    detectTechSupport({ text, forcedFullscreen: false, dialogLoop: false, ...extra })

  it('flags the locked-computer claim with a number to call', () => {
    expect(
      scam('Ваш компьютер заблокирован. Обнаружен вирус. Позвоните в службу поддержки: +7 495 000-00-00'),
    ).not.toBeNull()
  })

  it('flags it when the page traps you instead of naming a number', () => {
    expect(
      scam('Внимание! Ваш компьютер заражён. Не выключайте компьютер.', {
        forcedFullscreen: true,
      }),
    ).not.toBeNull()
  })

  it('recognises a borrowed brand written in Cyrillic', () => {
    const verdict = scam(
      'Служба поддержки Майкрософт: ваш компьютер заблокирован, позвоните немедленно.',
    )
    expect(verdict?.signals).toContain('borrows-a-familiar-name')
  })

  it('needs the scare, not merely a phone number', () => {
    // A shop's contact page names a brand and a number. Warning there is how a
    // detector teaches people to dismiss it.
    expect(scam('Служба поддержки Майкрософт. Позвоните нам: +7 495 000-00-00')).toBeNull()
  })

  it('leaves an ordinary Russian security notice alone', () => {
    expect(
      scam('Мы заботимся о безопасности ваших данных. Антивирус рекомендуется обновлять.'),
    ).toBeNull()
  })
})
