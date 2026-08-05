import { mountBanner, type BannerHandle } from '@okolos/ui'

/**
 * The banner for a download the background judged.
 *
 * The judging happens in the worker, because that is where the browser reports
 * a download starting and where it can still be cancelled. The telling has to
 * happen here, because a worker has nowhere to say anything — and for a while
 * it did not happen at all: the worker announced its verdict to a message type
 * nobody listened for, so a blocked file was journalled and the person who
 * started it saw nothing.
 *
 * A blocked download has already been cancelled by the time this runs. The
 * banner says so rather than offering to stop it, and the way back is to fetch
 * the file again deliberately — an offer this surface does not make, because
 * re-downloading something the feeds named is a decision that belongs on the
 * page the user came from, not in a banner.
 */

export interface DownloadVerdictMessage {
  readonly action: string
  readonly headline: string
  readonly reasons: string
  readonly skipped: string
}

export interface DownloadNoticeDeps {
  readonly doc: Document
  /** Opens the journal, where the full record of the download lives. */
  openJournal: () => void
}

export function showDownloadVerdict(
  message: DownloadVerdictMessage,
  deps: DownloadNoticeDeps,
): BannerHandle | null {
  // A file that passed everything is not news. Saying so on every download is
  // how a banner becomes wallpaper.
  if (message.action === 'inform') return null

  const blocked = message.action === 'block'
  let banner: BannerHandle | null = null
  const dismiss = () => {
    banner?.destroy()
    banner = null
  }

  banner = mountBanner(
    deps.doc,
    {
      variant: 'download',
      severity: blocked ? 'critical' : 'major',
      headline: blocked ? 'A download was stopped before it was saved' : message.headline,
      detail: [
        message.reasons,
        blocked ? 'The file was cancelled, so nothing reached your disk.' : '',
        message.skipped ? `Not checked: ${message.skipped}.` : '',
      ]
        .filter(Boolean)
        .join(' '),
      sourceLine: 'Found by: the checks that could run before the file was written',
      // Not "Discard the file": the browser already did, and offering an action
      // nobody can take is worse than offering none.
      primaryLabel: blocked ? 'Show the record' : 'Discard the file',
    },
    {
      onPrimary: blocked ? deps.openJournal : dismiss,
      onRetry: deps.openJournal,
      onDispute: dismiss,
      onDismiss: dismiss,
    },
  )

  return banner
}
