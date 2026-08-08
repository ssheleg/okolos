import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { COLOUR_DARK, COLOUR_LIGHT, SHAPE, SIZE, SPACE, TYPE } from './tokens.js'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..')

describe('the tokens are one source, and the CSS is derived from them', () => {
  it('carries the same roles in both schemes', () => {
    // A colour that exists in light and not in dark is a screen that loses a
    // border, a focus ring or a severity mark the moment the system switches.
    expect(Object.keys(COLOUR_LIGHT).sort()).toEqual(Object.keys(COLOUR_DARK).sort())
  })

  it('names roles rather than hues', () => {
    // `surface` survives a change of palette; `slate-100` becomes a lie.
    for (const name of Object.keys(COLOUR_LIGHT)) {
      expect(name, `${name} names a colour rather than a job`).not.toMatch(
        /slate|grey|gray|blue|red|amber|white|black/,
      )
    }
  })

  it('keeps the target minimum the accessibility sweep enforces', () => {
    expect(SHAPE['target-min']).toBe('24px')
  })

  it('is generated into the stylesheet the pages read', async () => {
    // @ts-expect-error — a plain .mjs tool, imported for its converter.
    const { toCss } = await import('../../../tools/tokens.mjs')
    const generated = readFileSync(
      path.join(root, 'apps/extension/src/tokens.generated.css'),
      'utf8',
    )
    expect(
      generated === (toCss() as string),
      'tokens.generated.css differs from tokens.ts — run `node tools/tokens.mjs`',
    ).toBe(true)
  })

  it('puts every token in the stylesheet, so none is decoration', () => {
    const css = readFileSync(path.join(root, 'apps/extension/src/tokens.generated.css'), 'utf8')
    const declared = [
      ...Object.keys(SPACE).map((n) => `--ok-space-${n}`),
      ...Object.keys(TYPE).map((n) => `--ok-type-${n}`),
      ...Object.keys(SHAPE).map((n) => `--ok-shape-${n}`),
      ...Object.keys(SIZE).map((n) => `--ok-size-${n}`),
      ...Object.keys(COLOUR_LIGHT).map((n) => `--ok-colour-${n}`),
    ]
    for (const name of declared) expect(css, `${name} is not in the generated CSS`).toContain(name)
  })

  it('is what every surface uses, including the ones inside a shadow root', () => {
    /**
     * The first version of this check read `pages.css` and nothing else, so it
     * was green while the three overlays carried **twenty-two hexes of their
     * own** — a second palette close enough to the first that drift between
     * them would have gone unseen. An extraction that looks only where it was
     * pointed is the recurring shape of every gap this project has found.
     *
     * The overlays cannot read `:root`: their host starts at `all: initial`,
     * which is the isolation the whole surface depends on. They get the same
     * values declared on `:host` instead, from this module.
     */
    const walk = (dir: string): string[] =>
      readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
        const p = path.join(dir, entry.name)
        if (entry.isDirectory()) return walk(p)
        return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [p] : []
      })

    for (const file of walk(path.join(root, 'packages/ui/src'))) {
      if (file.endsWith('tokens.ts')) continue
      const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '')
      expect(text, `${path.relative(root, file)} writes a colour of its own`).not.toMatch(
        /#[0-9a-f]{3,8}\b/i,
      )
    }
  })

  it('is what the pages actually use, rather than hand-written values beside it', () => {
    /**
     * The point of a token layer is that there is nowhere else to put a colour.
     * A hex in `pages.css` is the second place a colour lives, and the one that
     * will not change when the palette does.
     */
    const pages = readFileSync(path.join(root, 'apps/extension/src/pages.css'), 'utf8')
    const body = pages.replace(/\/\*[\s\S]*?\*\//g, '')
    expect(body, 'pages.css writes a colour of its own').not.toMatch(/#[0-9a-f]{3,8}\b/i)
    expect(body, 'pages.css writes a raw pixel value of its own').not.toMatch(/:\s*\d+px/)
  })
})
