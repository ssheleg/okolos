/** @vitest-environment happy-dom */
import { describe, expect, it } from 'vitest'

import { OVERLAY_ARMOUR, OVERLAY_TOKENS } from './overlay-tokens.js'
import { mountBanner } from './banner/banner.js'
import { mountGate } from './gate/gate.js'
import { mountInspector } from './inspector/inspector.js'

/**
 * Every token an overlay draws itself from must be declared inside the shadow.
 *
 * An undeclared custom property is one the page may supply, and the page is the
 * thing being warned about. `--ok-size-popup` was undeclared for exactly this
 * reason — four of the five token groups were named by hand in the overlay
 * stylesheet and `size` was left out — so
 * `okolos-banner { --ok-size-popup: 0px }` left the panel two pixels wide, with
 * two hundred and twenty-eight characters in it that nobody could reach.
 *
 * The check is on the *usage*, not on a list of groups: it reads every
 * `var(--ok-…)` out of the three surfaces' own stylesheets and requires a
 * declaration for each. That catches a new group, a new token inside an old
 * group, and a misspelling, none of which a group-to-group comparison would see.
 */

function stylesheetsOfEverySurface(): string {
  const texts: string[] = []
  const grab = (root: ShadowRoot | null) => {
    for (const style of root?.querySelectorAll('style') ?? []) texts.push(style.textContent ?? '')
  }

  document.body.innerHTML = ''
  const banner = mountBanner(
    document,
    { variant: 'injection', severity: 'major', headline: 'h', detail: 'd', sourceLine: 's' },
    { onPrimary: () => {}, onRetry: () => {}, onDispute: () => {}, onDismiss: () => {} },
  )
  grab(banner.root)

  const gate = mountGate(
    document,
    { action: 'a', findings: ['f'], timeoutSeconds: 10 },
    { onBlock: () => {}, onAllowOnce: () => {}, onShowInjection: () => {} },
  )
  grab(gate.root)

  const inspector = mountInspector(
    document,
    { evidence: [], confidence: 'high' },
    { onKeep: () => {}, onRestore: () => {}, onDispute: () => {}, onClose: () => {} },
  )
  grab(inspector.root)

  return texts.join('\n')
}

describe('the tokens the page cannot supply', () => {
  it('declares every token the three surfaces actually use', () => {
    const css = stylesheetsOfEverySurface()
    const used = [...css.matchAll(/var\((--ok-[a-z0-9-]+)/g)].map((m) => m[1] as string)
    expect(used.length, 'no tokens found — the extractor is reading the wrong thing').toBeGreaterThan(
      10,
    )

    const undeclared = [...new Set(used)].filter((name) => !OVERLAY_TOKENS.includes(`${name}:`))
    expect(
      undeclared,
      'tokens used inside the shadow and declared nowhere in it — the page may supply these',
    ).toEqual([])
  })

  it('declares them with importance, because the page outranks a normal declaration', () => {
    // The outer tree wins normal declarations; only an important one in the inner
    // tree is out of the page's reach. `--ok-colour-text: transparent` from the
    // page left a panel of the right size holding text nobody could read.
    const declarations = [...OVERLAY_TOKENS.matchAll(/(--ok-[a-z0-9-]+):\s*([^;]+);/g)]
    expect(declarations.length).toBeGreaterThan(10)
    const soft = declarations.filter((m) => !String(m[2]).includes('!important')).map((m) => m[1])
    expect(soft, 'tokens the page can overrule').toEqual([])
  })
})

describe('the armour', () => {
  it('is part of what every surface ships, not a constant nobody applied', () => {
    const css = stylesheetsOfEverySurface()
    // Three surfaces, three stylesheets, and the armour in each of them.
    const occurrences = css.split('display: block !important').length - 1
    expect(occurrences).toBe(3)
  })

  it('forces back every property that can hide an element or contain a fixed child', () => {
    /**
     * Named one by one rather than counted, because the list is the finding. Six
     * of twenty hostile declarations worked in Chromium on 2026-08-20, and two of
     * the six — `transform` and `filter` — worked not by hiding anything but by
     * making the host a containing block for the fixed panel inside it. Every
     * property that does that is here for that reason, and dropping one is a hole
     * a browser test would take minutes to find and a reader would not.
     */
    for (const property of [
      'display',
      'visibility',
      'opacity',
      'content-visibility',
      'pointer-events',
      'transform',
      'translate',
      'rotate',
      'scale',
      'perspective',
      'filter',
      'backdrop-filter',
      'contain',
      'container-type',
      'will-change',
      'clip-path',
      'clip',
      'mask',
      'mix-blend-mode',
      'isolation',
      'overflow',
      'zoom',
    ]) {
      expect(OVERLAY_ARMOUR, `${property} is not forced back`).toMatch(
        new RegExp(`\\n\\s*(-webkit-)?${property}:[^;]*!important;`),
      )
    }
  })
})
