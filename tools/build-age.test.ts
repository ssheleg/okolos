import { mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { buildStamp, buildTooOld, isBuildInput, newestSource } from './build-age.mjs'

/**
 * The check that makes "I rebuilt" and "this spec's build is current" the same fact.
 *
 * They were two facts wearing one sentence: `e2e/hooks.ts` loads
 * `dist/chrome-e2e` and `e2e/fixtures.ts` loads `dist/chrome`, `pnpm build:e2e`
 * refreshes one of them, and a planted defect stayed green across three `scn-023`
 * checks on exactly that gap (B-42).
 */

const root = path.resolve(import.meta.dirname, '..')

/** A directory with one file, stamped at `at`. */
function builtAt(at: number): string {
  const dir = mkdtempSync(path.join(tmpdir(), 'okolos-build-'))
  const file = path.join(dir, 'background.js')
  writeFileSync(file, '// built')
  utimesSync(file, at / 1000, at / 1000)
  return dir
}

describe('reading the age of a build', () => {
  it('says nothing about a build newer than every source', () => {
    // Far in the future rather than "now": a source file written during this test
    // run must not be able to make a fresh build look stale.
    const dir = builtAt(Date.now() + 60 * 60_000)
    expect(buildTooOld(dir, 'pnpm build')).toBeNull()
  })

  it('names the file and the command when the tree moved on', () => {
    const dir = builtAt(Date.now() - 365 * 24 * 60 * 60_000)
    const answer = buildTooOld(dir, 'pnpm build:e2e')
    expect(answer).not.toBeNull()
    expect(answer).toContain('pnpm build:e2e')
    expect(answer).toMatch(/\.(ts|html|json)/)
    // The two directories are the whole defect, so the message names both.
    expect(answer).toContain('dist/chrome-e2e')
  })

  it('tells "never built" apart from "built the wrong one"', () => {
    /**
     * Different mistakes with different fixes, so different sentences. Collapsing
     * them into "the build is not usable" is how a reader rebuilds the directory
     * they already rebuilt.
     */
    const missing = buildTooOld(path.join(tmpdir(), 'okolos-absent-build'), 'pnpm build')
    expect(missing).toContain('no build in')
    const stale = buildTooOld(builtAt(Date.now() - 60 * 60_000), 'pnpm build')
    expect(stale).toContain('older than the tree')
    expect(stale).not.toContain('no build in')
  })

  it('reads an empty directory as no build, not as a fresh one', () => {
    // Standing instruction 3, in the place it would cost most: a build directory
    // that exists and holds nothing is the state a failed build leaves behind.
    const empty = mkdtempSync(path.join(tmpdir(), 'okolos-empty-'))
    expect(buildStamp(empty)).toBeNull()
    expect(buildTooOld(empty, 'pnpm build')).toContain('no build in')
  })

  it('ignores a nested node_modules inside a build directory', () => {
    // A dependency's mtime is not this build's mtime, and node_modules is the one
    // directory whose files are routinely newer than everything.
    const dir = builtAt(Date.now() - 60 * 60_000)
    const nested = path.join(dir, 'node_modules')
    mkdirSync(nested)
    const fresh = path.join(nested, 'index.js')
    writeFileSync(fresh, '// a dependency')
    utimesSync(fresh, Date.now() / 1000 + 3600, Date.now() / 1000 + 3600)
    expect(buildTooOld(dir, 'pnpm build')).toContain('older than the tree')
  })

  it('does not count a test file as something to rebuild for', () => {
    /**
     * A check that tells someone who edited a unit test to rebuild the extension is
     * wrong every time it fires, and a check that is wrong every time is a check
     * people learn to skip.
     *
     * Asserted against paths, not against `newestSource()`. The first version of
     * this test read the newest file in the tree and asserted it was not a
     * `.test.ts` — and removing the exclusion left it green, because at that moment
     * the newest file was a source anyway. The plant landing is the only reason this
     * paragraph exists.
     */
    expect(isBuildInput('apps/extension/src/background/index.ts')).toBe(true)
    expect(isBuildInput('packages/ui/src/popup/popup.ts')).toBe(true)
    expect(isBuildInput('apps/extension/manifest.chrome.json')).toBe(true)
    expect(isBuildInput('apps/extension/_locales/ru/messages.json')).toBe(true)

    expect(isBuildInput('packages/ui/src/popup/popup.test.ts')).toBe(false)
    expect(isBuildInput('apps/extension/src/background/index.test.ts')).toBe(false)
    expect(isBuildInput('apps/extension/dist/chrome/background.js')).toBe(false)
    expect(isBuildInput('packages/ui/node_modules/dep/index.ts')).toBe(false)
    // Neither read by the build nor written by it: docs and tools are not inputs.
    expect(isBuildInput('docs/privacy.md')).toBe(false)
    expect(isBuildInput('tools/build.mjs')).toBe(false)
  })

  it('looks at the sources the build actually reads', () => {
    // An empty extraction would make every build look fresh forever — the shape
    // this project has been bitten by often enough to check for it by name.
    const newest = newestSource()
    expect(newest?.at, 'no source files found at all').toBeGreaterThan(0)
    expect(newest?.file).toMatch(/^(apps\/extension|packages)\//)
  })

  it('is the same helper every harness uses', () => {
    // Three harnesses, one rule. Three copies of this rule would drift into the
    // exact shape the rule exists to catch.
    for (const harness of ['e2e/hooks.ts', 'e2e/fixtures.ts']) {
      const body = readFileSync(path.join(root, harness), 'utf8')
      expect(body, `${harness} does not check its build`).toContain('buildTooOld(BUILD')
      expect(body, `${harness} checks but does not refuse`).toMatch(/throw new Error/)
    }
    const firefox = readFileSync(path.join(root, 'tools/firefox-e2e.mjs'), 'utf8')
    expect(firefox, 'the Firefox harness does not check its builds').toContain('buildTooOld(')
    // Both of its builds: the shipped one it installs, and the open one. Asking
    // about one of two is how this defect looked closed while half of it stood.
    expect(firefox.match(/buildTooOld\(/g)?.length ?? 0).toBe(2)
  })

  it('refuses a Firefox open build that exists but is old', () => {
    /**
     * `pnpm test:e2e:firefox` runs `pnpm build` and nothing else, so
     * `dist/firefox-e2e` is whatever the last `pnpm build:e2e` left. The harness
     * asked `existsSync` — present, not current — and passed for months.
     */
    const old = builtAt(Date.now() - 24 * 60 * 60_000)
    expect(buildTooOld(old, 'pnpm build:e2e')).toContain('older than the tree')
  })
})
