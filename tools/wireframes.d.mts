/**
 * Types for the wireframe generator, which is plain ESM so it can run as a
 * script (`pnpm wireframes`) without a build step. The test imports it, and a
 * test that treats its exports as `any` is a test that cannot catch a rename.
 */
export interface ScreenSource {
  readonly title: string
  readonly source: string
}

export declare const SCREENS: Record<string, ScreenSource>
export declare function rolesOf(source: string): string[]
export declare function statesOf(id: string): Array<{ state: string; trigger: string }>
export declare function purposeOf(id: string): string
export declare function wireframe(id: string): string
export declare function writeAll(): number
