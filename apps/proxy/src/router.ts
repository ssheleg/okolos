/**
 * Every route this backend has, and what each one is allowed to know.
 *
 * The rules are the same everywhere: no cookies are set, no identifiers are
 * read, nothing about a request is stored except what an appeal explicitly
 * contains. A domain lookup is answered and forgotten.
 */
import { PRIVACY_HTML } from './privacy.generated.js'

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

  // A stable address, because a store listing links to it and a person
  // deciding about the permissions has not installed anything yet.
  if (url.pathname === '/privacy' && readOnly) {
    return privacyPage()
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
/**
 * The feeds this service publishes and can therefore lift a listing from.
 *
 * Used for two decisions that must not disagree: which feed name `/feeds/:name`
 * will serve, and whether an appeal is ours to act on. Ownership used to be
 * `feed.startsWith('okolos')` — a naming convention standing in for a
 * permission check, and one that was already wrong: the only feed actually
 * published is called `phishing`, so every listing we can lift was being sent
 * to a third party that has never heard of it.
 */
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

/**
 * The privacy policy, served whole and without a script.
 *
 * Generated from `docs/privacy.md` so the document a reader sees and the one the
 * repository keeps cannot drift; a test compares the committed markup with what
 * the generator produces.
 */
function privacyPage(): Response {
  return new Response(
    `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Приватность — Okolos</title>
<meta name="description" content="Что Okolos отправляет с устройства, что не отправляет, и сколько хранит.">
</head>
<body>
<main>
${PRIVACY_HTML}
</main>
</body>
</html>`,
    { status: 200, headers: HTML_HEADERS },
  )
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
<h1 data-role="title">Domain status</h1>
${body}
<form method="get" action="/status" data-role="lookup">
<label for="domain">Domain to check</label>
<input id="domain" name="domain" data-role="domain" type="text" placeholder="example.com" value="${escapeHtml(domain ?? '')}">
<button type="submit" data-role="check">Check domain</button>
</form>
</main>
</body>
</html>`,
      { status: 200, headers: HTML_HEADERS },
    )

  if (!domain) {
    return shell(
      'Domain status — enter a domain',
      '<p data-role="hint">Enter a domain to see whether it is listed, and by which feed.</p>',
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
      `<p data-role="error">The status of <strong>${escapeHtml(domain)}</strong> could not be looked up just now. That is not a statement that it is clean.</p>`,
      canonical,
    )
  }

  if (!row) {
    return shell(
      `${domain} is not listed`,
      `<p data-role="verdict"><strong>${escapeHtml(domain)}</strong> is <strong>not listed</strong> by any feed this service carries.</p>`,
      canonical,
    )
  }

  const ours = PUBLISHED_FEEDS.has(row.feed)
  return shell(
    `${domain} is listed`,
    `<p data-role="verdict"><strong>${escapeHtml(domain)}</strong> is <strong>listed</strong> by <strong>${escapeHtml(row.feed)}</strong>, recorded ${escapeHtml(row.entry_date)}.</p>` +
      (ours
        ? appealForm(domain)
        : `<p data-role="upstream">This listing is ${escapeHtml(row.feed)}'s, not ours. Their own appeal process is the one that will lift it; we follow their data.</p>`),
    canonical,
  )
}

/**
 * The appeal, as a plain form.
 *
 * Only for listings we can actually lift: a form against someone else's feed
 * collects a plea nobody reads, and costs the owner the day they should have
 * spent writing to the party that can help.
 *
 * No script, because the owner reading this arrived from an interstitial on a
 * site that is down and has no reason to trust another page's JavaScript — and
 * because a form that needs JS is a form that fails silently when it does not
 * load.
 */
function appealForm(domain: string): string {
  return `<form method="post" action="/appeal" data-role="appeal">
<h2>Appeal this listing</h2>
<input type="hidden" name="domain" value="${escapeHtml(domain)}">
<label for="contact">How we can reach you</label>
<input id="contact" name="contact" data-role="contact" type="text" maxlength="200" placeholder="you@${escapeHtml(domain)}">
<label for="message">What changed</label>
<textarea id="message" name="message" data-role="message" maxlength="2000" rows="4"></textarea>
<button type="submit" data-role="send-appeal">Send appeal</button>
</form>`
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
    appealTo: PUBLISHED_FEEDS.has(row.feed) ? 'okolos' : row.feed,
  })
}

async function appeal(request: Request, env: Env): Promise<Response> {
  // A browser posting the form on /status and a client posting JSON are the
  // same appeal; only the wrapping differs. The owner gets a page back, because
  // a browser handed a JSON body renders it as text and the owner cannot tell
  // whether anything was recorded.
  const asForm = (request.headers.get('content-type') ?? '').includes(
    'application/x-www-form-urlencoded',
  )
  const reply = asForm ? appealPage : json

  let body: { domain?: unknown; contact?: unknown; message?: unknown }
  if (asForm) {
    const fields = new URLSearchParams(await request.text())
    body = {
      domain: fields.get('domain') ?? undefined,
      contact: fields.get('contact') ?? undefined,
      message: fields.get('message') ?? undefined,
    }
  } else {
    try {
      body = (await request.json()) as typeof body
    } catch {
      return json({ error: 'a JSON body is required' }, 400)
    }
  }

  const domain = normaliseDomain(typeof body.domain === 'string' ? body.domain : null)
  if (!domain) return reply({ error: 'a domain is required' }, 400)

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
    if (isDuplicate(cause)) return reply({ reference, domain, alreadyFiled: true })
    return reply({ error: 'the appeal could not be recorded — nothing was saved' }, 503)
  }

  return reply({ reference, domain, alreadyFiled: false })
}

/**
 * The same outcome as the JSON body, rendered for the browser that submitted
 * the form. A reference appears only when a row exists to answer for it — an
 * owner quoting a reference for an appeal that was never saved is worse off
 * than one who was told plainly it failed.
 */
function appealPage(
  body: { reference?: string; domain?: string; alreadyFiled?: boolean; error?: string },
  status = 200,
): Response {
  const { reference, domain, alreadyFiled, error } = body
  const inner =
    error !== undefined
      ? `<p data-role="not-saved">${escapeHtml(error)}.</p><p>Nothing about this appeal is on file. Sending it again is safe.</p>`
      : alreadyFiled === true
        ? `<p data-role="already-filed">This appeal for <strong>${escapeHtml(domain ?? '')}</strong> was <strong>already on file</strong>. Its reference is <strong>${escapeHtml(reference ?? '')}</strong> — the same one, because it is the same appeal.</p>`
        : `<p data-role="reference">The appeal for <strong>${escapeHtml(domain ?? '')}</strong> is recorded. Its reference is <strong>${escapeHtml(reference ?? '')}</strong>.</p>`

  return new Response(
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Appeal — ${escapeHtml(domain ?? 'domain status')}</title>
<meta name="robots" content="noindex">
</head>
<body>
<main>
<h1 data-role="appeal-title">Appeal</h1>
${inner}
<p data-role="back"><a href="/status${domain !== undefined ? `?domain=${encodeURIComponent(domain)}` : ''}">Back to the domain status</a></p>
</main>
</body>
</html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  )
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
