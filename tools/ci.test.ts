import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * What CI claims about itself.
 *
 * Two of these caught real drift. A step called "scenarios SCN-003 and
 * SCN-019" was running fifty-five specs, and a comment explaining that Firefox
 * was deliberately absent sat two jobs above the Firefox job. Both are the kind
 * of thing nobody re-reads, and both would mislead the next person to open the
 * file at the moment they most needed it to be true.
 */

const root = process.cwd()
const workflow = readFileSync(path.join(root, '.github/workflows/ci.yml'), 'utf8')
const scripts = (JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as {
  scripts: Record<string, string>
}).scripts

describe('the workflow runs what the project has', () => {
  it('runs the unit suite, the UX linter and both browser suites', () => {
    expect(workflow).toContain('pnpm test')
    expect(workflow).toContain('docs/ux/lint.py')
    expect(workflow).toContain('pnpm test:e2e')
    expect(workflow).toContain('tools/firefox-e2e.mjs')
  })

  it('does not pin a Playwright build number', () => {
    // A path carrying one turns an unrelated dependency bump into a red Firefox
    // job, which is the pressure that gets a browser dropped from CI.
    expect(workflow).not.toMatch(/firefox-\d{3,}/)
  })

  it('names no individual scenario in a step that runs all of them', () => {
    const stepNames = [...workflow.matchAll(/^\s*- name: (.+)$/gm)].map((m) => m[1] as string)
    for (const name of stepNames) {
      expect(name, `step "${name}" names a scenario`).not.toMatch(/SCN-\d+/)
    }
  })
})

describe('the local shortcut matches CI', () => {
  it('builds before running the gates that read the build', () => {
    // Without this `pnpm gates` runs the bundle scanners over whatever dist
    // happened to be lying around, which is the definition of a stale green.
    expect(scripts.gates).toContain('pnpm build')
    expect(scripts.gates.indexOf('pnpm build')).toBeLessThan(scripts.gates.indexOf('pnpm test'))
  })
})
