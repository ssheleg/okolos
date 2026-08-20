/**
 * Where a site's own change-password page is, if it publishes one.
 *
 * `/.well-known/change-password` is a published standard: a site that supports it
 * redirects to its real page, and one that does not shows its own 404 — which is still
 * the site's answer rather than a guess of ours.
 *
 * **Built with `URL` and checked, rather than concatenated.** A host is a string that
 * arrives from somewhere, and `https://${host}/…` gives that string authority over the
 * navigation: `good.test@evil.test` puts the user on `evil.test` while the sentence they
 * read said `good.test`, and a host with a slash in it walks the path. So the result is
 * parsed back and the hostname must be the host that was asked for. Anything else
 * returns null, and the caller offers no button rather than a wrong one.
 */
export const CHANGE_PASSWORD_PATH = '/.well-known/change-password'

export function changePasswordUrl(host: string): string | null {
  if (host === '') return null
  let url: URL
  try {
    url = new URL(`https://${host}${CHANGE_PASSWORD_PATH}`)
  } catch {
    return null
  }
  // The authority has to be the host itself, and the path the one we asked for.
  if (url.hostname !== host.toLowerCase()) return null
  if (url.pathname !== CHANGE_PASSWORD_PATH) return null
  if (url.username !== '' || url.password !== '' || url.port !== '') return null
  return url.toString()
}
