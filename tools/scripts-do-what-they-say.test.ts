import { readFileSync } from 'node:fs'
import path from 'node:path'

import { globSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

/**
 * A script that reports success without doing the thing.
 *
 * `apps/extension/package.json` declared `"build": "echo 'build lands with T10'"` —
 * a placeholder from a stage that closed long ago. The harm was not the placeholder,
 * it was the **exit code 0**: `pnpm --filter @okolos/extension build` succeeded having
 * built nothing, and anything relying on it — a check, another CI, a habit — read that
 * as a build. It was called with exactly that expectation during B-36.
 *
 * Measured for comparison, 2026-08-20: a *missing* script exits 1 with
 * `ERR_PNPM_RECURSIVE_RUN_NO_SCRIPT`. So absent is honest and lying is not, and this
 * refuses the lying kind.
 */

const root = path.resolve(import.meta.dirname, '..')

/** Every package.json in the workspace, root included, node_modules excluded. */
function manifests(): string[] {
  return globSync(['package.json', '*/*/package.json'], {
    cwd: root,
    exclude: (p) => p.includes('node_modules'),
  }).map((p) => path.join(root, p))
}

describe('every script does what its name says', () => {
  it('finds the manifests it claims to check', () => {
    // An empty sweep would pass forever. The workspace has a root manifest, two apps
    // and nineteen packages, so anything under a handful means the glob broke.
    expect(manifests().length).toBeGreaterThan(5)
  })

  it('has no script that only prints', () => {
    const lying: string[] = []
    for (const file of manifests()) {
      const scripts = (
        JSON.parse(readFileSync(file, 'utf8')) as { scripts?: Record<string, string> }
      ).scripts
      for (const [name, body] of Object.entries(scripts ?? {})) {
        // `echo` as part of a real command is fine; a body that is nothing else is a
        // success report with no work behind it.
        if (/^\s*echo\b/.test(body) && !/&&|\|\||;/.test(body)) {
          lying.push(`${path.relative(root, file)} → ${name}: ${body}`)
        }
      }
    }
    expect(lying, 'these exit 0 having done nothing; delete them or delegate').toEqual([])
  })

  it('keeps the compiler emit out of the directory that ships', () => {
    /**
     * `apps/extension/dist/` holds `chrome`, `firefox` and `release` — what a user
     * installs — and for months it also held `tsc`'s emit, mixed in beside them. That
     * is how `dist/content/*.js` came to be read as the shipped artefact during B-36
     * and reproduced a defect that was already fixed: the bundler reads `src/`, so the
     * emit is a by-product that lags until `pnpm typecheck` runs.
     */
    const config = JSON.parse(readFileSync(path.join(root, 'apps/extension/tsconfig.json'), 'utf8')) as {
      compilerOptions?: { outDir?: string }
    }
    const outDir = config.compilerOptions?.outDir
    expect(outDir, 'the extension declares no outDir').toBeDefined()
    expect(outDir).not.toBe('dist')
    expect(outDir?.startsWith('dist')).toBe(false)
  })

  it('keeps the compiler emit out of the linter as well', () => {
    /**
     * The other half of moving it, and the half I missed.
     *
     * `dist/` was in eslint's ignore list, so while the emit lived there it was
     * ignored by accident rather than on purpose. Moving it out put 391 `no-undef`
     * errors into the tree — compiler output is not source and was never meant to be
     * linted. The pre-push hook caught it, after a `pnpm lint` that had been green
     * against a tree where the directory did not yet exist.
     *
     * Read from the tsconfig rather than named here, so the two files cannot drift:
     * a future `outDir` that nobody adds to the ignore list fails right here.
     */
    const config = JSON.parse(
      readFileSync(path.join(root, 'apps/extension/tsconfig.json'), 'utf8'),
    ) as { compilerOptions?: { outDir?: string } }
    const outDir = (config.compilerOptions?.outDir ?? '').replace(/^\.\//, '')
    expect(outDir).not.toBe('')

    const eslintConfig = readFileSync(path.join(root, 'eslint.config.js'), 'utf8')
    expect(
      eslintConfig.includes(`**/${outDir}/**`) || eslintConfig.includes(`${outDir}/**`),
      `eslint does not ignore "${outDir}", so the compiler's own output is linted as source`,
    ).toBe(true)
  })

  it('ships from a directory the packaging and the upload agree on', () => {
    // If these two ever name different roots, the archive and the artefact stop being
    // the same thing — and the one nobody installs is the one that gets tested.
    const packaging = readFileSync(path.join(root, 'tools/package.mjs'), 'utf8')
    const workflow = readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8')
    expect(packaging).toContain("'apps/extension/dist'")
    expect(workflow).toContain('apps/extension/dist')
  })
})
