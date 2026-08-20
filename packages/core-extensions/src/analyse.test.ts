import { describe, expect, it } from 'vitest'

import { analysePackage } from './analyse.js'

describe('what a package gives away in its text', () => {
  it('finds code fetched at runtime', () => {
    const report = analysePackage('importScripts("https://cdn.test/loader.js")')
    expect(report.findings.some((finding) => finding.kind === 'remote-code')).toBe(true)
  })

  it('finds a script element being built', () => {
    const report = analysePackage("const s = document.createElement('script'); s.src = url")
    expect(report.findings.some((finding) => finding.kind === 'remote-code')).toBe(true)
  })

  it('finds eval, and does not confuse it with a property called eval', () => {
    expect(analysePackage('eval(payload)').findings.some((f) => f.kind === 'dynamic-eval')).toBe(true)
    expect(analysePackage('config.eval(payload)').findings.some((f) => f.kind === 'dynamic-eval')).toBe(
      false,
    )
  })

  it('finds cookie and token access', () => {
    const report = analysePackage('const c = document.cookie')
    expect(report.findings.some((finding) => finding.kind === 'credential-access')).toBe(true)
  })

  it('lists the servers it talks to, by origin', () => {
    const report = analysePackage('fetch("https://collect.test/a?x=1"); fetch("https://collect.test/b")')
    expect(report.endpoints).toEqual(['https://collect.test'])
  })

  it('notices heavy hex escaping', () => {
    // Its own kind rather than `obfuscation`, which is where a decoder call lands: this
    // is a measurement of the whole file, not a quotation from a line of it, and the
    // two need different sentences on the screen.
    const report = analysePackage('\\x68\\x65\\x6c\\x6c\\x6f'.repeat(40))
    expect(report.findings.some((finding) => finding.kind === 'hex-density')).toBe(true)
  })
})

describe('what it says about its own worth', () => {
  /**
   * The caveat itself is asserted on the surface that writes it — see
   * `packages/ui/src/extensions/words.test.ts`. Here the fact it is keyed on: the two
   * sentences never varied on anything else, and a package with no catalogue had no
   * business composing either (B-75).
   */
  it('reports a minified file as minified, and says nothing in prose', () => {
    const report = analysePackage(`const a=1;${'x'.repeat(600)}`)
    expect(report.minified).toBe(true)
    expect(report).not.toHaveProperty('note')
  })

  it('reports an ordinary file as readable, which is what the caveat turns on', () => {
    // eval appears in polyfills; a fetch to an API is what most extensions do — and the
    // sentence saying so is the surface's, keyed on this boolean.
    expect(analysePackage('eval(x)').minified).toBe(false)
  })

  it('finds nothing in an ordinary file, and says so calmly', () => {
    const report = analysePackage('export function add(a, b) { return a + b }')
    expect(report.findings).toEqual([])
    expect(report.endpoints).toEqual([])
  })

  it('keeps the evidence short enough to read', () => {
    const report = analysePackage(`importScripts("https://cdn.test/${'a'.repeat(500)}.js")`)
    // Only the kinds that quote the file have an excerpt to keep short; hex density is
    // a measurement. Filtered rather than skipped inside the loop, so the assertion is
    // not standing behind a branch.
    const quoted = report.findings.filter((finding) => finding.kind !== 'hex-density')
    expect(quoted.length).toBeGreaterThan(0)
    for (const finding of quoted) expect(finding.evidence.length).toBeLessThanOrEqual(120)
  })

  it('reports hex density as a number, with no sentence around it', () => {
    // It used to arrive as `"N hex escapes per 100 characters"` — English prose from a
    // package with no catalogue, and the one finding here that is a measurement rather
    // than a quotation from the file.
    const report = analysePackage('\\x41\\x42\\x43\\x44\\x45')
    const dense = report.findings.filter((finding) => finding.kind === 'hex-density')
    // One row, and its shape asserted whole: a narrowing `if` around the number would
    // skip in silence if the kind ever stopped arriving, and the test would still pass.
    expect(dense).toHaveLength(1)
    // Five escapes in twenty characters is twenty-five per hundred. The threshold's own
    // division floors the denominator at one and would have called it five — true of
    // nothing, and false in the exact words the screen puts around it.
    expect(dense[0]).toMatchObject({ per100: 25, where: 'the package' })
    expect(dense[0]).not.toHaveProperty('evidence')
  })
})

describe('the powers a package can hold over the browser', () => {
  /**
   * The analyser read five things: remote code, `eval`, hex escapes, endpoints,
   * and reads of cookies or tokens. Measured 2026-08-08, it did not read the
   * ones that matter most in an extension — the APIs that let it drive the
   * browser, leave the sandbox, or rewrite traffic. Those are not obfuscation
   * and not exfiltration; they are permissions in code, and a person deciding
   * whether to keep an extension should see them named.
   *
   * `chrome.debugger` heads the list for a reason: an extension holding it
   * drives Chrome through the devtools protocol, which is exactly the
   * automation the action gate stopped treating as a person in an earlier
   * change.
   */
  const kinds = (source: string) => analysePackage(source).findings.map((f) => f.kind)

  it('names an extension that can drive the browser through the devtools protocol', () => {
    expect(kinds('chrome.debugger.attach({tabId: id}, "1.3")')).toContain('browser-control')
  })

  it('names a native host, which is code outside the browser entirely', () => {
    expect(kinds('const port = chrome.runtime.connectNative("com.example.helper")')).toContain(
      'browser-control',
    )
  })

  it('names traffic rewriting, which a page cannot see happening to it', () => {
    expect(kinds('chrome.declarativeNetRequest.updateDynamicRules({addRules: r})')).toContain(
      'browser-control',
    )
    expect(kinds('chrome.proxy.settings.set({value: cfg})')).toContain('browser-control')
  })

  it('names bulk reads of what a person did, not only of their tokens', () => {
    for (const call of [
      'chrome.history.search({text: ""})',
      'chrome.bookmarks.getTree()',
      'chrome.identity.getAuthToken({interactive: false})',
      'chrome.topSites.get()',
    ]) {
      expect(kinds(call), call).toContain('credential-access')
    }
  })

  it('sees a socket as an endpoint, because that is where data leaves', () => {
    // `wss://` matched nothing, so an exfiltration channel was absent from the
    // endpoints list the report is built around.
    const report = analysePackage('new WebSocket("wss://collect.example.test/s")')
    expect(report.endpoints).toContain('wss://collect.example.test')
  })

  it('reads the decoders that hide a string from a reader', () => {
    // Hex escapes were counted; base64 and char codes were not, and they are
    // what a loader actually uses to keep its URL out of a search.
    expect(kinds('const u = atob("aHR0cHM6Ly9ldmlsLnRlc3Q=")')).toContain('obfuscation')
    expect(kinds('String.fromCharCode(104,116,116,112)')).toContain('obfuscation')
  })

  it('stays quiet on an ordinary extension', () => {
    // Every addition above costs a line in someone's report. A plain package
    // that reads a setting and draws a badge must produce none of them.
    const plain = `
      chrome.storage.sync.get(['theme'], (v) => {
        chrome.action.setBadgeText({ text: v.theme ?? '' })
      })
    `
    expect(kinds(plain)).toEqual([])
  })
})
