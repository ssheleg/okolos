/**
 * SHA-1, in JavaScript, because the platform's own is not available where this
 * runs.
 *
 * `crypto.subtle` is `[SecureContext]` and the manifest matches plain-HTTP pages.
 * So on any `http://` page `crypto.subtle` is `undefined`, the digest threw, and
 * the password check's `catch` swallowed it in silence — **the reuse and breach
 * check simply did not run**, on exactly the pages where a password submitted in
 * the clear matters most. Measured 2026-08-20 by scanning the shipped content
 * bundle for secure-context APIs.
 *
 * Not a general-purpose crypto primitive and not used as one: SHA-1 is here
 * because Have I Been Pwned's range API is defined over SHA-1 prefixes, so the
 * algorithm is chosen by the protocol rather than by us, and the digest never
 * leaves the device whole — five characters of it do. Its weakness is collision
 * resistance, which nothing here depends on.
 *
 * Written from FIPS 180-4 §6.1.2 and checked against the standard vectors plus
 * the platform's own implementation, so "ours agrees with the browser's" is a
 * test rather than a hope.
 */

/** Rotate left within 32 bits. */
function rotl(value: number, by: number): number {
  return ((value << by) | (value >>> (32 - by))) >>> 0
}

/**
 * The digest of `bytes`, as 20 bytes.
 *
 * Bytes in and bytes out: the caller decides about encoding, because a function
 * that takes a string has to decide about it silently, and UTF-8 is the only
 * right answer for a password field only until somebody passes something else.
 */
export function sha1(bytes: Uint8Array): Uint8Array {
  const bitLength = bytes.length * 8

  // Message + 0x80 + zero padding to 56 mod 64, then the length as 64 bits.
  const padded = new Uint8Array(((bytes.length + 8) >> 6 << 6) + 64)
  padded.set(bytes)
  padded[bytes.length] = 0x80
  // The high 32 bits of the length: a password long enough to need them does not
  // exist, and writing them anyway is cheaper than a comment explaining why not.
  const view = new DataView(padded.buffer)
  view.setUint32(padded.length - 8, Math.floor(bitLength / 0x100000000))
  view.setUint32(padded.length - 4, bitLength >>> 0)

  let h0 = 0x67452301
  let h1 = 0xefcdab89
  let h2 = 0x98badcfe
  let h3 = 0x10325476
  let h4 = 0xc3d2e1f0

  const w = new Uint32Array(80)
  for (let at = 0; at < padded.length; at += 64) {
    for (let i = 0; i < 16; i += 1) w[i] = view.getUint32(at + i * 4)
    for (let i = 16; i < 80; i += 1) {
      w[i] = rotl((w[i - 3] as number) ^ (w[i - 8] as number) ^ (w[i - 14] as number) ^ (w[i - 16] as number), 1)
    }

    let a = h0
    let b = h1
    let c = h2
    let d = h3
    let e = h4

    for (let i = 0; i < 80; i += 1) {
      const [f, k] =
        i < 20
          ? [(b & c) | (~b & d), 0x5a827999]
          : i < 40
            ? [b ^ c ^ d, 0x6ed9eba1]
            : i < 60
              ? [(b & c) | (b & d) | (c & d), 0x8f1bbcdc]
              : [b ^ c ^ d, 0xca62c1d6]

      const next = (rotl(a, 5) + (f >>> 0) + e + k + (w[i] as number)) >>> 0
      e = d
      d = c
      c = rotl(b, 30)
      b = a
      a = next
    }

    h0 = (h0 + a) >>> 0
    h1 = (h1 + b) >>> 0
    h2 = (h2 + c) >>> 0
    h3 = (h3 + d) >>> 0
    h4 = (h4 + e) >>> 0
  }

  const out = new Uint8Array(20)
  const outView = new DataView(out.buffer)
  outView.setUint32(0, h0)
  outView.setUint32(4, h1)
  outView.setUint32(8, h2)
  outView.setUint32(12, h3)
  outView.setUint32(16, h4)
  return out
}

/** The digest of a UTF-8 string, upper-case hex — the shape the range API wants. */
export function sha1Hex(text: string): string {
  return [...sha1(new TextEncoder().encode(text))]
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase()
}
