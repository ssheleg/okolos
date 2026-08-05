/**
 * The only file in this repository allowed to touch the network.
 *
 * Enforced by ESLint for every other package and by a scan of the built
 * bundles in CI. Keeping egress in one file is what lets the audit log be a
 * precondition of sending rather than a hopeful description of it — if any
 * other module could call fetch, the log would be a claim, not a guarantee.
 */

export interface TransportSpec {
  readonly url: string
  readonly method: 'GET' | 'POST'
  readonly body?: string
  readonly headers?: Readonly<Record<string, string>>
}

export async function transport(spec: TransportSpec): Promise<Response> {
  const init: RequestInit = {
    method: spec.method,
    // No cookies, no credentials, ever: these endpoints are public data
    // sources and a session would turn an anonymous lookup into an identified
    // one without anyone deciding to.
    credentials: 'omit',
    referrerPolicy: 'no-referrer',
    cache: 'no-store',
  }
  if (spec.headers) init.headers = spec.headers
  if (spec.body !== undefined) init.body = spec.body

  return fetch(spec.url, init)
}
