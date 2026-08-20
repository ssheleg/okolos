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

/**
 * An argument to a journalled message: either data, or a message of ours.
 *
 * The journal stores `explainKey` and resolves it when somebody reads it, so the
 * reader's language decides how an old row reads. Its arguments were stored as finished
 * strings, which quietly undid half of that: a feed's name or the phrase "неназванная
 * сторона" is *our* word, resolved on the day of the write, so a reader who switched
 * language got their own sentence with a word of the old one inside it (B-77).
 *
 * A `{ messageKey }` argument says "this position is a message, not data". Everything else —
 * a host, a method, a browser's error text, an extension's own name, a number — stays a
 * string, because inventing a translation for it would be inventing a fact.
 */
export type ExplainArg = string | { readonly messageKey: string }
// The field is `messageKey`, not `key`, and that is not taste: `tools/locales.test.ts`
// recognises a key held in a field only when the field name ends in `Key`, so that a
// generic `key:` somewhere else cannot keep a dead message alive. Named `key`, this form
// made five live messages read as translated-and-never-shown.

/** What a journal row carries so its sentence can be rebuilt in any language. */
export interface Explained {
  readonly explainKey: string
  readonly explainArgs: readonly string[]
  /**
   * Parallel to `explainArgs`: a key where that position is a message, `null` where it
   * is data. Absent on rows written before this convention, which is why `explainArgs`
   * still holds the resolved word — an older row degrades to the language of its day
   * rather than to a bare identifier.
   */
  readonly explainArgKeys: readonly (string | null)[]
}

/**
 * Builds the pair, resolving message arguments once so the row is readable as-is.
 *
 * Both halves are written deliberately. The strings make the row legible to anything
 * that does not know this convention — an older build, `exportAll`'s dump, a person
 * reading the raw database. The keys make it re-resolvable, which is what the reader who
 * switched language needs.
 */
export function explained(explainKey: string, args: readonly ExplainArg[] = []): Explained {
  return {
    explainKey,
    explainArgs: args.map((arg) => (typeof arg === 'string' ? arg : t(arg.messageKey))),
    explainArgKeys: args.map((arg) => (typeof arg === 'string' ? null : arg.messageKey)),
  }
}

/**
 * The arguments as the reader should see them now, rather than as they were written.
 *
 * A position with a key is resolved again; a position without one is passed through. An
 * absent or short `explainArgKeys` is not an error — it is what every row written before
 * this convention looks like.
 */
export function resolveArgs(
  args: readonly string[],
  argKeys: readonly unknown[] = [],
): string[] {
  return args.map((arg, index) => {
    const key = argKeys[index]
    return typeof key === 'string' && key !== '' ? t(key) : arg
  })
}
