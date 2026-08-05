import { describe, expect, it } from 'vitest'

import { judgeDownload, type CheckOutcome, type DownloadEvidence } from './judge.js'

const PASS: CheckOutcome = { ran: true, passed: true }
const skip = (why: string): CheckOutcome => ({ ran: false, why })
const fail = (detail: string): CheckOutcome => ({ ran: true, passed: false, detail })

function evidence(overrides: Partial<DownloadEvidence> = {}): DownloadEvidence {
  return {
    url: 'https://files.test/setup',
    filename: 'report.pdf',
    mimeType: 'application/pdf',
    checks: { feed: PASS, 'file-type': PASS, hash: PASS },
    ...overrides,
  }
}

describe('a file that matched something known', () => {
  it('is blocked, and the match is named', () => {
    const verdict = judgeDownload(
      evidence({ checks: { feed: fail('listed by URLhaus on 2026-08-01'), 'file-type': PASS, hash: PASS } }),
    )
    expect(verdict.action).toBe('block')
    expect(verdict.reasons[0]).toContain('URLhaus')
  })

  it('is blocked on the hash too, not only the URL', () => {
    const verdict = judgeDownload(
      evidence({ checks: { feed: PASS, 'file-type': PASS, hash: fail('this exact file is known malware') } }),
    )
    expect(verdict.action).toBe('block')
  })
})

describe('what the verdict may claim', () => {
  it('says every check passed only when every check ran', () => {
    expect(judgeDownload(evidence()).headline).toMatch(/passed every check/i)
  })

  it('says which checks it could run when one could not', () => {
    // The dishonest version of this screen is a green tick the product did not
    // earn, shown while someone decides whether to run a program.
    const verdict = judgeDownload(
      evidence({ checks: { feed: PASS, 'file-type': PASS, hash: skip('the file is behind a login') } }),
    )
    expect(verdict.headline).toMatch(/checks that could be run/i)
    expect(verdict.skipped).toEqual([{ check: 'hash', why: 'the file is behind a login' }])
  })

  it('lists what ran, so the claim can be audited', () => {
    const verdict = judgeDownload(
      evidence({ checks: { feed: PASS, 'file-type': PASS, hash: skip('no bytes available') } }),
    )
    expect(verdict.ran).toEqual(['feed', 'file-type'])
  })

  it('says plainly when nothing could be checked', () => {
    const verdict = judgeDownload(
      evidence({
        checks: {
          feed: skip('the feeds are unavailable'),
          'file-type': skip('no filename was reported'),
          hash: skip('the bytes cannot be re-fetched'),
        },
      }),
    )
    expect(verdict.unchecked).toBe(true)
    expect(verdict.headline).toMatch(/not checked at all/i)
    expect(verdict.action).toBe('warn')
  })
})

describe('what the file itself gives away', () => {
  it('catches a program wearing a document extension', () => {
    const verdict = judgeDownload(evidence({ filename: 'invoice.pdf.exe' }))
    expect(verdict.action).toBe('warn')
    expect(verdict.reasons[0]).toContain('invoice.pdf.exe')
  })

  it('catches a server calling a program a document', () => {
    const verdict = judgeDownload(evidence({ filename: 'setup.exe', mimeType: 'application/pdf' }))
    expect(verdict.action).toBe('warn')
    expect(verdict.reasons[0]).toContain('application/pdf')
  })

  it('says an archive was not looked inside, when something else was skipped too', () => {
    const verdict = judgeDownload(
      evidence({ filename: 'photos.zip', mimeType: 'application/zip', checks: { feed: PASS, 'file-type': PASS, hash: skip('too large') } }),
    )
    expect(verdict.reasons[0]).toMatch(/archive/i)
  })

  it('does not nag about an ordinary document that passed everything', () => {
    expect(judgeDownload(evidence()).action).toBe('inform')
  })

  it('does not call a plain executable dangerous when every check passed', () => {
    // Programs are downloaded all day. Warning about all of them is the same as
    // warning about none.
    const verdict = judgeDownload(evidence({ filename: 'installer.exe', mimeType: 'application/octet-stream' }))
    expect(verdict.action).toBe('inform')
  })

  it('does warn about an executable when a check was skipped', () => {
    const verdict = judgeDownload(
      evidence({
        filename: 'installer.exe',
        mimeType: 'application/octet-stream',
        checks: { feed: PASS, 'file-type': PASS, hash: skip('the bytes are gone') },
      }),
    )
    expect(verdict.action).toBe('warn')
  })
})
