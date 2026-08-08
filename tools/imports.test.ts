/**
 * The import walker two gates share.
 *
 * It was one copy inside `reachable.test.ts` until a second gate needed the
 * same graph. The rules below are the ones that matter — get any of them wrong
 * and both gates go quiet rather than fail, because an edge the walker cannot
 * follow simply is not there.
 */

import path from 'node:path'
import { describe, expect, it } from 'vitest'

import {
  entryPoints,
  pageEntriesFromBuild,
  reachableFrom,
  resolve,
  root,
  specifiers,
  tsEntriesFromBuild,
  workerEntryFromWrangler,
} from './imports.mjs'

const content = path.join(root, 'apps/extension/src/content/index.ts')

describe('resolving one specifier', () => {
  it('maps a workspace package to the source its exports name', () => {
    expect(resolve('@okolos/i18n', content)).toBe(path.join(root, 'packages/i18n/src/index.ts'))
  })

  it('follows a .js specifier to the .ts file that is actually on disk', () => {
    // NodeNext makes TypeScript write `./pace.js` for a file called `pace.ts`.
    // A walker that took the extension literally would follow nothing.
    expect(resolve('./pace.js', content)).toBe(path.join(root, 'apps/extension/src/content/pace.ts'))
  })

  it('stops at anything outside this repository', () => {
    expect(resolve('node:fs', content)).toBeNull()
    expect(resolve('@okolos/not-a-package', content)).toBeNull()
  })
})

describe('reading one file', () => {
  it('sees static, dynamic and side-effect imports alike', () => {
    const seen = specifiers(content)
    expect(seen).toContain('@okolos/i18n')
    expect(seen.length).toBeGreaterThan(5)
  })
})

describe('walking from an entry', () => {
  it('reaches through a package index into the module behind it', () => {
    const graph = reachableFrom([content])
    expect(graph).toContain(path.join(root, 'packages/ui/src/banner/banner.ts'))
  })

  it('includes the entry itself, so a one-file entry is never empty', () => {
    expect(reachableFrom([content])).toContain(content)
  })
})

describe('the entry list', () => {
  it('comes from the build and wrangler, not from a list of its own', () => {
    // The obvious way to defeat a reachability gate is to declare the orphan an
    // entry point. These three sources are the ones that actually ship code.
    expect(tsEntriesFromBuild().length).toBeGreaterThanOrEqual(2)
    expect(pageEntriesFromBuild().length).toBeGreaterThanOrEqual(3)
    expect(workerEntryFromWrangler().length).toBe(1)
    expect(entryPoints().length).toBe(
      tsEntriesFromBuild().length + pageEntriesFromBuild().length + workerEntryFromWrangler().length,
    )
  })
})
