import { readFileSync, existsSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * REQ-30 — the licence and the attributions this project owes.
 *
 * HIBP breach data is CC BY 4.0 and requires visible attribution wherever it
 * appears. No feature uses it yet, so what is checked now is that the promise
 * is recorded where a contributor will see it; the UI assertion arrives with
 * the leak features in R4, and this test grows then.
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

  it('names the URL intelligence feeds it will consume', () => {
    const readme = read('README.md')
    for (const source of ['OpenPhish', 'PhishTank', 'URLhaus', 'Hudson Rock']) {
      expect(readme).toContain(source)
    }
  })
})
