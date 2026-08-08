/**
 * Every source file must be reachable from something that ships.
 *
 * Three times in this codebase a requirement was closed on a module nothing
 * called. `analysePackage` had tests and no caller. `renderStatus` had tests, a
 * screen record, and no page that loaded it. `updateFeed` had tests, two
 * requirements, and no install that ever fetched a feed — so the extension
 * blocked nothing. In all three the unit tests were green, because a module's
 * tests answer "does it work", never "does anything run it".
 *
 * This gate answers the second question. It walks the import graph from the
 * entry points the build actually names, and requires every non-test source
 * file to be inside it.
 *
 * The obvious way to defeat a reachability gate is to declare the orphan an
 * entry point. So the entry list is not taken on trust: each entry must be
 * named by `tools/build.mjs`, by an HTML page that build loads, or by
 * `wrangler.toml`. An entry nobody ships is not an entry.
 *
 * What this gate does NOT catch: a symbol exported from a reachable file that
 * no reachable code uses. File-level reachability is the coarse half of the
 * question; it is the half that produced all three defects above.
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const app = path.join(root, 'apps/extension')
const rel = (p: string) => path.relative(root, p)

/**
 * Files with no importer, each with the reason nothing imports them. A reason
 * is not a formality: it is the sentence someone writes instead of noticing
 * their feature never shipped.
 */
const EXEMPT: ReadonlyArray<{ readonly file: string; readonly why: string }> = [
  {
    file: 'packages/ui/src/tokens.ts',
    why: 'the source for a generated stylesheet, consumed by parsing rather than by import: tools/tokens.mjs reads it and writes apps/extension/src/tokens.generated.css, which every page imports. Its own test asserts the generated file matches and that no stylesheet writes a value beside it.',
  },
]

// ---------------------------------------------------------------------------
// Entry points, and the evidence that each one ships.
// ---------------------------------------------------------------------------

function buildScript(): string {
  return readFileSync(path.join(root, 'tools/build.mjs'), 'utf8')
}

/** Rollup inputs named in build.mjs — `path.join(app, 'src/…/index.ts')`. */
function tsEntriesFromBuild(): string[] {
  const found = [...buildScript().matchAll(/path\.join\(app,\s*'([^']+\.ts)'\)/g)]
  return found.map((m) => path.join(app, m[1] ?? ''))
}

/** HTML pages named in build.mjs, and the module each one loads. */
function pageEntriesFromBuild(): string[] {
  const pages = [...buildScript().matchAll(/path\.join\(app,\s*'([^']+\.html)'\)/g)]
  const out: string[] = []
  for (const [, p] of pages) {
    const html = path.join(app, p ?? '')
    if (!existsSync(html)) continue
    const markup = readFileSync(html, 'utf8')
    for (const [, src] of markup.matchAll(/<script[^>]*\bsrc=["']([^"']+)["']/g)) {
      if (src === undefined) continue
      const resolved = resolve(src.startsWith('.') ? src : `./${src.replace(/^\//, '')}`, html)
      if (resolved) out.push(resolved)
    }
  }
  return out
}

/** The worker entry, as wrangler will load it. */
function workerEntryFromWrangler(): string[] {
  const toml = readFileSync(path.join(root, 'apps/proxy/wrangler.toml'), 'utf8')
  const main = /^\s*main\s*=\s*"([^"]+)"/m.exec(toml)
  return main?.[1] !== undefined ? [path.join(root, 'apps/proxy', main[1])] : []
}

function entryPoints(): string[] {
  return [...tsEntriesFromBuild(), ...pageEntriesFromBuild(), ...workerEntryFromWrangler()]
}

// ---------------------------------------------------------------------------
// Import graph.
// ---------------------------------------------------------------------------

/**
 * Resolve one specifier. Two forms matter here: workspace packages
 * (`@okolos/x` → `packages/x/src/index.ts`, matching each package's `exports`)
 * and relative paths written with the `.js` extension TypeScript's NodeNext
 * resolution requires — those name a `.ts` file on disk.
 */
