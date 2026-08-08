/**
 * Reading what a package actually does.
 *
 * Static, textual, and deliberately modest about it. Everything here can be
 * evaded by an author who wants to, and the report says which findings are
 * facts (this string is present) rather than judgements (this code is
 * malicious). What it is good for is the case that matters in practice: an
 * extension that was fine and now ships a loader fetching code from a server.
 *
 * A finding is never a verdict on its own. `eval` appears in polyfills;
 * minified code looks obfuscated; a fetch to an API is what most extensions do.
 * The report counts what it saw and leaves the judgement to a person, with the
 * evidence beside it.
 */

export interface PackageFinding {
  readonly kind:
    | 'remote-code'
    | 'dynamic-eval'
    | 'obfuscation'
    | 'endpoint'
    | 'credential-access'
    /** A power over the browser itself: driving it, leaving it, rewriting its traffic. */
    | 'browser-control'
  /** Verbatim excerpt, short enough to read. */
  readonly evidence: string
  readonly where: string
}

export interface PackageReport {
  readonly findings: readonly PackageFinding[]
  readonly endpoints: readonly string[]
  /** True when the file is minified enough that reading it proves little. */
  readonly minified: boolean
  readonly note: string
}

const REMOTE_CODE =
  /(importScripts\s*\(|document\.createElement\(['"`]script['"`]\)|new\s+Function\s*\(|chrome\.scripting\.executeScript\s*\(\s*\{[^}]*files)/g
const EVAL = /(^|[^.\w])eval\s*\(/g
const HEX_STRINGS = /\\x[0-9a-f]{2}/gi

/**
 * Where data can leave. `wss:` belongs here as much as `https:` — a socket was
 * invisible to this report until 2026-08-08, which made an exfiltration channel
 * the one kind of endpoint the endpoints list did not contain.
 */
const ENDPOINT = /(?:https?|wss?):\/\/[a-z0-9.-]+(?::\d+)?(?:\/[^\s"'`]*)?/gi

const CREDENTIALS =
  /(document\.cookie|localStorage\.getItem\s*\(\s*['"`][^'"`]*(token|auth|session)|chrome\.cookies\.getAll|chrome\.identity\.getAuthToken|chrome\.history\.\w+|chrome\.bookmarks\.\w+|chrome\.topSites\.\w+)/gi

/**
 * Powers, not behaviours.
 *
 * `chrome.debugger` heads the list because an extension holding it drives the
 * browser through the devtools protocol — the same automation the action gate
 * stopped accepting as a person. `connectNative` runs code outside the browser
 * altogether. The rest rewrite traffic, which the page it happens to cannot
 * see.
 *
 * Like everything here these are facts about the text, not verdicts: an
 * extension can hold any of them for good reasons, and the report says so.
 */
const BROWSER_CONTROL =
  /(chrome\.debugger\.\w+|chrome\.runtime\.connectNative|chrome\.declarativeNetRequest\.\w*[Rr]ules|chrome\.proxy\.\w+|chrome\.webRequest\.onBeforeRequest)/gi

/** Decoders that keep a string out of a search. Hex escapes were counted; these were not. */
const DECODERS = /(\batob\s*\(|String\.fromCharCode\s*\(|\bunescape\s*\()/gi

export function analysePackage(source: string, where = 'the package'): PackageReport {
  const findings: PackageFinding[] = []
  const add = (kind: PackageFinding['kind'], evidence: string) => {
    findings.push({ kind, evidence: evidence.slice(0, 120), where })
  }

  for (const match of source.matchAll(REMOTE_CODE)) add('remote-code', match[0])
  for (const match of source.matchAll(EVAL)) add('dynamic-eval', match[0].trim())
  for (const match of source.matchAll(CREDENTIALS)) add('credential-access', match[0])
  for (const match of source.matchAll(BROWSER_CONTROL)) add('browser-control', match[0])
  for (const match of source.matchAll(DECODERS)) add('obfuscation', match[0].trim())

  const endpoints = [...new Set([...source.matchAll(ENDPOINT)].map((match) => origin(match[0])))]
    .filter((entry): entry is string => entry !== null)
    .sort()
  for (const endpoint of endpoints) add('endpoint', endpoint)

  const hexRatio = (source.match(HEX_STRINGS)?.length ?? 0) / Math.max(1, source.length / 100)
  const longestLine = source.split('\n').reduce((max, line) => Math.max(max, line.length), 0)
  const minified = longestLine > 500

  if (hexRatio > 1) add('obfuscation', `${Math.round(hexRatio)} hex escapes per 100 characters`)

  return {
    findings,
    endpoints,
    minified,
    note: minified
      ? 'This file is minified, so reading it proves little either way. What is listed is what was visible.'
      : 'What is listed is what was found in the text. None of it is proof of intent.',
  }
}

function origin(url: string): string | null {
  try {
    return new URL(url).origin
  } catch {
    return null
  }
}
