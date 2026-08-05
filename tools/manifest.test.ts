import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

/**
 * The manifests are the security surface a store reviewer and a user actually
 * read. A permission that appears without anyone noticing is the failure this
 * file exists to prevent, so the allowed list is written here too and the two
 * have to agree.
 */

const app = path.join(process.cwd(), 'apps/extension')

function manifest(browser: 'chrome' | 'firefox'): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(app, `manifest.${browser}.json`), 'utf8')) as Record<
    string,
    unknown
  >
}

/** Everything the skeleton needs, and nothing that anticipates a later module. */
const ALLOWED_PERMISSIONS = ['storage', 'alarms', 'activeTab']

describe('what the extension asks for', () => {
  for (const browser of ['chrome', 'firefox'] as const) {
    it(`${browser}: requests only the permissions the skeleton needs`, () => {
      expect(manifest(browser).permissions).toEqual(ALLOWED_PERMISSIONS)
    })

    it(`${browser}: asks for no host permissions yet`, () => {
      // Broad host access arrives with the feature that needs it, explained in
      // the store listing — not quietly, ahead of time.
      expect(manifest(browser).host_permissions).toBeUndefined()
    })

    it(`${browser}: is manifest v3`, () => {
      expect(manifest(browser).manifest_version).toBe(3)
    })
  }

  it('keeps both browsers on the same version', () => {
    expect(manifest('chrome').version).toBe(manifest('firefox').version)
  })

  it('runs the content script in every frame — injections hide in iframes too', () => {
    for (const browser of ['chrome', 'firefox'] as const) {
      const scripts = manifest(browser).content_scripts as Array<{ all_frames: boolean }>
      expect(scripts[0]?.all_frames).toBe(true)
    }
  })

  it('uses the background form each browser actually supports', () => {
    const chrome = manifest('chrome').background as Record<string, unknown>
    const firefox = manifest('firefox').background as Record<string, unknown>
    expect(chrome.service_worker).toBe('background.js')
    expect(firefox.scripts).toEqual(['background.js'])
  })

  it('pins a Firefox extension id, so updates cannot be hijacked by a rebuild', () => {
    const settings = manifest('firefox').browser_specific_settings as {
      gecko: { id: string }
    }
    expect(settings.gecko.id).toMatch(/@/)
  })
})
