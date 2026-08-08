/**
 * The one place a colour, a step or a size is decided.
 *
 * `docs/ux/screens.md` planned this file and said the style pack was "not
 * chosen yet". It stayed unchosen while fourteen screens were built, and the
 * result was not plain — it was unreadable: three spans in a row with nothing
 * between them render as "Local storagedoneready".
 *
 * The choices below follow the rules the product already holds rather than a
 * taste:
 *
 *   - **Severity is never carried by colour alone** (WCAG 2.2 AA, and the
 *     product's own cross-screen rule). Each severity has a colour *and* the
 *     screens pair it with a word and an icon; the colour is the third signal,
 *     not the first.
 *   - **Calm.** This product speaks where a person is already frightened — a
 *     blocked page, a leaked password. Nothing here is loud: no saturated red
 *     as a surface, no colour that reads as an alarm on its own.
 *   - **Dense, not airy.** These are working screens read repeatedly, not a
 *     landing page. The spacing scale is small and the type scale is short.
 *
 * Consumed as CSS custom properties, generated from here by `tools/tokens.mjs`
 * so the values exist once. A test compares the generated file with what this
 * produces.
 */

export interface TokenGroup {
  readonly [name: string]: string
}

/**
 * Colour, in two schemes.
 *
 * Named by role rather than by hue: a screen asks for `surface` and `text`, and
 * the scheme decides what those are. Renaming a hue then costs one line here
 * instead of a search across fourteen screens.
 */
export const COLOUR_LIGHT: TokenGroup = {
  surface: '#ffffff',
  'surface-sunken': '#f1f5f9',
  'surface-raised': '#ffffff',
  border: '#cbd5e1',
  'border-strong': '#94a3b8',
  text: '#0f172a',
  'text-muted': '#475569',
  accent: '#1e293b',
  'accent-text': '#f8fafc',
  focus: '#2563eb',
  'severity-info': '#0369a1',
  'severity-warn': '#a16207',
  'severity-block': '#b91c1c',
}

export const COLOUR_DARK: TokenGroup = {
  surface: '#0f172a',
  'surface-sunken': '#020617',
  'surface-raised': '#1e293b',
  border: '#334155',
  'border-strong': '#64748b',
  text: '#e2e8f0',
  'text-muted': '#94a3b8',
  accent: '#e2e8f0',
  'accent-text': '#0f172a',
  focus: '#60a5fa',
  'severity-info': '#7dd3fc',
  'severity-warn': '#fcd34d',
  'severity-block': '#fca5a5',
}

/** A 4px base, because these screens pack a lot into a popup. */
export const SPACE: TokenGroup = {
  '0': '0',
  '1': '4px',
  '2': '8px',
  '3': '12px',
  '4': '16px',
  '5': '24px',
  '6': '32px',
}

/**
 * Type, short on purpose.
 *
 * Four sizes cover every screen here. A longer scale invites a fifth size for
 * one heading, and then the fifth is the only one nobody can place.
 */
export const TYPE: TokenGroup = {
  'font-family':
    "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  'font-mono': "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  'size-sm': '13px',
  'size-base': '15px',
  'size-lg': '19px',
  'size-xl': '24px',
  'line-tight': '1.25',
  'line-base': '1.55',
  'weight-normal': '400',
  'weight-strong': '600',
}

export const SHAPE: TokenGroup = {
  radius: '6px',
  'radius-lg': '10px',
  /** The minimum the accessibility sweep already enforces. */
  'target-min': '24px',
  'focus-width': '2px',
  'focus-offset': '2px',
  /** One hairline for every border, so a stray 2px cannot appear on one card. */
  hairline: '1px',
  /** The severity bar: thick enough to see, never the only signal. */
  'severity-bar': '3px',
}

/**
 * The two widths these screens actually have.
 *
 * Here rather than written into the stylesheet, because the gate forbids a
 * length that did not come from this file — and "this one is obviously local"
 * is the argument that lets the next one in.
 */
export const SIZE: TokenGroup = {
  popup: '380px',
  'page-max': '780px',
}

export const GROUPS: ReadonlyArray<{ prefix: string; tokens: TokenGroup }> = [
  { prefix: 'size', tokens: SIZE },
  { prefix: 'space', tokens: SPACE },
  { prefix: 'type', tokens: TYPE },
  { prefix: 'shape', tokens: SHAPE },
]
