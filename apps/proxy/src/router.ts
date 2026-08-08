/**
 * Every route this backend has, and what each one is allowed to know.
 *
 * The rules are the same everywhere: no cookies are set, no identifiers are
 * read, nothing about a request is stored except what an appeal explicitly
 * contains. A domain lookup is answered and forgotten.
 */

export interface Env {
  readonly DB: D1Like
  /** Base URL where signed feed files are published. */
  readonly FEEDS_BASE?: string
}

export interface D1Like {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      run(): Promise<unknown>
      first<T = unknown>(): Promise<T | null>
      all<T = unknown>(): Promise<{ results: T[] }>
    }
  }
}

const HTML_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'public, max-age=300',
}

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  // Nothing here is cacheable per-user because nothing here is per-user.
  'cache-control': 'public, max-age=300',
  'access-control-allow-origin': '*',
}

export async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { ...JSON_HEADERS, 'access-control-allow-headers': 'content-type' },
    })
  }

  // HEAD is a GET without a body, and the platform strips the body itself.
  // Testing for GET alone sent every crawler, link checker and monitor to the
  // 404 — on the surface whose whole purpose is being found and quoted.
  const readOnly = request.method === 'GET' || request.method === 'HEAD'

  if (url.pathname === '/status/domain' && readOnly) {
    return domainStatus(url.searchParams.get('domain'), env)
  }

  if (url.pathname === '/appeal' && request.method === 'POST') {
    return appeal(request, env)
  }

  if (url.pathname.startsWith('/feeds/') && readOnly) {
    return servePublishedFeed(url.pathname.slice('/feeds/'.length), env)
  }

  if (url.pathname === '/status' && readOnly) {
    return statusPage(url, env)
  }

  if (url.pathname === '/healthz') {
    return json({ ok: true })
  }

  return json({ error: 'not found' }, 404)
}

/** Escapes text for HTML. The domain arrives in a query string. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * The public status page, rendered here with the answer already in it.
 *
 * A page assembled by a script says nothing to the second reader every public
 * page has — a crawler, or anything quoting it — and the answer to "is this
 * domain listed" is exactly the kind of thing that gets quoted. So it is
 * served whole, and needs no JavaScript to be read.
 *
 * One question, one address: `/status?domain=x`, with a canonical link to the
 * normalised form so `Evil.TEST.` and `evil.test` do not become two pages.
 */
/** Names this service publishes. Anything else is a 404, not a database query. */
const PUBLISHED_FEEDS = new Set(['phishing'])

/**
 * Serves a published feed exactly as it was published.
 *
 * The extension verifies it against a key compiled into its build, so anything
 * this worker changed on the way out would fail verification — which is the
 * point. It never signs and never assembles: the private half of the key is
 * not here.
 *
 * A feed that has not been published is a 404, not an empty snapshot. An empty
 * one would be a signed claim that nothing is dangerous, and the extension
 * would install zero rules believing that was the answer.
 */
async function servePublishedFeed(name: string, env: Env): Promise<Response> {
  if (!PUBLISHED_FEEDS.has(name)) return json({ error: 'not found' }, 404)

  let row: { body: string; updated_at: string } | null
  try {
    row = await env.DB.prepare('SELECT body, updated_at FROM feeds WHERE name = ?')
      .bind(name)
      .first<{ body: string; updated_at: string }>()
  } catch {
    return json({ error: 'the feed could not be read' }, 503)
  }

  if (!row) return json({ error: 'no feed has been published under that name' }, 404)

  return new Response(row.body, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Short: a blocking feed that is an hour stale is a phishing site that
      // stayed up an hour longer.
      'cache-control': 'public, max-age=900',
      'last-modified': new Date(row.updated_at).toUTCString(),
    },
  })
}

