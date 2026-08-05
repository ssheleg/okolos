import { execFileSync } from 'node:child_process'
import { globSync, readFileSync } from 'node:fs'

import path from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'

/**
 * The gates that read what actually ships.
 *
 * ESLint checks the source, which is where a mistake is written — but it reads
 * only the files it is pointed at, and a rule can be silently overridden by a
 * later config block (that exact failure happened once already in this repo).
 * These tests read the built output instead. A promise about what the product
 * does at runtime should be checked against the artefact that runs.
 */

const root = process.cwd()

/** The one module allowed to perform network I/O. */
const TRANSPORT_SOURCE = 'packages/net/src/transport.ts'

const BROWSER_TOKENS = [
  'document.',
  'window.',
  'chrome.',
  'browser.',
  'localStorage',
  'indexedDB',
]
const NETWORK_TOKENS = ['fetch(', 'XMLHttpRequest', 'sendBeacon', 'new WebSocket']

let buildError: string | null = null

function build(): void {
  // tsc -b emits every package's dist; the extension bundles come from vite.
  try {
    execFileSync('pnpm', ['typecheck'], { cwd: root, stdio: 'pipe' })
    execFileSync('pnpm', ['build'], { cwd: root, stdio: 'pipe' })
  } catch (cause) {
    // Caught rather than thrown: a throw in beforeAll marks these tests
    // *skipped*, and a gate that reports "skipped" when the thing it guards is
    // broken is worse than no gate — it reads as absence of a problem. Found
    // by planting a defect that broke the build.
    buildError = cause instanceof Error ? cause.message : String(cause)
  }
}

function filesIn(pattern: string): string[] {
  return globSync(pattern, { cwd: root }).map((p) => path.join(root, p))
}

/**
 * Removes string, template and regex literals, and comments.
 *
 * A browser API cannot be *called* from inside a string, so a token found
 * there is a mention rather than a use — and one package's whole job is to
 * mention them: the extension analyser searches other people's code for
 * `document.cookie` and `localStorage.getItem`. Scanning the raw text made
 * that package unshippable and the only alternatives were exempting it (which
 * blinds the gate for everything in it) or splicing the strings so the scanner
 * cannot read them (which makes the source worse to satisfy a tool).
 *
 * Stripping literals is the third option, and it narrows nothing: every real
 * call still shows up, as the planted-defect check below asserts.
 */
function executable(source: string): string {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/\/\/[^\n]*/g, ' ')
    // Regex literals last, and before the string passes above would have eaten
    // their quotes: a pattern like /['"`]/ contains quote characters, and
    // stripping strings first turns the rest of the file into nonsense.
    .replace(/\/(?![*/])(?:[^/\\\n[]|\\.|\[(?:[^\]\\]|\\.)*\])+\/[gimsuy]*/g, '/re/')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/`(?:[^`\\]|\\.)*`/g, '``')
}

function offenders(files: string[], tokens: string[]): Array<{ file: string; token: string }> {
  const hits: Array<{ file: string; token: string }> = []
  for (const file of files) {
    const source = executable(readFileSync(file, 'utf8'))
    for (const token of tokens) {
      if (source.includes(token)) hits.push({ file: path.relative(root, file), token })
    }
  }
  return hits
}

beforeAll(() => {
  build()
}, 300_000)

describe('the artefact these gates read', () => {
  it('was actually built', () => {
    expect(buildError, 'the build failed, so nothing below was really checked').toBeNull()
  })
})

describe('REQ-01 — the detectors stay browser-free in the artefact, not just in the source', () => {
  it('ships no browser API inside any core-* bundle', () => {
    const built = filesIn('packages/core-*/dist/**/*.js')
    expect(built.length).toBeGreaterThan(0)
    expect(offenders(built, BROWSER_TOKENS)).toEqual([])
  })

  it('ships no network call inside any core-* bundle', () => {
    const built = filesIn('packages/core-*/dist/**/*.js')
    expect(offenders(built, NETWORK_TOKENS)).toEqual([])
  })
})

describe('REQ-08 — exactly one module may reach the network', () => {
  it('finds fetch in the transport source and nowhere else in the workspace', () => {
    const sources = [
      ...filesIn('packages/*/src/**/*.ts'),
      ...filesIn('apps/*/src/**/*.ts'),
    ].filter((f) => !f.endsWith('.test.ts'))

    const withFetch = offenders(sources, ['fetch(']).map((h) => h.file)
    expect(withFetch).toEqual([TRANSPORT_SOURCE])
  })

  it('leaves no stray network call in the shipped extension bundles', () => {
    // The extension may legitimately contain the transport, so an occurrence
    // is only acceptable when it arrived through it: any bundle carrying a
    // network token must also carry the audit-log write that precedes it.
    for (const file of filesIn('apps/extension/dist/*/*.js')) {
      const source = readFileSync(file, 'utf8')
      const reachesNetwork = NETWORK_TOKENS.some((t) => source.includes(t))
      if (!reachesNetwork) continue
      expect(source, `${path.relative(root, file)} sends without the audit log`).toContain(
        'outbound_log',
      )
    }
  })
})

describe('what the shipped extension is made of', () => {
  it('builds a self-contained content script — a split chunk would not load', () => {
    for (const browser of ['chrome', 'firefox']) {
      const content = readFileSync(
        path.join(root, `apps/extension/dist/${browser}/content.js`),
        'utf8',
      )
      expect(content).not.toMatch(/^\s*import\s/m)
      expect(content).not.toMatch(/from\s*["'][./]/)
    }
  })

  it('ships surfaces the page cannot reach into', () => {
    // REQ-35 added a build flag that opens the shadow root so end-to-end tests
    // can click the controls a user clicks. The production build must never
    // carry it: an open root would let a hostile page hide the warning about
    // itself, which is the property the whole surface rests on.
    for (const browser of ['chrome', 'firefox']) {
      const content = readFileSync(
        path.join(root, `apps/extension/dist/${browser}/content.js`),
        'utf8',
      )
      expect(content, `${browser} build must use a closed shadow root`).toContain('"closed"')
      expect(content, `${browser} build must not carry the test hook`).not.toContain('"open"')
    }
  })

  it('ships a manifest beside the code in both builds', () => {
    for (const browser of ['chrome', 'firefox']) {
      const manifest = JSON.parse(
        readFileSync(path.join(root, `apps/extension/dist/${browser}/manifest.json`), 'utf8'),
      ) as { manifest_version: number }
      expect(manifest.manifest_version).toBe(3)
    }
  })
})

describe('the scanner reads code, not prose', () => {
  it('loses a token that is only mentioned inside a string', () => {
    expect(executable('const PATTERN = /document\\.cookie/')).not.toContain('document.')
    expect(executable("const t = 'localStorage.getItem'")).not.toContain('localStorage')
  })

  it('keeps a token that is actually called', () => {
    // The point of stripping literals is to lose mentions, not uses. Without
    // this the previous test could be satisfied by stripping everything.
    expect(executable('const c = document.cookie')).toContain('document.')
    expect(executable('localStorage.setItem(k, v)')).toContain('localStorage')
    expect(executable('await fetch("https://x.test")')).toContain('fetch(')
  })

  it('is not fooled by a comment either way', () => {
    expect(executable('// never use document.cookie here')).not.toContain('document.')
  })
})
