#!/usr/bin/env node
/**
 * The extension's icon, drawn rather than pasted.
 *
 *   node tools/icons.mjs        # writes apps/extension/icons/*.png
 *
 * A binary nobody can regenerate is the same drift as a hand-written document
 * beside generated ones: the day the mark changes, four files have to change
 * together and one of them will not. Here the sizes are derived from one
 * description, and a test checks that the committed files match what this
 * script produces.
 *
 * The mark: a closed ring around a dot. `около` is "around" — the ring is the
 * perimeter the product watches, the dot is the person standing inside it.
 *
 * It was drawn with a gap first, to mean "the part left to you". At 16px any
 * gap in a ring reads as the letter C, which is the wrong initial and a worse
 * idea than the one it was carrying. That is not an angle to tune: it is what
 * the size does. Checked by looking, at the size that decides.
 *
 * Drawn with plain arithmetic and supersampling, so it survives 16px without a
 * font, an SVG rasteriser or a dependency. Colours come from the brand pack's
 * rule that severity is never carried by colour alone: this is a calm slate,
 * not an alarm.
 */
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const OUT = path.join(root, 'apps/extension/icons')
export const SIZES = [16, 32, 48, 128]

/** Deep slate — dark enough for a light toolbar, light enough for a dark one. */
const BACKGROUND = [30, 41, 59]
const RING = [226, 232, 240]

/** Supersampling factor. 4× is enough that a 16px ring has no jagged edge. */
const SS = 4

function crc32(bytes) {
  let crc = ~0
  for (const byte of bytes) {
    crc ^= byte
    for (let bit = 0; bit < 8; bit += 1) crc = (crc >>> 1) ^ (0xed_b8_83_20 & -(crc & 1))
  }
  return ~crc >>> 0
}

function chunk(type, data) {
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

/** RGBA pixels → a PNG file. Colour type 6, 8 bits, no interlace. */
function png(width, height, rgba) {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(width, 0)
  header.writeUInt32BE(height, 4)
  header[8] = 8
  header[9] = 6
  const raw = Buffer.alloc((width * 4 + 1) * height)
  for (let y = 0; y < height; y += 1) {
    raw[y * (width * 4 + 1)] = 0 // filter: none
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', header),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

/**
 * Coverage of one pixel by the mark, in [0, 1], by supersampling.
 *
 * Everything is expressed as a fraction of the size, so the same description
 * draws 16 and 128 without a special case.
 */
function coverage(size, px, py) {
  const centre = size / 2
  const outer = size * 0.42
  const inner = size * 0.27
  const dot = size * 0.115

  let hits = 0
  for (let sy = 0; sy < SS; sy += 1) {
    for (let sx = 0; sx < SS; sx += 1) {
      const x = px + (sx + 0.5) / SS - centre
      const y = py + (sy + 0.5) / SS - centre
      const distance = Math.hypot(x, y)
      if (distance <= dot || (distance >= inner && distance <= outer)) hits += 1
    }
  }
  return hits / (SS * SS)
}

/** Coverage of the rounded-square plate behind the mark. */
function plate(size, px, py) {
  const radius = size * 0.22
  let hits = 0
  for (let sy = 0; sy < SS; sy += 1) {
    for (let sx = 0; sx < SS; sx += 1) {
      const x = px + (sx + 0.5) / SS
      const y = py + (sy + 0.5) / SS
      const dx = Math.max(radius - x, 0, x - (size - radius))
      const dy = Math.max(radius - y, 0, y - (size - radius))
      if (Math.hypot(dx, dy) <= radius) hits += 1
    }
  }
  return hits / (SS * SS)
}

export function draw(size) {
  const rgba = Buffer.alloc(size * size * 4)
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const base = (y * size + x) * 4
      const onPlate = plate(size, x, y)
      const onRing = Math.min(coverage(size, x, y), onPlate)
      for (let c = 0; c < 3; c += 1) {
        rgba[base + c] = Math.round(
          BACKGROUND[c] * (1 - onRing) + RING[c] * onRing,
        )
      }
      rgba[base + 3] = Math.round(255 * onPlate)
    }
  }
  return png(size, size, rgba)
}

if (import.meta.filename === process.argv[1]) {
  mkdirSync(OUT, { recursive: true })
  for (const size of SIZES) {
    const file = path.join(OUT, `${size}.png`)
    writeFileSync(file, draw(size))
    console.log(`wrote ${path.relative(root, file)}`)
  }
}
