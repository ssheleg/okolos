/**
 * Types for `i18n-pattern.mjs`, hand-written for the reason `build-age.d.mts` is: the
 * gates are TypeScript and the tools are plain modules, so a `.mjs` without a
 * declaration is `any` — and `any` is how a check starts agreeing with whatever it is
 * handed.
 */

/** One word, with an apostrophe only inside it and an optional glued interpolation. */
export const WORD: string
/** The same, starting lowercase: what a sentence's second and later words look like. */
export const LOWER: string
/** What may sit between the quote and the first word: interpolations, one bracket. */
export const LEAD: string
/** A quoted string holding three or more words. Carries `g`; rebuild before reuse. */
export const SENTENCE: RegExp
/** A `console.*` call, whose arguments are not a product surface. */
export const CONSOLE: RegExp
/** Values that look like prose and are not: paths, MIME types, URLs. */
export const NOISE: RegExp

/** Every user-facing sentence in one line of source, noise and console lines removed. */
export function sentencesIn(line: string): string[]

/** Is this line a comment, and therefore not shipped to anyone? */
export function isComment(line: string): boolean
