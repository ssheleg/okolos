import type { MailAddress, MailAttachment, ParseOutcome } from './types.js'

/**
 * Reading a message, with every ceiling expressed as a count.
 *
 * **Not one of these is a clock, and that is the point.** The browser side paid
 * four red CI runs for the opposite (B-110): a traversal bounded by wall time
 * gave up on a seven-node page when the machine was busy, and the page went
 * unwarned. A message is attacker-chosen input, so the bound has to be a
 * property of the input rather than of the machine reading it — otherwise the
 * same message is judged differently depending on what else is running.
 */
export const LIMITS = {
  /** Whole file. Past this the answer is a refusal, not a partial read. */
  bytes: 25 * 1024 * 1024,
  /** MIME parts visited. Reaching it marks the message truncated. */
  parts: 200,
  /** Nesting depth of multipart containers. */
  depth: 12,
  /** Bytes kept per attachment; the rest is cut and the part says so. */
  attachmentBytes: 8 * 1024 * 1024,
} as const

const DECODERS: Readonly<Record<string, (raw: string, charset: string) => string>> = {
  b: (raw, charset) => decodeBytes(base64Bytes(raw), charset),
  q: (raw, charset) =>
    decodeBytes(
      quotedPrintableBytes(raw.replace(/_/g, ' ')),
      charset,
    ),
}

function decodeBytes(bytes: Uint8Array, charset: string): string {
  try {
    return new TextDecoder(charset).decode(bytes)
  } catch {
    // An unknown charset is not a reason to lose the text: UTF-8 is what the
    // overwhelming majority of these actually are, and a mangled word beats a
    // dropped one on a surface whose job is to show what was written.
    return new TextDecoder('utf-8').decode(bytes)
  }
}

function base64Bytes(raw: string): Uint8Array {
  const clean = raw.replace(/[^A-Za-z0-9+/=]/g, '')
  const table = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const out: number[] = []
  let buffer = 0
  let bits = 0
  for (const ch of clean) {
    if (ch === '=') break
    const value = table.indexOf(ch)
    if (value < 0) continue
    buffer = (buffer << 6) | value
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out.push((buffer >> bits) & 0xff)
    }
  }
  return Uint8Array.from(out)
}

function quotedPrintableBytes(raw: string): Uint8Array {
  const out: number[] = []
  for (let i = 0; i < raw.length; i += 1) {
    const ch = raw[i]
    if (ch === '=' && i + 2 < raw.length) {
      const hex = raw.slice(i + 1, i + 3)
      if (/^[0-9A-Fa-f]{2}$/.test(hex)) {
        out.push(Number.parseInt(hex, 16))
        i += 2
        continue
      }
    }
    if (ch === undefined) continue
    out.push(ch.charCodeAt(0) & 0xff)
  }
  return Uint8Array.from(out)
}

/**
 * RFC 2047 encoded words. A brand name in a subject or a display name is
 * routinely encoded, so a checker that reads the raw form is reading a
 * different string from the one the человек sees — and the mismatch between
 * those two strings is exactly what this product looks for elsewhere.
 */
export function decodeEncodedWords(value: string): string {
  return value.replace(
    /=\?([^?]+)\?([BbQq])\?([^?]*)\?=/g,
    (whole, charset: string, kind: string, payload: string) => {
      const decoder = DECODERS[kind.toLowerCase()]
      return decoder ? decoder(payload, charset.toLowerCase()) : whole
    },
  )
}

/** Splits on commas that are not inside a quoted string or an angle pair. */
function splitAddressList(value: string): string[] {
  const parts: string[] = []
  let current = ''
  let quoted = false
  let angled = false
  for (const ch of value) {
    if (ch === '"') quoted = !quoted
    else if (!quoted && ch === '<') angled = true
    else if (!quoted && ch === '>') angled = false
    if (ch === ',' && !quoted && !angled) {
      parts.push(current)
      current = ''
      continue
    }
    current += ch
  }
  parts.push(current)
  return parts.map((p) => p.trim()).filter((p) => p.length > 0)
}

