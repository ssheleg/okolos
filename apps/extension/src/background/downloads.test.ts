import { describe, expect, it, vi } from 'vitest'
import type { FeedSnapshot } from '@okolos/core-feeds'

import { handleDownload, type DownloadDeps, type DownloadItem } from './downloads.js'

import { readFileSync } from 'node:fs'
import path from 'node:path'
import { fromCatalogue, useResolver, type Catalogue } from '@okolos/i18n'

/** The shipped Russian catalogue: `default_locale` is `ru`, and a fake would let a missing key pass. */
const CATALOGUE = JSON.parse(
  readFileSync(path.resolve(import.meta.dirname, '../../_locales/ru/messages.json'), 'utf8'),
) as Catalogue

useResolver(fromCatalogue(CATALOGUE))

/** The entry, or a failure that names the key rather than comparing to undefined. */
function message(key: string): string {
  const entry = CATALOGUE[key]
  if (!entry) throw new Error(`the shipped catalogue has no key "${key}"`)
  return entry.message
}

const FEED: FeedSnapshot = {
  name: 'URLhaus',
  version: 4,
  updatedAt: '2026-08-04T00:00:00.000Z',
  entries: ['malware.test'],
}

function item(overrides: Partial<DownloadItem> = {}): DownloadItem {
  return { id: 1, url: 'https://files.test/report.pdf', filename: 'report.pdf', mime: 'application/pdf', ...overrides }
}

function deps(overrides: Partial<DownloadDeps> = {}): DownloadDeps & {
  cancel: ReturnType<typeof vi.fn>
  journal: ReturnType<typeof vi.fn>
} {
  return {
    feed: async () => FEED,
    cancel: vi.fn(async () => undefined),
    journal: vi.fn(async () => undefined),
    announce: vi.fn(async () => undefined),
    ...overrides,
  } as DownloadDeps & { cancel: ReturnType<typeof vi.fn>; journal: ReturnType<typeof vi.fn> }
}

describe('a file from a listed address', () => {
  it('is cancelled before it reaches the disk', async () => {
    const d = deps()
    const verdict = await handleDownload(item({ url: 'https://malware.test/x.exe' }), d)

    expect(verdict.action).toBe('block')
    expect(d.cancel).toHaveBeenCalledWith(1)
  })

  it('names the list and the date of its entry', async () => {
    const verdict = await handleDownload(item({ url: 'https://malware.test/x.exe' }), deps())
    expect(verdict.reasons.join(' ')).toContain('URLhaus')
    expect(verdict.reasons.join(' ')).toContain('2026-08-04')
  })

  it('is written to the journal', async () => {
    const d = deps()
    await handleDownload(item({ url: 'https://malware.test/x.exe' }), d)
    expect(d.journal).toHaveBeenCalledWith(expect.objectContaining({ outcome: 'block' }))
  })
})

describe('the check that can never run here', () => {
  it('reports the hash as not run, with the reason', async () => {
    // There is no file yet. Treating the missing hash as a pass would be a
    // green tick nobody earned.
    const verdict = await handleDownload(item(), deps())
    expect(verdict.skipped).toContainEqual({
      check: 'hash',
      why: message('downloadNotWritten'),
    })
  })

  it('never claims every check passed', async () => {
    const verdict = await handleDownload(item(), deps())
    expect(verdict.headline).toMatch(/checks that could be run/i)
  })
})

describe('when the lists are unavailable', () => {
  it('says the source was not checked rather than passing it', async () => {
    const verdict = await handleDownload(item(), deps({ feed: async () => null }))
    expect(verdict.skipped.map((entry) => entry.check)).toContain('feed')
  })

  it('still lets an ordinary file through', async () => {
    const d = deps({ feed: async () => null })
    const verdict = await handleDownload(item(), d)
    expect(verdict.action).not.toBe('block')
    expect(d.cancel).not.toHaveBeenCalled()
  })

  it('survives a storage failure without stopping the download', async () => {
    const d = deps({
      feed: async () => {
        throw new Error('database gone')
      },
    })
    await expect(handleDownload(item(), d)).resolves.toBeTruthy()
    expect(d.cancel).not.toHaveBeenCalled()
  })
})

describe('what the file name gives away', () => {
  it('warns about a program dressed as a document', async () => {
    const verdict = await handleDownload(item({ filename: 'invoice.pdf.exe' }), deps())
    expect(verdict.action).toBe('warn')
  })

  it('does not cancel on a warning — that is the user’s call', async () => {
    const d = deps()
    await handleDownload(item({ filename: 'invoice.pdf.exe' }), d)
    expect(d.cancel).not.toHaveBeenCalled()
  })
})
