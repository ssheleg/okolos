/** @vitest-environment happy-dom */
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { showDownloadVerdict, type DownloadVerdictMessage } from './download.js'

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fromCatalogue, useResolver, type Catalogue } from '@okolos/i18n'

/** The shipped Russian catalogue: `default_locale` is `ru`, and a fake would let a missing key pass. */
const CATALOGUE = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, '../../_locales/ru/messages.json'), 'utf8'),
) as Catalogue

useResolver(fromCatalogue(CATALOGUE))

function message(overrides: Partial<DownloadVerdictMessage> = {}): DownloadVerdictMessage {
  return {
    action: 'block',
    headline: 'This file matched something known to be dangerous',
    reasons: 'The address this came from is listed by URLhaus (entry from 2026-08-01).',
    skipped: 'hash: the file has not been written yet, so there are no bytes to hash',
    ...overrides,
  }
}

const deps = () => ({ doc: document, openJournal: vi.fn() })
const banner = () => document.querySelector('okolos-banner')

beforeEach(() => {
  document.body.innerHTML = ''
})

describe('a download that was stopped', () => {
  it('is told to the person who started it', () => {
    // For a while this did not happen: the worker announced its verdict to a
    // message type nobody listened for, so the file was journalled and the user
    // saw nothing.
    const handle = showDownloadVerdict(message(), deps())
    expect(handle).not.toBeNull()
    expect(banner()).not.toBeNull()
  })

  it('says the file never reached the disk, rather than offering to stop it', () => {
    const handle = showDownloadVerdict(message(), deps())
    const detail = handle?.root.querySelector('[data-role=detail]')?.textContent ?? ''
    expect(detail).toContain('на диск ничего не попало')
  })

  it('names what matched', () => {
    const handle = showDownloadVerdict(message(), deps())
    expect(handle?.root.querySelector('[data-role=detail]')?.textContent).toContain('URLhaus')
  })

  it('names the checks that could not run', () => {
    const handle = showDownloadVerdict(message(), deps())
    expect(handle?.root.querySelector('[data-role=detail]')?.textContent).toContain('Не проверено')
  })
})

describe('a download that was only doubted', () => {
  it('keeps the judge’s own headline rather than claiming a block', () => {
    const handle = showDownloadVerdict(
      message({ action: 'warn', headline: 'This file needs a look before you open it' }),
      deps(),
    )
    expect(handle?.root.querySelector('[data-role=headline]')?.textContent).toContain(
      'needs a look',
    )
  })

  it('does not claim the file was cancelled, because it was not', () => {
    const handle = showDownloadVerdict(message({ action: 'warn' }), deps())
    expect(handle?.root.querySelector('[data-role=detail]')?.textContent).not.toContain(
      'nothing reached your disk',
    )
  })
})

describe('a download that passed', () => {
  it('says nothing at all', () => {
    // Announcing every clean download is how a banner becomes wallpaper.
    expect(showDownloadVerdict(message({ action: 'inform' }), deps())).toBeNull()
    expect(banner()).toBeNull()
  })
})

describe('the way to the full record', () => {
  it('offers the record instead of an action nobody can take', () => {
    const handle = showDownloadVerdict(message(), deps())
    expect(handle?.root.querySelector('[data-role=primary]')?.textContent).toBe('Показать запись')
  })

  it('opens the journal on request', () => {
    const d = deps()
    const handle = showDownloadVerdict(message(), d)
    handle?.root.querySelector<HTMLElement>('[data-role=primary]')?.click()
    expect(d.openJournal).toHaveBeenCalledTimes(1)
  })
})
