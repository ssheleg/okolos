/**
 * Types for `build-age.mjs`, hand-written for the reason `feed-age.d.mts` is: the
 * gates and the e2e harnesses are TypeScript and the tools are plain modules, so a
 * `.mjs` without a declaration is `any` — and `any` is how a check starts agreeing
 * with whatever it is handed.
 */

/** A file the build reads, with the moment it was last written. */
export interface SourceFile {
  readonly file: string
  readonly at: number
}

/** Would the build read this path? The rule, checkable without the filesystem. */
export function isBuildInput(file: string): boolean

/** The most recently touched build input, or null when the tree cannot be read. */
export function newestSource(): SourceFile | null

/** When a build directory was last written, or null when there is no build there. */
export function buildStamp(dir: string): number | null

/** A sentence when a build cannot be trusted, `null` when it can. */
export function buildTooOld(dir: string, howToBuild: string): string | null
