#!/usr/bin/env node
/**
 * Is the built extension the tree that is here, or one from before the edit?
 *
 * **Why this exists.** Two e2e harnesses load two different build directories —
 * `e2e/hooks.ts` takes `dist/chrome-e2e` (shadow roots open so a test can click
 * what a user clicks), `e2e/fixtures.ts` takes `dist/chrome` (production) — and
 * the specs are split roughly half and half. `pnpm build:e2e` refreshes only the
 * first. `pnpm test:e2e` runs both builds, so CI is right; the person running
 * `npx playwright test` after one build is the one who gets a green from an
 * artefact that is arbitrarily old.
 *
 * Measured, not imagined: in the B-42 iteration a planted defect ("the button
 * deletes on the first click") stayed green across three `scn-023` checks, because
 * those read `dist/chrome` and only `chrome-e2e` had been rebuilt. After both
 * builds the same plant reddened all three. That was the second stale-artefact
 * false conclusion in one session — the first being `tsc`'s emit in B-36 — and both
 * times the only thing that caught it was a habit.
 *
 * **A habit is not a mechanism.** So the harness asks, before it launches a
 * browser: is there a build here at all, and is anything the build reads newer
 * than it. The two failures have to stay distinguishable — "never built" and
 * "built the wrong one" are different mistakes with different fixes — so they are
 * reported as different sentences.
 */
import { readdirSync, statSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')

/**
 * What the build reads, per `tools/build.mjs`: the app's sources, the manifests
 * it copies verbatim, the locales it copies wholesale, and every workspace
 * package the entries import.
 *
 * Tests are not build inputs. Including them would tell someone who edited a unit
 * test to rebuild the extension — advice that is wrong every time, which is how a
 * check earns the reputation that gets it skipped.
 */
const SOURCE_DIRS = ['apps/extension/src', 'apps/extension/_locales', 'packages']
const SOURCE_FILE = /\.(ts|tsx|html|json|css)$/

/**
 * Two exclusions, and they are tested against two different strings on purpose.
 *
 * They were one pattern — `/\.test\.ts$|\/dist\/|\/node_modules\//` — matched against
 * the path with a `/` appended, which is what a directory pattern needs and what
 * kills an anchored one: `popup.test.ts/` does not end in `.test.ts`, so the test
 * exclusion never fired and every `.test.ts` counted as a build input. Found by a
 * plant that failed to land: removing the exclusion changed nothing, because it had
 * never been doing anything.
 */
const NOT_A_SOURCE_DIR = /\/(dist|node_modules)\//
const NOT_A_SOURCE_FILE = /\.test\.ts$/

/**
 * Would the build read this path?
 *
 * Exported so the rule can be checked against paths rather than against whichever
 * file happens to be newest in the tree right now. Written the other way first: a
 * test asserted that `newestSource()` is not a `.test.ts`, and removing the
 * exclusion left it green, because at that moment the newest file was not a test
 * anyway. An assertion that agrees with today's tree is an assertion about today's
 * tree.
 */
export function isBuildInput(file) {
  const normalised = file.replace(/\\/g, '/')
  if (!SOURCE_FILE.test(normalised)) return false
  if (NOT_A_SOURCE_FILE.test(normalised)) return false
  if (NOT_A_SOURCE_DIR.test(`/${normalised}/`)) return false
  if (/^apps\/extension\/manifest\.\w+\.json$/.test(normalised)) return true
  return SOURCE_DIRS.some((dir) => normalised.startsWith(`${dir}/`))
}

/** Every file under `dir` matching `pattern`, with its mtime. */
function walk(dir, pattern, skipDir, skipFile = null) {
  let entries
  try {
    entries = readdirSync(dir, { withFileTypes: true })
  } catch {
    return []
  }
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      // A directory pattern needs the trailing separator; a file pattern must not
      // see it. Sharing one string between them is what disabled the file rule.
      return skipDir.test(`${full}/`) ? [] : walk(full, pattern, skipDir, skipFile)
    }
    if (skipFile !== null && skipFile.test(full)) return []
    if (!pattern.test(entry.name)) return []
    try {
      return [{ file: path.relative(root, full), at: statSync(full).mtimeMs }]
    } catch {
      // Removed between the listing and the stat. Not newer than anything.
      return []
    }
  })
}

/** The most recently touched thing the build reads, or null if the tree is gone. */
export function newestSource() {
  const files = [
    ...SOURCE_DIRS.flatMap((dir) =>
      walk(path.join(root, dir), SOURCE_FILE, NOT_A_SOURCE_DIR, NOT_A_SOURCE_FILE),
    ),
    ...walk(path.join(root, 'apps/extension'), /^manifest\.\w+\.json$/, NOT_A_SOURCE_DIR),
  ]
  if (files.length === 0) return null
  return files.reduce((newest, file) => (file.at > newest.at ? file : newest))
}

/** When `dir` was last written, or null when there is no build there. */
export function buildStamp(dir) {
  const absolute = path.isAbsolute(dir) ? dir : path.join(root, dir)
  const files = walk(absolute, /\.(js|json|html|css|png)$/, /\/node_modules\//)
  if (files.length === 0) return null
  return files.reduce((newest, file) => Math.max(newest, file.at), 0)
}

/**
 * A sentence when the build cannot be trusted, `null` when it can.
 *
 * `howToBuild` is the command for *this* directory, because the whole defect is
 * that the two directories have two commands and one of them refreshes one.
 */
export function buildTooOld(dir, howToBuild) {
  // Named the way the reader will type it. An absolute path in the message is
  // technically the same fact and reads as noise around the one word that matters.
  const shown = path.isAbsolute(dir) ? path.relative(root, dir) : dir
  const built = buildStamp(dir)
  if (built === null) {
    return (
      `no build in ${shown} — run \`${howToBuild}\`.\n` +
      `  A spec against a missing build fails for the wrong reason, and a spec ` +
      `against\n  a build from before your edit passes for the wrong reason.`
    )
  }

  const newest = newestSource()
  if (newest === null) {
    // Nothing to compare against is not the same as nothing having changed.
    return `could not read the sources to compare ${shown} against — refusing to assume it is fresh.`
  }
  if (newest.at <= built) return null

  const minutes = Math.max(1, Math.round((newest.at - built) / 60_000))
  return (
    `${shown} is older than the tree it was built from: ${newest.file} changed ` +
    `${minutes} minute(s) after it.\n  Run \`${howToBuild}\`. This directory is one of two — ` +
    `\`pnpm build\` writes dist/chrome,\n  \`pnpm build:e2e\` writes dist/chrome-e2e, and the ` +
    `specs are split between them.`
  )
}
