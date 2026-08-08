/**
 * Where "I own this site" goes.
 *
 * It went to `options.html#appeal` — a hash that matched nothing, on a page
 * that has no appeal section. The owner clicked, landed on their own settings,
 * and found nothing about the block they had just been shown. The screen record
 * for SCR-05 had said SCR-14 all along.
 *
 * SCR-14 is the public page, and it is public on purpose: the appeal is filed
 * with the service, not with the copy of the extension on this machine, and the
 * same link works when the owner continues from a phone or hands it to whoever
 * runs their site.
 */

import { PROXY_ORIGIN } from '../config.js'

/**
 * The status page for the host that was blocked, with the domain already in it.
 *
 * Returns null when the blocked URL yields no host to ask about — an owner sent
 * to an empty lookup form has been given a chore, not an answer, and the caller
 * can keep the button quiet instead.
 *
 * Only the host travels. The path of a blocked URL can carry a token or a
 * search term, and none of that is any of this service's business; the status
 * page answers about domains and needs nothing else.
 */
export function appealLinkFor(blockedUrl: string | null | undefined): string | null {
  if (typeof blockedUrl !== 'string' || blockedUrl.trim() === '') return null

  let host: string
  try {
    const parsed = new URL(blockedUrl.includes('://') ? blockedUrl : `https://${blockedUrl}`)
    host = parsed.hostname.toLowerCase().replace(/\.$/, '')
  } catch {
    return null
  }

  const labels = host.split('.')
  if (labels.length < 2 || labels.some((label) => label === '')) return null

  return `${PROXY_ORIGIN}/status?domain=${encodeURIComponent(host)}`
}
