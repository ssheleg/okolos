import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { handle } from './router.js'
import { PUBLIC_STYLE } from './style.generated.js'

/**
 * The public pages have a visual layer, and it comes from the tokens.
 *
 * All three shipped with none until 2026-08-21: Times New Roman, browser bullets, text edge
 * to edge across a wide window — while the markup, the copy and the metadata were right. The
 * markup being right is exactly why nothing caught it: every gate reads structure, and none of
 * them looks. Found by rendering the pages, the same axis that found the dashboard shipping
 * without a single style rule.
 */

const root = path.resolve(import.meta.dirname, '../../..')
const env = {} as never

const PAGES = [
  ['the landing page', 'https://okolos-proxy.workers.dev/'],
  ['the privacy page', 'https://okolos-proxy.workers.dev/privacy'],
  ['the status page', 'https://okolos-proxy.workers.dev/status?domain=okolos.app'],
] as const

describe('every public page carries the product’s own styling', () => {
  for (const [name, url] of PAGES) {
    it(`${name} inlines the sheet`, async () => {
      const html = await (await handle(new Request(url), env)).text()
      expect(html, 'no style block at all').toContain('<style>')
      // A token, not the word "style": a page could carry an empty block and pass.
      expect(html, 'the sheet carries no tokens').toContain('--ok-colour-surface')
      expect(html, 'the page rules are missing').toContain('max-inline-size: var(--ok-size-page-max)')
    })
  }

  it('is generated from the tokens, not written twice', async () => {
    // @ts-expect-error — a plain .mjs tool, imported for its generator.
    const { toModule } = await import('../../../tools/public-style.mjs')
    const generated = readFileSync(path.join(root, 'apps/proxy/src/style.generated.ts'), 'utf8')
    expect(
      generated === (toModule() as string),
      'style.generated.ts differs from the tokens — run `node tools/public-style.mjs`',
    ).toBe(true)
  })

  it('declares no colour of its own, so the palette lives in one place', () => {
    // The same rule the extension's stylesheet is held to: a hex here would be the second
    // place a colour lives. The tokens block itself is where hexes belong.
    const rules = PUBLIC_STYLE.slice(PUBLIC_STYLE.indexOf('html {'))
    expect(rules).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
  })
})
