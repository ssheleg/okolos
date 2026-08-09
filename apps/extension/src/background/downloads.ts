
import { t } from '@okolos/i18n'
import { judgeDownload, type CheckOutcome, type DownloadVerdict } from '@okolos/core-download'
import { matchUrl, type FeedSnapshot, displayFeedNameEn } from '@okolos/core-feeds'

/**
 * Judging a download at the only moment it can be stopped.
 *
 * The check has to happen between the browser creating the item and the bytes
 * landing, which means the file itself does not exist yet — so the hash check
 * cannot run, ever, at this point. That is not a gap to paper over: it is
 * reported as a check that did not run, with the reason, and the verdict says
 * so instead of implying the file was cleared.
 */

export interface DownloadItem {
  readonly id: number
  readonly url: string
  readonly filename: string
  readonly mime: string | null
}

export interface DownloadDeps {
  feed(): Promise<FeedSnapshot | null>
  cancel(id: number): Promise<void>
  journal(entry: { explain: string; outcome: string }): Promise<void>
  announce(verdict: DownloadVerdict, item: DownloadItem): Promise<void>
}

export async function handleDownload(item: DownloadItem, deps: DownloadDeps): Promise<DownloadVerdict> {
  const feed = await deps.feed().catch(() => null)

  const feedCheck: CheckOutcome = feed
    ? matchUrl(item.url, feed)
      ? {
          ran: true,
          passed: false,
          detail: t('downloadListedBy', displayFeedNameEn(feed.name) ?? feed.name, feed.updatedAt.slice(0, 10)),
        }
      : { ran: true, passed: true }
    : { ran: false, why: t('downloadFeedUnread') }

  const verdict = judgeDownload({
    url: item.url,
    filename: item.filename,
    mimeType: item.mime,
    checks: {
      feed: feedCheck,
      'file-type': item.filename ? { ran: true, passed: true } : { ran: false, why: t('downloadNoFilename') },
      hash: {
        ran: false,
        why: t('downloadNotWritten'),
      },
    },
  })

  if (verdict.action === 'block') {
    // Cancelled first, explained second. The order matters: the file must not
    // reach the disk while a banner is being drawn.
    await deps.cancel(item.id).catch(() => undefined)
  }

  await deps
    .journal({
      explain: `${verdict.headline}: ${item.filename || item.url}`,
      outcome: verdict.action,
    })
    .catch(() => undefined)

  await deps.announce(verdict, item).catch(() => undefined)
  return verdict
}
