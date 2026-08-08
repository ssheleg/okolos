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

/**
 * The wording is matched in English and in Russian.
 *
 * The Russian tech-support scam — a locked-screen page, a number to call, a
 * borrowed brand — is among the commonest there is, and every one of them used
 * to pass clean here. `\w` matches no Cyrillic in a non-unicode pattern, so
 * the alternatives are anchored on whole phrases; and the conjunction below is
 * what keeps a shop's contact page quiet, in either language.
 */
const ALARM =
  /\b(your (?:computer|pc|system|device) (?:has been |is )?(?:locked|blocked|infected|compromised)|virus detected|trojan|spyware detected|security alert|do not (?:close|restart|shut down))\b|(ваш\s+(?:компьютер|пк|устройство|телефон)\s+(?:заблокирован|заражён|заражен|взломан)|обнаружен\s+(?:вирус|троян|шпион)|вирус\s+обнаружен|угроза\s+безопасности|не\s+(?:выключайте|закрывайте|перезагружайте))/i

const CALL_TO_ACTION =
  /\b(call (?:us|now|immediately|microsoft|apple|support)|toll[- ]free|technical support|helpline|contact support immediately)\b|(позвоните\s+(?:нам|немедленно|в\s+службу|по\s+номеру)|служба\s+поддержки|техническ\w*\s+поддержк|горяч\w*\s+лини)/i

const BRAND =
  /\b(microsoft|windows defender|apple support|norton|mcafee)\b|(майкрософт|виндовс|касперск|доктор\s*веб|яндекс\s*браузер)/i

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
