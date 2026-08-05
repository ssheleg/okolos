/**
 * What a download verdict is allowed to say.
 *
 * The rule this file exists to enforce: the verdict never claims more than the
 * checks that actually ran. A file behind authentication cannot be hashed; a
 * stale feed cannot vouch for a URL. Both are ordinary, and both produce the
 * same dishonest output if the missing check is silently treated as a pass —
 * a green tick the product did not earn, on the one screen where the user is
 * deciding whether to run something.
 *
 * So every check reports one of three things: it passed, it failed, or it did
 * not run and here is why. The verdict is assembled from those, and the "did
 * not run" list is part of what the user is shown rather than a footnote.
 */

export type CheckName = 'feed' | 'file-type' | 'hash'

export type CheckOutcome =
  | { readonly ran: true; readonly passed: true }
  | { readonly ran: true; readonly passed: false; readonly detail: string }
  | { readonly ran: false; readonly why: string }

export interface DownloadEvidence {
  /** Final URL after redirects — origin and path, never the query. */
  readonly url: string
  readonly filename: string
  readonly mimeType: string | null
  readonly checks: Readonly<Record<CheckName, CheckOutcome>>
}

export interface DownloadVerdict {
  readonly action: 'block' | 'warn' | 'inform'
  readonly headline: string
  readonly reasons: readonly string[]
  readonly ran: readonly CheckName[]
  readonly skipped: ReadonlyArray<{ readonly check: CheckName; readonly why: string }>
  /** True when nothing could be checked at all. */
  readonly unchecked: boolean
}

const EXECUTABLE = /\.(exe|msi|bat|cmd|scr|ps1|vbs|js|jar|apk|dmg|pkg|sh|deb|rpm|com|hta|lnk)$/i
const ARCHIVE = /\.(zip|rar|7z|iso|img)$/i

/** A name whose real extension is hidden behind a decoy one. */
function hasDoubleExtension(filename: string): boolean {
  const parts = filename.toLowerCase().split('.')
  if (parts.length < 3) return false
  const decoy = /^(pdf|doc|docx|xls|xlsx|ppt|jpg|jpeg|png|txt|csv)$/
  return decoy.test(parts[parts.length - 2] as string) && EXECUTABLE.test(filename)
}

function mimeDisagrees(filename: string, mimeType: string | null): boolean {
  if (!mimeType) return false
  const looksExecutable = EXECUTABLE.test(filename)
  const claimsDocument = /^(text\/|image\/|application\/pdf)/i.test(mimeType)
  return looksExecutable && claimsDocument
}

export function judgeDownload(evidence: DownloadEvidence): DownloadVerdict {
  const names: CheckName[] = ['feed', 'file-type', 'hash']
  const ran = names.filter((name) => evidence.checks[name].ran)
  const skipped = names
    .map((name) => ({ name, outcome: evidence.checks[name] }))
    .filter((entry): entry is { name: CheckName; outcome: { ran: false; why: string } } => !entry.outcome.ran)
    .map((entry) => ({ check: entry.name, why: entry.outcome.why }))

  const failures = names
    .map((name) => ({ name, outcome: evidence.checks[name] }))
    .filter((entry) => entry.outcome.ran && !entry.outcome.passed)

  const reasons = failures.map((entry) =>
    entry.outcome.ran && !entry.outcome.passed ? entry.outcome.detail : '',
  )

  if (failures.length > 0) {
    return {
      action: 'block',
      headline: 'This file matched something known to be dangerous',
      reasons,
      ran,
      skipped,
      unchecked: false,
    }
  }

  // Shape problems are not matches against anything: they are facts about the
  // file that a person can verify by looking at its name.
  const shape: string[] = []
  if (hasDoubleExtension(evidence.filename)) {
    shape.push(`The name "${evidence.filename}" hides a program behind a document extension.`)
  }
  if (mimeDisagrees(evidence.filename, evidence.mimeType)) {
    shape.push(`The server called this ${evidence.mimeType}, but the name says it is a program.`)
  }
  if (shape.length === 0 && EXECUTABLE.test(evidence.filename) && skipped.length > 0) {
    shape.push('This is a program, and not every check could be run on it.')
  }
  if (shape.length === 0 && ARCHIVE.test(evidence.filename) && skipped.length > 0) {
    shape.push('This is an archive, so what it contains was not checked.')
  }

  if (ran.length === 0) {
    return {
      action: 'warn',
      headline: 'This file was not checked at all',
      reasons: shape,
      ran,
      skipped,
      unchecked: true,
    }
  }

  if (shape.length > 0) {
    return {
      action: 'warn',
      headline: 'This file needs a look before you open it',
      reasons: shape,
      ran,
      skipped,
      unchecked: false,
    }
  }

  return {
    action: 'inform',
    headline:
      skipped.length === 0
        ? 'This file passed every check'
        : 'This file passed the checks that could be run',
    reasons: [],
    ran,
    skipped,
    unchecked: false,
  }
}
