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
 */

import { COLOUR_DARK, COLOUR_LIGHT, SHAPE, SPACE, TYPE, type TokenGroup } from './tokens.js'

const declare = (prefix: string, tokens: TokenGroup): string =>
  Object.entries(tokens)
    .map(([name, value]) => `--ok-${prefix}-${name}: ${value};`)
    .join('\n      ')

/**
 * The `:host` block every overlay opens with.
 *
 * `all: initial` first, then the properties: the reset must not remove what it
 * is followed by, and custom properties declared in the same rule survive it.
 */
export const OVERLAY_TOKENS = `
    :host {
      all: initial;
      ${declare('colour', COLOUR_LIGHT)}
      ${declare('space', SPACE)}
      ${declare('type', TYPE)}
      ${declare('shape', SHAPE)}
    }
    @media (prefers-color-scheme: dark) {
      :host {
      ${declare('colour', COLOUR_DARK)}
      }
    }
`
