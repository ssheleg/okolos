import { readFileSync } from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { DEFAULT_LOCALE, localeFromEnv } from './index.js'

describe('the language the command speaks', () => {
  /**
   * Two surfaces of one product must not disagree about its language. The
   * manifest is the one that ships; this holds the command to it.
   */
  it('defaults to the same locale the extension manifest declares', () => {
    const manifest = JSON.parse(
      readFileSync(path.join(process.cwd(), 'apps/extension/manifest.chrome.json'), 'utf8'),
    ) as { default_locale: string }
    expect(DEFAULT_LOCALE).toBe(manifest.default_locale)
  })

  it('ignores the shell, because the shell says what the terminal is, not what this speaks', () => {
    expect(localeFromEnv({ LANG: 'en_US.UTF-8', LC_ALL: 'en_US.UTF-8' })).toBe('ru')
  })

  it('honours a deliberate override', () => {
    expect(localeFromEnv({ OKOLOS_LOCALE: 'en' })).toBe('en')
    expect(localeFromEnv({ OKOLOS_LOCALE: 'ru' })).toBe('ru')
  })
})
