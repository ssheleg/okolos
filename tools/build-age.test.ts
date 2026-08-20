import { mkdirSync, mkdtempSync, readFileSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import {
  artefactStaleness,
  buildStamp,
  buildTooOld,
  filesUnderWithTime,
  isBuildInput,
  newestSource,
} from './build-age.mjs'

/**
 * The check that makes "I rebuilt" and "this spec's build is current" the same fact.
 *
 * They were two facts wearing one sentence: `e2e/hooks.ts` loads
 * `dist/chrome-e2e` and `e2e/fixtures.ts` loads `dist/chrome`, `pnpm build:e2e`
 * refreshes one of them, and a planted defect stayed green across three `scn-023`
 * checks on exactly that gap (B-42).
 */

const root = path.resolve(import.meta.dirname, '..')

/** One file stamped at `at`, for the artefact-level question. */
function builtFile(at: number): string {
  const file = path.join(mkdtempSync(path.join(tmpdir(), 'okolos-artefact-')), 'graph.json')
  writeFileSync(file, '{}')
  utimesSync(file, at / 1000, at / 1000)
  return file
}

/** A directory with one file, stamped at `at`. */
/**
 * A build older than every source, whatever the clock says.
 *
 * `Date.now() - 60 * 60_000` was the value in two places, and it made those checks depend
 * on **when the suite runs**: they assert that a build is stale, which is only true if some
 * product source was touched within the last hour. Spend an hour on documentation and the
 * newest source becomes older than the fake build, `buildTooOld` correctly answers `null`,
 * and two checks fail for a reason that has nothing to do with what they test. Measured
 * 2026-08-20, on exactly that hour.
 *
 * The mirror of the comment three lines below the sibling case: "far in the future rather
 * than now" is already how the fresh direction avoids the same trap. This is its opposite.
 */
const LONG_AGO = Date.parse('2020-01-01T00:00:00.000Z')

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
    const dir = builtAt(LONG_AGO)
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
    const stale = buildTooOld(builtAt(LONG_AGO), 'pnpm build')
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
    const dir = builtAt(LONG_AGO)
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
    // `LONG_AGO`, not a day ago: the same trap with a wider margin, and the comment
    // further down this file already counts three of these today.
    const old = builtAt(LONG_AGO)
    expect(buildTooOld(old, 'pnpm build:e2e')).toContain('older than the tree')
  })
})

describe('the age of an artefact against the tree it came from', () => {
  it('answers "could not tell" rather than "current" when the tree is unreadable', () => {
    /**
     * The third state, and the reason `dirs` is a parameter at all.
     *
     * A caller that folds "could not tell" into "current" reports an artefact of
     * unknown age as fresh — which is how a twelve-day-old code graph was read as the
     * tree that was there. The branch is also load-bearing against a crash: without
     * it the caller reads `.newest.file` off `null`. A plant against it could not land
     * while the roots were a constant, because no input reached it — an unverifiable
     * guard, which this project treats as the same problem as a missing one.
     */
    const answer = artefactStaleness(path.join(root, 'package.json'), [])
    expect(answer.known).toBe(false)
    expect(answer).toHaveProperty('reason')
    expect('stale' in answer, 'an unknown age must not carry a verdict').toBe(false)
  })

  it('answers "could not tell" for an artefact that is not there', () => {
    const answer = artefactStaleness(path.join(tmpdir(), 'okolos-no-such-artefact'), ['packages'])
    expect(answer.known).toBe(false)
  })

  it('calls an artefact newer than its tree fresh, and an older one stale', () => {
    /**
     * Both sides stamped, neither read from the repository.
     *
     * The first version pointed `dirs` at `packages` and asserted an
     * hour-old artefact was stale — which is true only if something under
     * `packages` was touched within the hour. It passed in isolation and failed in
     * the full suite forty minutes later. That is the third time today a test turned
     * out to be about the state of the tree rather than about the rule, so this one
     * owns both of its timestamps.
     */
    const tree = mkdtempSync(path.join(tmpdir(), 'okolos-tree-'))
    const source = path.join(tree, 'thing.ts')
    writeFileSync(source, 'export const x = 1')
    const sourceAt = Date.now() - 2 * 60 * 60_000
    utimesSync(source, sourceAt / 1000, sourceAt / 1000)

    expect(artefactStaleness(builtFile(sourceAt + 60_000), [tree])).toMatchObject({
      known: true,
      stale: false,
    })
    expect(artefactStaleness(builtFile(sourceAt - 60_000), [tree])).toMatchObject({
      known: true,
      stale: true,
    })
  })
})

describe('the directories that are never a source', () => {
  it('skips every name in the list, not only the ones a second copy remembered', () => {
    /**
     * The trap this replaced. `NOT_A_SOURCE_DIR` looked like the source of truth and the
     * walk filtered a *hardcoded* candidate list through it — `['node_modules', 'dist']`
     * — so adding `.tsc` to the pattern changed nothing: a name absent from the array
     * could never be skipped however the pattern read. 148 files of `tsc` output were
     * reported as uncovered sources by the code-graph check, burying nine real documents
     * in the same list.
     *
     * Asserted against the real tree, because that is where the emit is: `.tsc` holds
     * declarations written by `pnpm typecheck` and is git-ignored.
     */
    const walked = filesUnderWithTime(['apps'], /\.(ts|mts)$/).map((f) => f.file)
    expect(walked.length).toBeGreaterThan(0)
    for (const name of ['node_modules', 'dist', '.tsc']) {
      expect(
        walked.filter((file) => file.includes(`/${name}/`)),
        `${name} was walked as a source`,
      ).toEqual([])
    }
  })

  it('is one list, so the pattern and the walk cannot disagree', () => {
    // The structural half: the regex is built from the array. A hand-written pattern
    // beside a hand-written list is the same rule twice, agreeing until it does not.
    const source = readFileSync(path.join(root, 'tools/build-age.mjs'), 'utf8')
    expect(source).toContain('const GENERATED_DIRS = [')
    expect(source).toContain('GENERATED_DIRS.map(')
    expect(source).toContain('GENERATED_DIRS.filter(')
  })
})
