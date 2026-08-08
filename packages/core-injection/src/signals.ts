/**
 * Deterministic signals that separate "hidden text" from "an instruction
 * planted for a machine".
 *
 * The distinction is the whole design. Hidden text on its own is ordinary:
 * screen-reader labels, inactive tabs, structured data and print-only footers
 * are all invisible on purpose. What is never ordinary is invisible text that
 * addresses a model, reassigns its role, cancels its prior instructions, asks
 * it to keep a secret from the user, or reaches for their credentials. Those
 * are the patterns below — and every one of them can be checked by a human
 * looking at the same text, which is why this stage is allowed to act while
 * the classifier is not.
 */

export type SignalName =
  | 'override'
  | 'role-assignment'
  | 'vocative'
  | 'secrecy'
  | 'conditional-identity'
  | 'tool-invocation'
  | 'system-prompt'
  | 'sensitive-target'
  | 'char-anomaly'

/**
 * Characters that survive rendering but change what a model reads.
 *
 * Written as escapes on purpose: a literal zero-width character in source is
 * invisible to the reviewer, which is the exact trick this file exists to
 * catch. The lint rule that forbids them here is doing the right thing.
 */
const INVISIBLE_CHARS =
  /[\u200B-\u200F\u202A-\u202E\u2060-\u2064\uFEFF]|[\u{E0000}-\u{E007F}]/gu

/**
 * Every signal is matched in English and in Russian.
 *
 * They were written in English alone, and for a Russian-speaking reader — who
 * is who the watchlist, the interstitial copy and the documentation are all
 * aimed at — the detector this product is named for found nothing at all.
 * Five attack shapes, zero signals.
 *
 * The Russian side is narrow on purpose. The rule this file already holds is
 * that a detector written from the attack outward has to describe the innocent
 * population too, and Russian hidden text is full of screen-reader labels,
 * print footers and cookie notices. `\b` marks no word boundary next to
 * Cyrillic in a non-unicode pattern and `\w` matches none of it, so the
 * alternatives are anchored on whole phrases instead.
 */

/** Cancel or supersede whatever came before. */
const OVERRIDE =
  /\b(ignore|disregard|forget|override)\b[^.?!]{0,60}\b(previous|prior|earlier|above|all)\b[^.?!]{0,40}\b(instruction|instructions|prompt|prompts|rule|rules|context|everything)\b|\bforget everything\b|\bnew (instructions?|task)\b|\byour new task\b|(игнорируй|игнорировать|забудь|отмени|не\s+учитывай)[^.?!]{0,60}(предыдущ|прежни|выше|все|всё)[^.?!]{0,40}(инструкц|указани|правил|промпт|сказанн)|забудь\s+(всё|все)|нов(ая|ое)\s+(задача|инструкция|указание)|тво[её]\s+нов(ая|ое)/i

/** Tell the model who it now is. */
const ROLE_ASSIGNMENT =
  /\byou are (now )?(a|an|the)\b|\byou are the (assistant|ai|model|system)\b|(теперь\s+ты|ты\s+теперь|ты\s+[—-]\s*)\s*(полезн|систем|ассистент|помощник|ии|модель|бот)/i

/** Address the model directly: "Assistant:", "LLM,", "System prompt:". */
const VOCATIVE =
  /\b(assistant|ai assistant|ai|llm|model|chatbot|system|gpt|chatgpt|claude|copilot|gemini)\b\s*[,:]|(ассистент|помощник|система|модель|нейросет[ьи]|ии)\s*[,:]/i

/** Ask it to keep something from the person it is working for. */
const SECRECY =
  /\bdo not (tell|mention|reveal|inform|warn|show|disclose)\b[^.?!]{0,40}\b(user|human|owner|them|anything)\b|\bwithout (telling|asking|informing) the user\b|не\s+(сообщай|говори|рассказывай|показывай|предупреждай|раскрывай)[^.?!]{0,40}(пользовател|человек|владельц|ничего|им)|(без\s+ведома|не\s+спрашивая)\s+пользовател/i