function resolve(spec: string, from: string): string | null {
  if (spec.startsWith('@okolos/')) {
    const index = path.join(root, 'packages', spec.slice('@okolos/'.length), 'src/index.ts')
    return existsSync(index) ? index : null
  }
  if (!spec.startsWith('.')) return null // npm or platform dependency

  const raw = path.resolve(path.dirname(from), spec)
  const base = raw.endsWith('.js') ? raw.slice(0, -3) : raw
  for (const candidate of [`${base}.ts`, `${base}.tsx`, raw, path.join(base, 'index.ts')]) {
    if (existsSync(candidate) && statSync(candidate).isFile()) return candidate
  }
  return null
}

/** Every specifier a file imports, static and dynamic, values and types. */
function specifiers(file: string): string[] {
  const src = readFileSync(file, 'utf8')
  const out: string[] = []
  for (const [, s] of src.matchAll(/from\s*['"]([^'"]+)['"]/g)) if (s !== undefined) out.push(s)
  for (const [, s] of src.matchAll(/import\(\s*['"]([^'"]+)['"]\s*\)/g)) if (s !== undefined) out.push(s)
  for (const [, s] of src.matchAll(/(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g)) if (s !== undefined) out.push(s)
  return out
}

function reachableFrom(entries: readonly string[]): Set<string> {
  const seen = new Set<string>()
  const stack = [...entries]
  while (stack.length > 0) {
    const file = stack.pop()
    if (file === undefined || seen.has(file) || !existsSync(file)) continue
    seen.add(file)
    for (const spec of specifiers(file)) {
      const target = resolve(spec, file)
      if (target !== null && !seen.has(target)) stack.push(target)
    }
  }
  return seen
}

function sourceFiles(): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        if (entry.name !== 'node_modules' && entry.name !== 'dist') walk(p)
      } else if (
        entry.name.endsWith('.ts') &&
        !entry.name.endsWith('.test.ts') &&
        !entry.name.endsWith('.d.ts')
      ) {
        out.push(p)
      }
    }
  }
  walk(path.join(root, 'packages'))
  walk(path.join(root, 'apps'))
  return out
}

// ---------------------------------------------------------------------------

describe('every source file is reachable from something that ships', () => {
  it('finds entry points in the build, not in a list of its own', () => {
    // If this drops to nothing the gate below passes vacuously — every file
    // would be unreachable, the assertion would be one huge failure, and the
    // temptation would be to weaken it rather than read it.
    expect(tsEntriesFromBuild().length).toBeGreaterThanOrEqual(2)
    expect(pageEntriesFromBuild().length).toBeGreaterThanOrEqual(3)
    expect(workerEntryFromWrangler().length).toBe(1)
  })

  it('names only entry points the build or wrangler actually loads', () => {
    for (const entry of entryPoints()) {
      expect(existsSync(entry), `entry point does not exist: ${rel(entry)}`).toBe(true)
    }
  })

  it('leaves no source file that nothing imports', () => {
    const reachable = reachableFrom(entryPoints())
    const exempt = new Set(EXEMPT.map((e) => path.join(root, e.file)))
    const orphans = sourceFiles()
      .filter((f) => !reachable.has(f) && !exempt.has(f))
      .map(rel)
      .sort()

    expect(
      orphans,
      orphans.length === 0
        ? ''
        : `unreachable from every entry point — nothing that ships imports these:\n  ${orphans.join('\n  ')}\n` +
          `A module no entry point reaches cannot close a requirement, however green its own tests are. ` +
          `Wire it to a caller, delete it, or add it to EXEMPT with the reason nothing imports it.`,
    ).toEqual([])
  })

  it('requires an exemption to name a real file and give a real reason', () => {
    for (const { file, why } of EXEMPT) {
      expect(existsSync(path.join(root, file)), `exempt file does not exist: ${file}`).toBe(true)
      expect(why.length, `exemption for ${file} needs a reason, not a word`).toBeGreaterThan(40)
    }
  })
})
