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

    // `page-watch` wraps the *page's* `fetch` from the MAIN world and calls it
    // through with the arguments it was handed. It initiates nothing, so it is
    // not egress this product is answerable for — but it is the one place other
    // than the transport that touches the API at all, so it is named here
    // rather than left to pass because it happens not to spell `fetch(`.
    // The rule below is what actually holds it to observing.
    const PAGE_WATCH = 'apps/extension/src/page-watch/index.ts'
    const withFetch = offenders(sources, ['fetch(', '.fetch =', 'XMLHttpRequest.prototype'])
      .map((h) => h.file)
      .filter((f) => f !== PAGE_WATCH)
    expect(withFetch).toEqual([TRANSPORT_SOURCE])

    // And it must still be there: an exemption for a file that no longer exists
    // silently becomes an exemption for nothing. `sources` holds absolute
    // paths, `offenders` reports repo-relative ones — compared like with like.
    expect(sources.map((f) => path.relative(root, f))).toContain(PAGE_WATCH)
  })

  it('leaves no stray network call in the shipped extension bundles', () => {
    // The extension may legitimately contain the transport, so an occurrence
    // is only acceptable when it arrived through it: any bundle carrying a
    // network token must also carry the audit-log write that precedes it.
    // The two directories the browsers actually load. `dist/` also holds tsc's
    // per-module output — `dist/page-watch/index.js` and its siblings — which
    // ships to nobody, and scanning it made this gate fire on a file that is
    // not part of any bundle.
    for (const file of [...filesIn('apps/extension/dist/chrome/*.js'), ...filesIn('apps/extension/dist/firefox/*.js')]) {
      const source = readFileSync(file, 'utf8')
      const reachesNetwork = NETWORK_TOKENS.some((t) => source.includes(t))
      if (!reachesNetwork) continue
      // One bundle is exempt, narrowly and by name: the MAIN-world watcher
      // wraps the page's own `fetch` and calls it through untouched. It has no
      // audit entry because it sends nothing of ours — the rule above proves
      // that from its source, and this line makes the exemption a decision
      // rather than a hole.
      if (path.basename(file) === 'page-watch.js') continue
      expect(source, `${path.relative(root, file)} sends without the audit log`).toContain(
        'outbound_log',
      )
    }
  })
})

describe('the page watcher observes and never sends', () => {
  /**
   * The one module outside the transport that touches `fetch`, and the reason
   * it is allowed to: it wraps what the page calls and hands the call straight
   * back. If it ever composed a request of its own, REQ-08's promise — one
   * module reaches the network — would be false, and the exemption above would
   * be covering it.
   */
  const source = readFileSync(path.join(root, 'apps/extension/src/page-watch/index.ts'), 'utf8')

  it('is there to be checked', () => {
    expect(source.length).toBeGreaterThan(500)
  })

  it('names no destination of its own', () => {
    // A URL literal here would mean it had somewhere to send something.
    expect(source).not.toMatch(/https?:\/\/[a-z]/i)
  })

  it('calls the original with the arguments it was given, and nothing else', () => {
    expect(source).toContain('originalFetch.apply(this as never, args)')
    // No `new Request(`, no second argument built here — the page's call goes
    // through as the page made it.
    expect(source).not.toContain('new Request(')
  })

  it('never awaits its own decision before calling through', () => {
    // `await` between reading the call and making it is how observing turns
    // into holding, which is the thing this module promises not to do.
    const body = source.slice(source.indexOf('export function watchPage'))
    expect(body).not.toContain('await ')
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