export function parseAddressList(value: string | undefined): MailAddress[] {
  if (value === undefined) return []
  return splitAddressList(value).map((raw) => {
    const angle = /<([^>]*)>/.exec(raw)
    const addressPart = (angle?.[1] ?? raw).trim()
    const displayPart = angle ? raw.slice(0, angle.index).trim() : ''
    const display = decodeEncodedWords(displayPart.replace(/^"(.*)"$/s, '$1')).trim()
    const valid = /^[^\s@]+@[^\s@]+$/.test(addressPart)
    const address = valid ? addressPart.toLowerCase() : null
    return {
      display: display.length > 0 ? display : null,
      address,
      domain: address === null ? null : (address.slice(address.lastIndexOf('@') + 1) || null),
      raw: raw.trim(),
    }
  })
}

/**
 * Where the headers stop and the body starts, by the separator rather than by
 * counting.
 *
 * The first version of this counted characters as it walked the header lines —
 * `line.length + 1` — which is correct for LF and short by one per line for
 * CRLF, and a message is CRLF. Every body then began a few characters inside
 * the last header, so `Content-Type: text/plain; charset=utf-8` contributed
 * `-8` to the text of every message this parser read. The fix is not a better
 * constant: it is not counting at all, because an arithmetic body offset is a
 * whole class of off-by-N that has no reason to exist next to a regex.
 */
function splitHeadBody(source: string): { readonly head: string; readonly body: string } {
  const separator = /\r?\n\r?\n/.exec(source)
  if (separator === null) return { head: source, body: '' }
  return {
    head: source.slice(0, separator.index),
    body: source.slice(separator.index + separator[0].length),
  }
}

/** Unfolds continuation lines, because a folded header is one header. */
function readHeaders(source: string): Map<string, string[]> | null {
  const map = new Map<string, string[]>()
  const lines = source.split(/\r?\n/)
  let current: { name: string; value: string } | null = null
  let sawOne = false

  const flush = (): void => {
    if (current === null) return
    const list = map.get(current.name) ?? []
    list.push(current.value.trim())
    map.set(current.name, list)
    current = null
  }

  for (const line of lines) {
    if (line === '') break
    if (/^[ \t]/.test(line) && current !== null) {
      current.value += ` ${line.trim()}`
      continue
    }
    const colon = line.indexOf(':')
    if (colon <= 0) {
      // A line that is not a header ends the block. If nothing before it was a
      // header either, this is not a message.
      break
    }
    flush()
    sawOne = true
    current = { name: line.slice(0, colon).trim().toLowerCase(), value: line.slice(colon + 1) }
  }
  flush()
  return sawOne ? map : null
}

function parameter(headerValue: string | undefined, name: string): string | null {
  if (headerValue === undefined) return null
  const quoted = new RegExp(`${name}\\s*=\\s*"([^"]*)"`, 'i').exec(headerValue)
  if (quoted?.[1] !== undefined) return quoted[1]
  const bare = new RegExp(`${name}\\s*=\\s*([^;\\s]+)`, 'i').exec(headerValue)
  return bare?.[1] ?? null
}

function mimeType(headerValue: string | undefined): string | null {
  if (headerValue === undefined) return null
  const head = headerValue.split(';', 1)[0]?.trim().toLowerCase()
  return head !== undefined && head.length > 0 ? head : null
}

function decodeBody(body: string, encoding: string | null): Uint8Array {
  switch ((encoding ?? '').toLowerCase()) {
    case 'base64':
      return base64Bytes(body)
    case 'quoted-printable':
      return quotedPrintableBytes(body.replace(/=\r?\n/g, ''))
    default:
      return new TextEncoder().encode(body)
  }
}

interface Walker {
  parts: number
  truncated: boolean
  text: string | null
  html: string | null
  attachments: MailAttachment[]
}

