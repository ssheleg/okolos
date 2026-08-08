import { existsSync, readFileSync } from 'node:fs'
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
  // The only moment a dangerous file can be stopped is before it is written.
  'downloads',
  // Reading what the other extensions may do, to notice the update that widens it.
  'management',
]
const CHROME_ONLY_PERMISSIONS = ['offscreen']

describe('what the extension asks for', () => {
  for (const browser of ['chrome', 'firefox'] as const) {
    it(`${browser}: requests only the permissions the skeleton needs`, () => {
      const expected =
        browser === 'chrome'
          ? ['storage', 'alarms', 'activeTab', ...CHROME_ONLY_PERMISSIONS, 'declarativeNetRequest', 'webNavigation', 'downloads', 'management']
          : ['storage', 'alarms', 'activeTab', 'declarativeNetRequest', 'webNavigation', 'downloads', 'management']
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

describe('the icon the browser and the store will actually show', () => {
  /**
   * `"icons": {}` shipped in both manifests until 2026-08-08, and the project
   * carried no image file at all. The browser draws a placeholder and the store
   * refuses the upload — a defect visible to every user before they open
   * anything.
   *
   * Existence is not the check. A file named `128.png` that is 64 pixels wide
   * passes an existence test and fails in the listing, so the size is read out
   * of the PNG header. And the committed bytes are compared against what the
   * generator produces, because an icon nobody can regenerate is the drift this
   * repository already refuses for its wireframes.
   */
  const iconRoot = path.join(app, 'icons')

  /** Width and height out of the IHDR chunk, which is always the first one. */
  const dimensions = (file: string): { width: number; height: number } => {
    const png = readFileSync(file)
    expect(png.subarray(1, 4).toString('latin1'), `${file} is not a PNG`).toBe('PNG')
    return { width: png.readUInt32BE(16), height: png.readUInt32BE(20) }
  }

  for (const target of ['chrome', 'firefox']) {
    const manifest = JSON.parse(
      readFileSync(path.join(app, `manifest.${target}.json`), 'utf8'),
    ) as { icons?: Record<string, string>; action?: { default_icon?: Record<string, string> } }

    it(`${target} declares icons at all`, () => {
      expect(Object.keys(manifest.icons ?? {}).length).toBeGreaterThanOrEqual(4)
    })

    it(`${target} declares a toolbar icon, so the button is not a placeholder`, () => {
      expect(Object.keys(manifest.action?.default_icon ?? {}).length).toBeGreaterThan(0)
    })

    it(`${target} names files that exist and are the size they claim`, () => {
      const declared = { ...(manifest.icons ?? {}), ...(manifest.action?.default_icon ?? {}) }
      for (const [size, file] of Object.entries(declared)) {
        const onDisk = path.join(app, file)
        expect(existsSync(onDisk), `${target} names ${file}, which is not there`).toBe(true)
        expect(dimensions(onDisk), `${file} is declared as ${size}`).toEqual({
          width: Number(size),
          height: Number(size),
        })
      }
    })
  }

  it('carries exactly the bytes the generator draws', async () => {
    // @ts-expect-error — a plain .mjs tool, imported for the drawing it does.
    const { SIZES, draw } = await import('./icons.mjs')
    for (const size of SIZES) {
      const committed = readFileSync(path.join(iconRoot, `${size}.png`))
      expect(
        committed.equals(draw(size)),
        `icons/${size}.png differs from tools/icons.mjs — run \`node tools/icons.mjs\``,
      ).toBe(true)
    }
  })
})
