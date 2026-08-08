/**
 * The words the product says, and where they come from.
 *
 * The renderers in `@okolos/ui` draw a document; they must not know which
 * browser they are in, so the catalogue is not read from `chrome.i18n` here.
 * The host resolves a message and hands the resolver in once; everything
 * downstream asks by key.
 *
 * A key that is missing is a **defect that must be visible**, not a blank space
 * on a screen. The fallback is the key itself, in brackets — ugly on purpose,
 * because a silently empty warning is the one failure this product cannot
 * afford.
 */

export type Resolver = (key: string, substitutions?: readonly string[]) => string

/** Reads a catalogue in the browser's `_locales` shape. */
export interface Catalogue {
  readonly [key: string]: {
    readonly message: string
    readonly placeholders?: Readonly<Record<string, { readonly content: string }>>
  }
}

/**
 * A resolver over a plain catalogue — what tests use, and what proves the shape
 * without a browser.
 *
 * **The format is the platform's, not ours, and it is stricter than it looks.**
 * A first version wrote `$1` straight into the message and this file claimed
 * that was the convention. It is not: Chrome refuses to load an extension whose
 * catalogue contains a bare `$` outside a declared placeholder — not the
 * message, the whole extension, with no service worker and every end-to-end
 * test failing at fixture setup.
 *
 * So substitutions are named — `$FEED$` in the message, a `placeholders` entry
 * mapping `feed` to `$1` — and this resolver reads exactly what
 * `chrome.i18n.getMessage` reads.
 */
export function fromCatalogue(catalogue: Catalogue): Resolver {
  return (key, substitutions = []) => {
    const entry = catalogue[key]
    if (entry === undefined) return `[${key}]`
    const placeholders = entry.placeholders ?? {}
    return entry.message.replace(/\$([A-Za-z0-9_]+)\$/g, (whole, name: string) => {
      const content = placeholders[name.toLowerCase()]?.content
      const index = content === undefined ? NaN : Number(content.slice(1))
      const value = Number.isFinite(index) ? substitutions[index - 1] : undefined
      return value ?? whole
    })
  }
}

let resolve: Resolver = (key) => `[${key}]`

/**
 * Installs the resolver for this document. Called once, by the entry point that
 * knows which browser it is in.
 *
 * Module state rather than a parameter threaded through every renderer: the
 * alternative is changing fourteen signatures so that each one can pass a value
 * that never varies within a document. The cost is that a test which forgets to
 * install one sees `[key]` — which is exactly what a user would see, so the
 * failure reads the same in both places.
 */
export function useResolver(resolver: Resolver): void {
  resolve = resolver
}

/** The message for this key, with `$1`-style substitutions applied. */
export function t(key: string, ...substitutions: readonly string[]): string {
  return resolve(key, substitutions)
}
