/**
 * Types for the tree walker, which is plain ESM so every gate can share one
 * definition of what counts as a directory here. A test that treats these as
 * `any` is a test that cannot catch a rename — the same reason
 * `imports.d.mts` exists.
 */

export declare function directoriesIn(dir: string): string[]
export declare function filesIn(dir: string, suffix: string): string[]
