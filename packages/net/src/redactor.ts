/**
 * The last check before anything leaves the device.
 *
 * It exists to fail loudly during development. A privacy guarantee that is
 * only a convention survives exactly until someone adds a debug parameter in
 * a hurry; one that throws in the developer's face survives longer.
 */

const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/
const ABSOLUTE_URL = /https?:\/\//i
const MARKUP = /<[a-z!/][^>]*>/i

export type RedactionReason = 'email' | 'absolute-url' | 'markup'

export interface RedactionFinding {
  readonly reason: RedactionReason
  readonly where: 'url' | 'body'
}

/** Returns the first problem found, or null when the request is clean. */
export function findForbiddenContent(url: string, body?: string): RedactionFinding | null {
  const query = extractQueryAndFragment(url)

  if (query) {
    if (EMAIL.test(query)) return { reason: 'email', where: 'url' }
    if (ABSOLUTE_URL.test(query)) return { reason: 'absolute-url', where: 'url' }
  }

  if (body) {
    if (EMAIL.test(body)) return { reason: 'email', where: 'body' }
    if (ABSOLUTE_URL.test(body)) return { reason: 'absolute-url', where: 'body' }
    if (MARKUP.test(body)) return { reason: 'markup', where: 'body' }
  }

  return null
}

/**
 * Only the parts a caller can fill with user data are inspected. The origin
 * and path of our own endpoints are ours and are allowed to look like URLs.
 */
function extractQueryAndFragment(url: string): string | null {
  const cut = url.search(/[?#]/)
  return cut === -1 ? null : url.slice(cut)
}