async function statusPage(url: URL, env: Env): Promise<Response> {
  const raw = url.searchParams.get('domain')
  const domain = normaliseDomain(raw)

  const shell = (title: string, body: string, canonical?: string): Response =>
    new Response(
      `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(title)}">
${canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}">` : ''}
</head>
<body>
<main>
<h1>Domain status</h1>
${body}
<form method="get" action="/status">
<label for="domain">Check another domain</label>
<input id="domain" name="domain" type="text" placeholder="example.com" value="${escapeHtml(domain ?? '')}">
<button type="submit">Check</button>
</form>
</main>
</body>
</html>`,
      { status: 200, headers: HTML_HEADERS },
    )

  if (!domain) {
    return shell(
      'Domain status — enter a domain',
      '<p>Enter a domain to see whether it is listed, and by which feed.</p>',
    )
  }

  const canonical = `${url.origin}/status?domain=${encodeURIComponent(domain)}`

  let row: { feed: string; entry_date: string } | null
  try {
    row = await env.DB.prepare('SELECT feed, entry_date FROM listings WHERE domain = ?')
      .bind(domain)
      .first<{ feed: string; entry_date: string }>()
  } catch {
    // Never "clean" when the answer could not be looked up — the same rule the
    // JSON endpoint holds, and for the same reason.
    return shell(
      `Domain status — ${domain}`,
      `<p>The status of <strong>${escapeHtml(domain)}</strong> could not be looked up just now. That is not a statement that it is clean.</p>`,
      canonical,
    )
  }

  if (!row) {
    return shell(
      `${domain} is not listed`,
      `<p><strong>${escapeHtml(domain)}</strong> is <strong>not listed</strong> by any feed this service carries.</p>`,
      canonical,
    )
  }

  const appealTo = row.feed.startsWith('okolos') ? 'okolos' : row.feed
  return shell(
    `${domain} is listed`,
    `<p><strong>${escapeHtml(domain)}</strong> is <strong>listed</strong> by <strong>${escapeHtml(row.feed)}</strong>, recorded ${escapeHtml(row.entry_date)}.</p>
<p>Appeals for this listing go to ${escapeHtml(appealTo)}.</p>`,
    canonical,
  )
}

async function domainStatus(domain: string | null, env: Env): Promise<Response> {
  const normalised = normaliseDomain(domain)
  if (!normalised) return json({ error: 'a domain is required' }, 400)

  let row: { feed: string; entry_date: string } | null
  try {
    row = await env.DB.prepare('SELECT feed, entry_date FROM listings WHERE domain = ?')
      .bind(normalised)
      .first<{ feed: string; entry_date: string }>()
  } catch {
    // Never "clean" when the answer could not be looked up: an owner acting on
    // that would waste a day discovering it was wrong.
    return json(
      { domain: normalised, status: 'unknown', detail: 'the status service could not be reached' },
      503,
    )
  }

  if (!row) {
    return json({ domain: normalised, status: 'not-listed', detail: 'nothing is recorded for this domain' })
  }

  return json({
    domain: normalised,
    status: 'listed',
    feed: row.feed,
    entryDate: row.entry_date,
    // Most listings are not ours, and saying so is the difference between an
    // owner fixing the problem and an owner arguing with the wrong party.
    appealTo: row.feed.startsWith('okolos') ? 'okolos' : row.feed,
  })
}

async function appeal(request: Request, env: Env): Promise<Response> {
  let body: { domain?: unknown; contact?: unknown; message?: unknown }
  try {
    body = (await request.json()) as typeof body
  } catch {
    return json({ error: 'a JSON body is required' }, 400)
  }

  const domain = normaliseDomain(typeof body.domain === 'string' ? body.domain : null)
  if (!domain) return json({ error: 'a domain is required' }, 400)

  const message = typeof body.message === 'string' ? body.message.slice(0, 2000) : ''
  const contact = typeof body.contact === 'string' ? body.contact.slice(0, 200) : ''
  const reference = referenceFor(domain, message)

  try {
    await env.DB.prepare(
      'INSERT INTO appeals (reference, domain, contact, message, created_at) VALUES (?, ?, ?, ?, ?)',
    )
      .bind(reference, domain, contact, message, new Date().toISOString())
      .run()
  } catch (cause) {
    // The reference is a hash of the domain and the message, and it is the
    // primary key — so the same appeal sent twice is a key conflict, not a
    // failure. An owner who refreshed the page or clicked again was being told
    // nothing was saved, about an appeal that was already on file.
    if (isDuplicate(cause)) return json({ reference, domain, alreadyFiled: true })
    return json({ error: 'the appeal could not be recorded — nothing was saved' }, 503)
  }

  return json({ reference, domain, alreadyFiled: false })
}

/** A primary-key conflict, under whichever wording the driver gives it. */
function isDuplicate(cause: unknown): boolean {
  const message = String((cause as { message?: unknown } | null)?.message ?? cause)
  return /unique constraint|primary key|constraint failed/i.test(message)
}

/** Deterministic and short: an owner can quote it, and it identifies nobody. */
function referenceFor(domain: string, message: string): string {
  let hash = 0
  for (const char of `${domain}|${message}`) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  }
  return `OK-${hash.toString(36).toUpperCase().padStart(7, '0')}`
}

export function normaliseDomain(raw: string | null): string | null {
  if (!raw) return null
  const trimmed = raw.trim().toLowerCase().replace(/\.$/, '')
  if (trimmed === '') return null
  let hostname: string
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
    hostname = url.hostname
  } catch {
    return null
  }
  return isPublicHost(hostname) ? hostname : null
}

/**
 * Whether this is a host the service can honestly answer about.
 *
 * `..` used to normalise to `.` and `../../etc/passwd` to `..`, and both were
 * stored as domains and answered about as domains. Parameterised SQL means it
 * was never an injection; it was nonsense in and nonsense out, and an appeal
 * filed for `.` is a row nobody can act on.
 *
 * A single label is refused for the same reason: this service is about sites
 * on the public internet, and `localhost` is not one. An address literal is
 * kept — a listing can legitimately be one.
 */
function isPublicHost(hostname: string): boolean {
  if (hostname === '') return false
  if (hostname.startsWith('[') && hostname.endsWith(']')) return true
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return true
  const labels = hostname.split('.')
  if (labels.length < 2) return false
  return labels.every((label) => /^[a-z0-9-]+$/.test(label))
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}