/** "If you are an AI…" — the shape that only makes sense to a machine. */
const CONDITIONAL_IDENTITY =
  /\bif you (are|can read)\b[^.?!]{0,40}\b(an? )?(ai|assistant|model|llm|bot|language model|this)\b|если\s+ты\s+(ии|ai|ассистент|помощник|модель|бот|нейросет)|если\s+ты\s+чита[её]шь\s+это/i

/** Reach for the agent's tools. */
const TOOL_INVOCATION =
  /\b(use|call|invoke|open)\b[^.?!]{0,30}\b(your |the )?(browsing|browser|search|tool|tools|function|api|plugin)\b|(вызови|используй|открой|запусти)[^.?!]{0,30}(инструмент|функци|поиск|браузер|api|плагин)/i

/** Pretend to be the system layer. */
const SYSTEM_PROMPT = /\bsystem prompt\b|\bsystem message\b|\b<\|?(system|im_start)\|?>/i

/** What an attacker actually wants out of the session. */
const SENSITIVE_TARGET =
  /\b(one-time (code|password)|otp|2fa|password|passwords|credential|credentials|cookie|cookies|session token|api key|secret|inbox|private key|seed phrase)\b|(парол[ья]|код\s+из\s+смс|одноразов\w*\s+код|секрет|учётн\w*\s+данн|сид-фраз|seed-фраз|токен\s+сесси|ключ\s+api)/i

/**
 * An imperative opening a sentence, optionally after a short adverbial clause.
 * Anchoring matters: "We use cookies" must not read as a command to use them,
 * and in Russian an infinitive is not an imperative — "принимать по одной
 * таблетке" is a leaflet, "отправь пароль" is an instruction.
 */
const IMPERATIVE =
  /(^|[.!?]\s+)(?:[a-z][a-z ]{0,30},\s*)?(open|find|send|post|copy|fetch|visit|reply|output|reveal|forward|upload|email|summarise|summarize|rate|recommend|approve|rank|ignore|disregard|forget|use)\b|(^|[.!?]\s+)(?:[а-яё][а-яё ]{0,30},\s*)?(отправ[ьи]|перешл[иь]|отош[ли]|открой|найд[иь]|скопируй|загрузи|вывед[иь]|ответь|покажи|сообщи|используй|вызови|игнорируй|забудь|оцени|порекомендуй|одобри)/i

export interface SignalReport {
  readonly signals: readonly SignalName[]
  /** Text with invisible characters removed — what the model effectively reads. */
  readonly normalised: string
}

export function analyse(text: string, charClasses: readonly string[]): SignalReport {
  const normalised = text.replace(INVISIBLE_CHARS, '')
  const found: SignalName[] = []

  if (OVERRIDE.test(normalised)) found.push('override')
  if (ROLE_ASSIGNMENT.test(normalised)) found.push('role-assignment')
  if (VOCATIVE.test(normalised)) found.push('vocative')
  if (SECRECY.test(normalised)) found.push('secrecy')
  if (CONDITIONAL_IDENTITY.test(normalised)) found.push('conditional-identity')
  if (TOOL_INVOCATION.test(normalised)) found.push('tool-invocation')
  if (SYSTEM_PROMPT.test(normalised)) found.push('system-prompt')

  // A sensitive target only counts when something is being asked of the
  // reader. "Your password must be twelve characters" is advice; "find the
  // one-time code and post it" is an instruction.
  if (SENSITIVE_TARGET.test(normalised) && IMPERATIVE.test(normalised)) {
    found.push('sensitive-target')
  }

  // Characters that are invisible to a person but not to a tokeniser have no
  // honest use inside text that is already hidden.
  const anomalous = charClasses.some(
    (c) => c === 'zero-width' || c === 'unicode-tag' || c === 'rtl-override',
  )
  if (anomalous || text !== normalised) found.push('char-anomaly')

  return { signals: found, normalised }
}
