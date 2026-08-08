/**
 * Punycode decoding (RFC 3492), written out rather than depended on.
 *
 * The browser only converts the other way: `URL` normalises Unicode to ASCII
 * and never back, so a host arriving as `xn--80ak6aa92e.com` stays that way
 * unless something decodes it. Showing the user `аpple.com` next to
 * `apple.com` is the entire point of the lookalike warning — without the
 * decoded form there is nothing to compare.
 */

const BASE = 36
const T_MIN = 1
const T_MAX = 26
const SKEW = 38
const DAMP = 700
const INITIAL_BIAS = 72
const INITIAL_N = 128
const DELIMITER = '-'

function digitOf(code: number): number {
  // Both bounds, deliberately. Checking only the upper one lets punctuation
  // through as a negative digit, and the decoder then invents a plausible
  // Unicode string out of anything at all.
  if (code >= 48 && code <= 57) return code - 22 // 0..9
  if (code >= 65 && code <= 90) return code - 65 // A..Z
  if (code >= 97 && code <= 122) return code - 97 // a..z
  return BASE
}

function adapt(delta: number, numPoints: number, firstTime: boolean): number {
  let value = firstTime ? Math.floor(delta / DAMP) : delta >> 1
  value += Math.floor(value / numPoints)

  let k = 0
  while (value > ((BASE - T_MIN) * T_MAX) >> 1) {
    value = Math.floor(value / (BASE - T_MIN))
    k += BASE
  }
  return k + Math.floor(((BASE - T_MIN + 1) * value) / (value + SKEW))
}

/** Returns null for input that is not valid punycode — never a guess. */
export function decodePunycode(input: string): string | null {
  const output: number[] = []
  const delimiterIndex = input.lastIndexOf(DELIMITER)

  for (let i = 0; i < (delimiterIndex > 0 ? delimiterIndex : 0); i += 1) {
    const code = input.charCodeAt(i)
    if (code >= 0x80) return null
    output.push(code)
  }

  let index = delimiterIndex > 0 ? delimiterIndex + 1 : 0
  let n = INITIAL_N
  let bias = INITIAL_BIAS
  let i = 0

  while (index < input.length) {
    const oldi = i
    let w = 1

    for (let k = BASE; ; k += BASE) {
      if (index >= input.length) return null
      const digit = digitOf(input.charCodeAt(index))
      index += 1
      if (digit >= BASE) return null
      if (digit > Math.floor((0x7fffffff - i) / w)) return null

      i += digit * w
      const t = k <= bias ? T_MIN : k >= bias + T_MAX ? T_MAX : k - bias
      if (digit < t) break
      if (w > Math.floor(0x7fffffff / (BASE - t))) return null
      w *= BASE - t
    }

    const out = output.length + 1
    bias = adapt(i - oldi, out, oldi === 0)
    if (Math.floor(i / out) > 0x7fffffff - n) return null

    n += Math.floor(i / out)
    i %= out
    output.splice(i, 0, n)
    i += 1
  }

  return String.fromCodePoint(...output)
}

/** Decodes every `xn--` label in a host; labels that are not punycode pass through. */
export function toUnicodeHost(host: string): string {
  return host
    .split('.')
    .map((label) => {
      if (!label.toLowerCase().startsWith('xn--')) return label
      const decoded = decodePunycode(label.slice(4))
      // An empty decoding is not a decoding. `xn--` with nothing behind it used
      // to come back as an empty label, so `xn--.de` became `.de` — a label
      // gone, and two different hosts comparing equal in a check whose whole
      // job is telling near-identical names apart.
      return decoded === null || decoded === '' ? label : decoded
    })
    .join('.')
}
