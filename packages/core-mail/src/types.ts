/**
 * What a message is, once it has been read — and what "read" is allowed to mean.
 *
 * Every field here is a fact taken from the bytes. Nothing is inferred, nothing
 * is defaulted to a friendly value, and an address that could not be parsed is
 * `null` rather than an empty string: a caller that has to distinguish "absent"
 * from "present and empty" cannot do it afterwards.
 */

export interface MailAddress {
  /** The display name, unquoted and with encoded words decoded. */
  readonly display: string | null
  /** The addr-spec, lowercased. Null when the token could not be parsed. */
  readonly address: string | null
  /** Everything after the last `@`, lowercased. Null when there is no address. */
  readonly domain: string | null
  /** What stood in the header, so a surface can show what was actually written. */
  readonly raw: string
}

export interface MailAttachment {
  /** The name as stored — never as a terminal would render it. */
  readonly filename: string | null
  /** The `Content-Type` the message claims. What the bytes say is a later check. */
  readonly declaredType: string | null
  readonly bytes: Uint8Array
  /** True when the part hit the per-attachment ceiling and was cut. */
  readonly truncated: boolean
}

export interface MailMessage {
  /** Lowercased name -> every value, in the order they appeared. */
  readonly headers: ReadonlyMap<string, readonly string[]>
  readonly subject: string | null
  readonly from: readonly MailAddress[]
  readonly to: readonly MailAddress[]
  readonly cc: readonly MailAddress[]
  readonly replyTo: readonly MailAddress[]
  /** The raw `Date` header. This package never reads a clock (REQ-01). */
  readonly date: string | null
  readonly text: string | null
  readonly html: string | null
  readonly attachments: readonly MailAttachment[]
  /**
   * True when a ceiling was reached. A verdict over a truncated message must
   * say so: the difference between "nothing found" and "nothing found in the
   * part we read" is the whole of standing instruction 3.
   */
  readonly truncated: boolean
}

export type ParseFailure =
  | { readonly code: 'empty' }
  | { readonly code: 'no-headers' }
  | { readonly code: 'emlx-length-mismatch'; readonly declared: number; readonly actual: number }
  | { readonly code: 'too-large'; readonly bytes: number; readonly ceiling: number }

export type ParseOutcome =
  | { readonly ok: true; readonly message: MailMessage }
  | { readonly ok: false; readonly reason: ParseFailure }
