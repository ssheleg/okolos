/**
 * The tokens, delivered into a closed shadow root.
 *
 * The extension's own pages read custom properties declared on `:root`. An
 * overlay cannot: it lives in a shadow root whose `:host` starts with
 * `all: initial`, which is the point — a page that could style the warning
 * about itself could hide it, and inheritance is styling.
 *
 * So the values are declared on `:host` instead, from the same module the
 * pages' stylesheet is generated from. Before this existed the three overlays
 * carried **twenty-two hexes of their own**: a second palette that resembled
 * the first closely enough that nobody would notice it drifting.
 *
 * **Every group in `GROUPS`, plus colour, which has two variants and so is named
 * separately.** Four groups were listed by hand and `size` was the one left out, so `--ok-size-popup`
 * was undeclared inside the shadow — and an undeclared custom property is one the
 * page may supply. `okolos-banner { --ok-size-popup: 0px }` left the panel two
 * pixels wide, holding text nobody could reach. Two lists, one of them
 * incomplete, is the shape this repository has met in the wipe confirmation and
 * in the severity order; here it is again, and the fix is the same one: derive.
 */

import { COLOUR_DARK, COLOUR_LIGHT, GROUPS, type TokenGroup } from './tokens.js'

/**
 * Every token is `!important`, and that is not decoration either.
 *
 * The values are what the panel is drawn from — its colours, its type sizes, its
 * spacing — and custom properties declared normally on `:host` are outranked by
 * the page for the same reason `all: initial` was: the outer tree wins normal
 * declarations. Measured 2026-08-20, `okolos-banner { --ok-colour-text:
 * transparent }` left a panel of the right size holding two hundred and
 * twenty-eight characters nobody could read, and `--ok-type-size-sm: 0px` with
 * `--ok-size-popup: 0` left one two pixels wide. Neither is caught by forcing
 * `display` and `visibility`: the surface was rendered, visible, and blank.
 */
const declare = (prefix: string, tokens: TokenGroup): string =>
  Object.entries(tokens)
    .map(([name, value]) => `--ok-${prefix}-${name}: ${value} !important;`)
    .join('\n      ')

/**
 * What the page may not do to the surface that is about it.
 *
 * ADR-0001 says the page can neither read, modify nor hide the warning. The
 * first two held; the third did not, and `all: initial` was the reason it looked
 * as though it did. Per CSS Scoping, when two declarations come from different
 * tree contexts the **outer** tree wins for normal declarations — so
 * `okolos-banner { display: none }` in the page's own stylesheet beat
 * `:host { all: initial }` in the shadow tree, and one line removed all three
 * surfaces.
 *
 * The same rule inverts for important declarations: the **inner** tree wins. So
 * these are `!important`, and there is no page-side declaration that can outrank
 * them — not `!important`, not `all: initial !important`, not a later stylesheet.
 *
 * **Measured in Chromium on 2026-08-20, twenty hostile declarations, six of them
 * worked:** `display: none` with and without importance, `visibility: hidden`,
 * `opacity: 0`, `transform: translate(-99999px,0)` and `filter: opacity(0)`. The
 * last two are the interesting ones and they are why this list is longer than
 * the obvious three: the panel inside is `position: fixed`, so it escapes any
 * box the host is given — unless the host becomes a **containing block** for
 * fixed descendants, which `transform`, `filter`, `perspective`, `contain`,
 * `will-change`, `backdrop-filter` and `container-type` all do. Each is forced
 * back to its non-containing value here, which is what makes every geometry
 * attack in that measurement fail: with none of them in effect, the page cannot
 * move, clip or shrink a fixed-position descendant of an element it does not own.
 *
 * `clip-path` and `mask` are here for a different reason — they clip a
 * descendant regardless of containing blocks — and `pointer-events` because a
 * readable warning whose buttons do nothing is a modified warning.
 */
export const OVERLAY_ARMOUR = `
    :host {
      /* Rendered at all, and rendered visibly. */
      display: block !important;
      visibility: visible !important;
      opacity: 1 !important;
      content-visibility: visible !important;
      pointer-events: auto !important;
      /* Not a containing block, so the fixed panel inside stays put. */
      transform: none !important;
      translate: none !important;
      rotate: none !important;
      scale: none !important;
      perspective: none !important;
      filter: none !important;
      backdrop-filter: none !important;
      contain: none !important;
      container-type: normal !important;
      will-change: auto !important;
      /* Not clipped, not masked, not blended away. */
      clip-path: none !important;
      clip: auto !important;
      mask: none !important;
      -webkit-mask: none !important;
      mix-blend-mode: normal !important;
      isolation: auto !important;
      overflow: visible !important;
      zoom: 1 !important;
    }
`

/**
 * The `:host` block every overlay opens with.
 *
 * `all: initial` first, then the properties: the reset must not remove what it
 * is followed by, and custom properties declared in the same rule survive it.
 * The armour above follows, because `all: initial` is a normal declaration and
 * the page outranks it.
 */
export const OVERLAY_TOKENS = `
    :host {
      all: initial;
      ${declare('colour', COLOUR_LIGHT)}
      ${GROUPS.map((group) => declare(group.prefix, group.tokens)).join('\n      ')}
    }
    @media (prefers-color-scheme: dark) {
      :host {
      ${declare('colour', COLOUR_DARK)}
      }
    }
${OVERLAY_ARMOUR}`