function walk(
  headers: Map<string, string[]>,
  body: string,
  depth: number,
  state: Walker,
): void {
  if (depth > LIMITS.depth || state.parts >= LIMITS.parts) {
    state.truncated = true
    return
  }
  state.parts += 1

  const contentType = headers.get('content-type')?.[0]
  const type = mimeType(contentType) ?? 'text/plain'
  const disposition = headers.get('content-disposition')?.[0]
  const encoding = headers.get('content-transfer-encoding')?.[0]?.trim() ?? null
  const charset = parameter(contentType, 'charset') ?? 'utf-8'

  if (type.startsWith('multipart/')) {
    const boundary = parameter(contentType, 'boundary')
    if (boundary === null) return
    for (const chunk of splitParts(body, boundary)) {
      if (state.parts >= LIMITS.parts) {
        state.truncated = true
        return
      }
      const split = splitHeadBody(chunk.replace(/^\r?\n/, ''))
      const inner = readHeaders(split.head)
      if (inner === null) {
        state.parts += 1
        continue
      }
      walk(inner, split.body, depth + 1, state)
    }
    return
  }

  const filename =
    parameter(disposition, 'filename') ?? parameter(contentType, 'name') ?? null
  const isAttachment =
    filename !== null || (disposition ?? '').trim().toLowerCase().startsWith('attachment')

  if (isAttachment) {
    const all = decodeBody(body.trim(), encoding)
    const cut = all.byteLength > LIMITS.attachmentBytes
    state.attachments.push({
      filename: filename === null ? null : decodeEncodedWords(filename),
      declaredType: type,
      bytes: cut ? all.slice(0, LIMITS.attachmentBytes) : all,
      truncated: cut,
    })
    return
  }

  const decoded = decodeBytes(decodeBody(body, encoding), charset).replace(/\r\n/g, '\n')
  if (type === 'text/html') {
    if (state.html === null) state.html = decoded.trim()
    return
  }
  if (state.text === null) state.text = decoded.trim()
}

function splitParts(body: string, boundary: string): string[] {
  const marker = `--${boundary}`
  const out: string[] = []
  const lines = body.split(/\r?\n/)
  let current: string[] | null = null
  for (const line of lines) {
    if (line.trim() === `${marker}--`) break
    if (line.trim() === marker) {
      if (current !== null) out.push(current.join('\n'))
      current = []
      continue
    }
    current?.push(line)
  }
  if (current !== null) out.push(current.join('\n'))
  return out
}

/**
 * Strips the Apple wrapper when there is one.
 *
 * `.emlx` is a byte count, then the message, then Apple's own plist. The count
 * is the single integrity check the format carries, so a mismatch is reported
 * rather than worked around: a file whose declared length disagrees with its
 * contents is a truncated or tampered one, and reading what happens to be there
 * would hand back a message that nobody sent.
 */
function unwrapEmlx(
  source: string,
): { ok: true; body: string } | { ok: false; declared: number; actual: number } | null {
  const first = /^(\d+)\r?\n/.exec(source)
  if (first?.[1] === undefined) return null
  const declared = Number.parseInt(first[1], 10)
  const rest = source.slice(first[0].length)
  const plist = rest.indexOf('<?xml')
  const body = plist < 0 ? rest : rest.slice(0, plist)
  const actual = new TextEncoder().encode(body).byteLength
  // Trailing newlines between the message and the plist are not part of the
  // count in every writer, so the comparison allows the separator itself.
  if (Math.abs(actual - declared) > 4) return { ok: false, declared, actual }
  return { ok: true, body }
}

export function parseMessage(source: string): ParseOutcome {
  if (source.trim().length === 0) return { ok: false, reason: { code: 'empty' } }

  const size = new TextEncoder().encode(source).byteLength
  if (size > LIMITS.bytes) {
    return { ok: false, reason: { code: 'too-large', bytes: size, ceiling: LIMITS.bytes } }
  }

  const unwrapped = unwrapEmlx(source)
  if (unwrapped !== null && !unwrapped.ok) {
    return {
      ok: false,
      reason: {
        code: 'emlx-length-mismatch',
        declared: unwrapped.declared,
        actual: unwrapped.actual,
      },
    }
  }
  const rfc822 = unwrapped === null ? source : unwrapped.body

  const split = splitHeadBody(rfc822)
  const head = readHeaders(split.head)
  if (head === null) return { ok: false, reason: { code: 'no-headers' } }

  const state: Walker = { parts: 0, truncated: false, text: null, html: null, attachments: [] }
  walk(head, split.body, 0, state)

  const single = (name: string): string | null => {
    const value = head.get(name)?.[0]
    return value === undefined ? null : decodeEncodedWords(value)
  }

  return {
    ok: true,
    message: {
      headers: head,
      subject: single('subject'),
      from: parseAddressList(head.get('from')?.[0]),
      to: parseAddressList(head.get('to')?.[0]),
      cc: parseAddressList(head.get('cc')?.[0]),
      replyTo: parseAddressList(head.get('reply-to')?.[0]),
      date: head.get('date')?.[0] ?? null,
      text: state.text,
      html: state.html,
      attachments: state.attachments,
      truncated: state.truncated,
    },
  }
}
