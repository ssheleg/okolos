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

/**
 * Everything the product needs today, and nothing that anticipates a later
 * module. `offscreen` is Chrome-only and arrives with the classifier host: a
 * service worker has no DOM, so there is nowhere else a model could run.
 */
const ALLOWED_PERMISSIONS = [
  'storage',
  'alarms',
  'activeTab',
  // Both arrive with the phishing block: stopping a page after it has rendered
  // means its scripts have already run.
  'declarativeNetRequest',
  'webNavigation',
]
const CHROME_ONLY_PERMISSIONS = ['offscreen']

describe('what the extension asks for', () => {
  for (const browser of ['chrome', 'firefox'] as const) {
    it(`${browser}: requests only the permissions the skeleton needs`, () => {
      const expected =
        browser === 'chrome'
          ? ['storage', 'alarms', 'activeTab', ...CHROME_ONLY_PERMISSIONS, 'declarativeNetRequest', 'webNavigation']
          : ['storage', 'alarms', 'activeTab', 'declarativeNetRequest', 'webNavigation']
      expect(manifest(browser).permissions).toEqual(expected)
      expect(ALLOWED_PERMISSIONS.every((p) => expected.includes(p))).toBe(true)
    })

    it(`${browser}: asks for host access only to the web, and only http(s)`, () => {
      // Broad host access arrived with the feature that needs it — blocking a
      // page before it renders — and it is bounded: no file://, no other
      // schemes, nothing the store listing does not explain.
      expect(manifest(browser).host_permissions).toEqual(['http://*/*', 'https://*/*'])
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
