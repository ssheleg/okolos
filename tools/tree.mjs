/**
 * One definition of "the directories in here", shared by every gate that walks
 * the tree.
 *
 * `readdirSync(dir)` returns the *entries* of a directory, and the entries are
 * not the directories: macOS writes `.DS_Store` into any folder its Finder has
 * displayed, without being asked and without telling anyone. Three gates read a
 * directory and used each entry as a path segment, so all three were one Finder
 * visit away from a verdict about the file manager wearing the authority of a
 * verdict about the repository:
 *
 *   - `docs.test.ts` counted 20 packages and 3 apps against a document that
 *     correctly said 19 and 2 — red on the developer's machine, green on CI,
 *     where no Finder had ever run. It is the gate `.githooks/pre-push` leans
 *     on, so the only load-bearing gate this project has was refusing every
 *     push while printing the override flag in its own refusal text.
 *   - `locales.test.ts` failed five of its ten checks the moment `_locales`
 *     held one, in the gate that guards the message catalogue.
 *   - `licensing.test.ts` failed to load at all — the throw happens while the
 *     module initialises, so none of its checks run.
 *
 * The second and third were latent rather than absent, which is the worse
 * shape: they were passing because of where a person had happened to click.
 *
 * Two more gates read entries and are safe, for reasons worth naming so nobody
 * "fixes" them: `adr.test.ts` keeps only names matching `^\d{4}-`, and
 * `licensing.test.ts`'s manifest sweep drops paths that do not exist — the
 * second by accident, since that filter was put there for packages without a
 * `package.json`.
 */

import { readdirSync } from 'node:fs'

/** The directories directly inside `dir`, by name, sorted. */
export function directoriesIn(dir) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

/**
 * The files directly inside `dir` whose name ends with `suffix`, sorted.
 *
 * The suffix is required rather than optional: a caller that wants "the files"
 * without saying which is a caller that will accept `.DS_Store` as one.
 */
export function filesIn(dir, suffix) {
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(suffix))
    .map((entry) => entry.name)
    .sort()
}
