import { readFileSync, existsSync, readdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * REQ-30 — the licence and the attributions this project owes.
 *
 * HIBP breach data is CC BY 4.0 and requires visible attribution wherever it
 * appears — which, now that the leak and password features ship, means on the
 * screens that show it and not only in a README. This file asserts both, and
 * the second assertion is the one that would actually be missed: a README line
 * survives every refactor, and a line of UI copy does not.
 */

const root = process.cwd()
const read = (p: string): string => readFileSync(path.join(root, p), 'utf8')

describe('licence', () => {
  it('ships the AGPL text, not just the name', () => {
    expect(existsSync(path.join(root, 'LICENSE'))).toBe(true)
    expect(read('LICENSE')).toContain('GNU AFFERO GENERAL PUBLIC LICENSE')
  })

  it('declares the same licence in the manifest of the workspace', () => {
    const pkg = JSON.parse(read('package.json')) as { license: string }
    expect(pkg.license).toBe('AGPL-3.0-only')
  })

  it('covers the worker too — a hosted fork must publish its source', () => {
    expect(read('README.md')).toMatch(/AGPL-3\.0[\s\S]{0,200}Worker/i)
  })
})

describe('attribution owed to data sources', () => {
  it('names Have I Been Pwned and its CC BY 4.0 terms', () => {
    const readme = read('README.md')
    expect(readme).toContain('Have I Been Pwned')
    expect(readme).toContain('CC BY 4.0')
  })

  it('puts the credit on the surface that shows the data, not only in the README', () => {
    const panel = read('packages/ui/src/leaks/leaks.ts')
    expect(panel).toContain('Have I Been Pwned')
    expect(panel).toContain('CC BY 4.0')
  })

  it('credits the range query on the banner it produces', () => {
    const content = read('apps/extension/src/content/index.ts')
    expect(content).toMatch(/Have I Been Pwned \(CC BY 4\.0\)/)
  })

  it('names the URL intelligence feeds it will consume', () => {
    const readme = read('README.md')
    for (const source of ['OpenPhish', 'PhishTank', 'URLhaus', 'Hudson Rock']) {
      expect(readme).toContain(source)
    }
  })
})

describe('the licences of what this project consumes', () => {
  /**
   * The gate above proves this project publishes its own terms. It says
   * nothing about what it links against — and AGPL-3.0 is the licence where
   * that gap matters most: one dependency under an incompatible licence makes
   * the combined work undistributable, and nothing in the build would say so.
   *
   * Scope is what ships. `devDependencies` stay out: they build the extension
   * and never enter it.
   */
  const COMPATIBLE = new Set([
    'MIT',
    'ISC',
    'BSD-2-Clause',
    'BSD-3-Clause',
    'Apache-2.0',
    '0BSD',
    'CC0-1.0',
    'Unlicense',
    'AGPL-3.0-only',
    'AGPL-3.0-or-later',
    'GPL-3.0-only',
    'GPL-3.0-or-later',
    'LGPL-3.0-only',
    'LGPL-3.0-or-later',
  ])

  /** Every non-workspace production dependency, with the manifest that asks for it. */
  const shipped = (): Array<{ name: string; from: string }> => {
    const manifests = [
      'package.json',
      ...readdirSync(path.join(root, 'packages')).map((d) => `packages/${d}/package.json`),
      ...readdirSync(path.join(root, 'apps')).map((d) => `apps/${d}/package.json`),
    ].filter((p) => existsSync(path.join(root, p)))

    return manifests.flatMap((from) => {
      const deps = (JSON.parse(read(from)) as { dependencies?: Record<string, string> })
        .dependencies
      return Object.entries(deps ?? {})
        .filter(([, range]) => !range.startsWith('workspace:'))
        .map(([name]) => ({ name, from }))
    })
  }

  it('reads at least one dependency, so an empty list cannot pass as a clean sweep', () => {
    expect(shipped().length).toBeGreaterThan(0)
  })

  it('every shipped dependency carries a licence compatible with AGPL-3.0', () => {
    for (const { name, from } of shipped()) {
      const manifest = createRequire(import.meta.url).resolve(`${name}/package.json`, {
        paths: [path.dirname(path.join(root, from))],
      })
      const { license } = JSON.parse(readFileSync(manifest, 'utf8')) as { license?: string }
      expect(license, `${name} (from ${from}) declares no licence at all`).toBeTruthy()
      expect(
        COMPATIBLE.has(license as string),
        `${name} (from ${from}) is ${license}, which is not on the AGPL-compatible list`,
      ).toBe(true)
    }
  })

  it('refuses model weights that ship without a recorded licence', () => {
    // The one licence question this project has left open (ledger #22) is which
    // classifier weights it may carry. Until it is answered the runtime points
    // at a placeholder URL; the moment a real weight file appears in the tree,
    // this turns red unless docs/licences.md records its terms.
    const weights = ['packages', 'apps']
      .flatMap((dir) => walk(path.join(root, dir)))
      .filter((file) => /\.(onnx|bin|safetensors|gguf)$/.test(file))
      .filter((file) => !file.includes('node_modules') && !file.includes('/dist/'))

    for (const file of weights) {
      const rel = path.relative(root, file)
      expect(
        existsSync(path.join(root, 'docs/licences.md')) &&
          read('docs/licences.md').includes(path.basename(file)),
        `${rel} ships without an entry in docs/licences.md naming its terms`,
      ).toBe(true)
    }
  })
})

/** Files under a directory, recursively — no dependency, and the tree is small. */
function walk(dir: string): string[] {
  if (!existsSync(dir)) return []
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name)
    if (entry.name === 'node_modules') return []
    return entry.isDirectory() ? walk(full) : [full]
  })
}

describe('the weights policy is written down and still true', () => {
  const doc = path.join(root, 'docs/licences.md')

  it('exists — the gate above points at it', () => {
    // The weights rule fails a build by naming this file. A rule that names a
    // document nobody wrote is a rule that reports a missing document instead
    // of a missing licence.
    expect(existsSync(doc)).toBe(true)
  })

  it('states the rule rather than a preference', () => {
    const text = read('docs/licences.md')
    expect(text).toMatch(/AGPL-3\.0/)
    expect(text).toContain('Apache-2.0')
    // The exclusion is the operative half: it is what a future contributor
    // would otherwise re-litigate.
    expect(text).toMatch(/Llama/)
  })

  it('carries the measurement it rests on, not a recollection of it', () => {
    // 738,563,308 bytes and an HTTP 401 are why the decision went this way.
    // Without them the document is an opinion.
    const text = read('docs/licences.md')
    expect(text).toContain('738 563 308')
    expect(text).toMatch(/401/)
  })

  it('agrees with the descriptor the code actually carries', () => {
    // The model descriptor and this document drifting apart is how a project
    // ends up shipping weights its own policy forbids.
    const runtime = read('packages/model/src/runtime.ts')
    expect(runtime).not.toContain('pending-licence-decision')
    expect(runtime).toMatch(/licences\.md/)
  })
})
