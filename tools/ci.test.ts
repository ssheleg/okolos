import { execFileSync } from 'node:child_process'
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

/** Fails with the script's name rather than on `undefined` three lines later. */
function script(name: string): string {
  const value = scripts[name]
  if (value === undefined) throw new Error(`package.json has no "${name}" script`)
  return value
}

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
    expect(script('gates')).toContain('pnpm build')
    expect(script('gates').indexOf('pnpm build')).toBeLessThan(script('gates').indexOf('pnpm test'))
  })
})

describe('the repository tracks no test-run artefacts', () => {
  /**
   * Three Playwright failure artefacts — including a binary trace.zip of a
   * red run — were committed with an unrelated feature and sat in history for
   * days. They are not project state: they are the debris of one machine's
   * one bad run, and the knowledge-graph build was reading the error context
   * as if it were documentation.
   */
  const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' }).split('\n')

  it('reads the index, so an empty list cannot pass as a clean tree', () => {
    expect(tracked.length).toBeGreaterThan(50)
  })

  it('has no test-results or playwright-report file under version control', () => {
    const debris = tracked.filter((f) => /^(test-results|playwright-report)\//.test(f))
    expect(debris, `these are run artefacts, not source: ${debris.join(', ')}`).toEqual([])
  })

  it('ignores the directories they land in, so the next red run stays local', () => {
    const ignore = readFileSync(path.join(root, '.gitignore'), 'utf8')
    expect(ignore).toMatch(/^test-results\/$/m)
    expect(ignore).toMatch(/^playwright-report\/$/m)
  })
})
