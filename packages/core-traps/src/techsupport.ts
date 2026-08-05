/**
 * The browser-lock trap.
 *
 * A page forces itself fullscreen, loops dialogs, and shows a warning that
 * claims the computer is infected and gives a number to call. Nothing is
 * infected; the number reaches the people who built the page.
 *
 * What can honestly be detected from a content script is the fullscreen that no
 * gesture asked for, plus the wording. Dialog loops are raised by the page in a
 * world this code cannot reach, so the verdict says which of the two it is
 * resting on rather than implying it stopped both.
 */

export interface TechSupportEvidence {
  readonly text: string
  /** Fullscreen entered with no user gesture behind it. */
  readonly forcedFullscreen: boolean
  /** Dialogs raised in quick succession, when that can be observed. */
  readonly dialogLoop: boolean
}

export interface TechSupportVerdict {
  readonly confidence: 'high' | 'medium'
  readonly signals: readonly string[]
  /** A number on the page, shown so the user sees what they were about to call. */
  readonly phone: string | null
  /** True when dialogs are looping and this context cannot suppress them. */
  readonly dialogsUnsuppressed: boolean
}

const ALARM = /\b(your (?:computer|pc|system|device) (?:has been |is )?(?:locked|blocked|infected|compromised)|virus detected|trojan|spyware detected|security alert|do not (?:close|restart|shut down))\b/i

const CALL_TO_ACTION = /\b(call (?:us|now|immediately|microsoft|apple|support)|toll[- ]free|technical support|helpline|contact support immediately)\b/i

const BRAND = /\b(microsoft|windows defender|apple support|norton|mcafee)\b/i

/** Deliberately loose: the point is to show the user the number, not to dial it. */
const PHONE = /(\+?\d[\d\s().-]{7,}\d)/

export function detectTechSupport(evidence: TechSupportEvidence): TechSupportVerdict | null {
  const signals: string[] = []
  const text = evidence.text

  if (evidence.forcedFullscreen) signals.push('fullscreen-you-did-not-ask-for')
  if (evidence.dialogLoop) signals.push('dialogs-that-keep-coming-back')
  if (ALARM.test(text)) signals.push('claims-your-computer-is-infected')
  if (CALL_TO_ACTION.test(text)) signals.push('tells-you-to-call')
  if (BRAND.test(text)) signals.push('borrows-a-familiar-name')

  const scare = signals.includes('claims-your-computer-is-infected')
  const call = signals.includes('tells-you-to-call')
  const trapped =
    signals.includes('fullscreen-you-did-not-ask-for') ||
    signals.includes('dialogs-that-keep-coming-back')

  if (!(scare && (call || trapped))) return null

  const match = call ? PHONE.exec(text) : null

  return {
    confidence: trapped && call ? 'high' : 'medium',
    signals,
    phone: match?.[1]?.trim() ?? null,
    dialogsUnsuppressed: evidence.dialogLoop,
  }
}
