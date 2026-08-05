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
    const report = analysePackage('\\x68\\x65\\x6c\\x6c\\x6f'.repeat(40))
    expect(report.findings.some((finding) => finding.kind === 'obfuscation')).toBe(true)
  })
})

describe('what it says about its own worth', () => {
  it('admits a minified file proves little either way', () => {
    const report = analysePackage(`const a=1;${'x'.repeat(600)}`)
    expect(report.minified).toBe(true)
    expect(report.note).toMatch(/proves little/i)
  })

  it('says findings are not proof of intent', () => {
    // eval appears in polyfills; a fetch to an API is what most extensions do.
    expect(analysePackage('eval(x)').note).toMatch(/no.*proof of intent/i)
  })

  it('finds nothing in an ordinary file, and says so calmly', () => {
    const report = analysePackage('export function add(a, b) { return a + b }')
    expect(report.findings).toEqual([])
    expect(report.endpoints).toEqual([])
  })

  it('keeps the evidence short enough to read', () => {
    const report = analysePackage(`importScripts("https://cdn.test/${'a'.repeat(500)}.js")`)
    for (const finding of report.findings) expect(finding.evidence.length).toBeLessThanOrEqual(120)
  })
})
