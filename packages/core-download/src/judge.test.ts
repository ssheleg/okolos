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

describe('the shapes this list is a claim about', () => {
  /**
   * Membership in the executable list does not block anything — it says "this
   * is a program, and not every check could be run on it", and it is what makes
   * the double-extension check work at all: `hasDoubleExtension` requires the
   * real extension to be recognised. So an extension missing from the list
   * silently disables two things at once, and the cost of adding one is a
   * sentence on a screen rather than a blocked file.
   *
   * The list held 18 extensions on 2026-08-08 and none of the Windows script
   * and control-panel formats that carry payloads today, nor macro-enabled
   * Office documents, which are the commonest malicious attachment there is.
   */
  const SKIPPED = { ran: false as const, why: 'the file is behind a login' }

  const named = (filename: string) =>
    judgeDownload(
      evidence({ filename, mimeType: null, checks: { feed: PASS, 'file-type': PASS, hash: SKIPPED } }),
    )

  it('recognises the Windows script and control formats used to deliver payloads', () => {
    for (const ext of ['wsf', 'jse', 'vbe', 'pif', 'msc', 'cpl', 'reg', 'chm', 'scf', 'url', 'msix', 'appx']) {
      const verdict = named(`invoice.${ext}`)
      expect(verdict.reasons.join(' '), ext).toMatch(/program/i)
    }
  })

  it('recognises macro-enabled Office documents, which look like documents', () => {
    for (const ext of ['docm', 'xlsm', 'pptm', 'xlsb', 'dotm']) {
      expect(named(`отчёт.${ext}`).reasons.join(' '), ext).toMatch(/program|macro/i)
    }
  })

  it('recognises the containers used to carry a payload past the browser', () => {
    // .vhd and .cab join .iso and .img: a mounted container is where a file
    // arrives without the mark of the web.
    for (const ext of ['cab', 'vhd', 'vhdx', 'tar', 'gz', 'tgz', 'wim']) {
      expect(named(`photos.${ext}`).reasons.join(' '), ext).toMatch(/archive|container/i)
    }
  })

  it('still sees a program hidden behind a decoy extension it now knows', () => {
    // The double-extension check is only as wide as the executable list.
    const verdict = judgeDownload(evidence({ filename: 'счёт.pdf.wsf', mimeType: null }))
    expect(verdict.reasons.join(' ')).toMatch(/hides a program/i)
  })

  it('treats a wider decoy set, because a decoy is whatever looks harmless', () => {
    for (const decoy of ['rtf', 'htm', 'html', 'gif', 'mp4', 'eml', 'msg', 'xml']) {
      const verdict = judgeDownload(evidence({ filename: `letter.${decoy}.exe`, mimeType: null }))
      expect(verdict.reasons.join(' '), decoy).toMatch(/hides a program/i)
    }
  })

  it('says nothing about an ordinary document', () => {
    // The cost of widening a list is here: a plain download must stay quiet.
    for (const name of ['отчёт.pdf', 'photo.jpg', 'notes.txt', 'таблица.xlsx', 'page.html']) {
      const verdict = judgeDownload(evidence({ filename: name }))
      expect(verdict.action, name).toBe('inform')
    }
  })
})
