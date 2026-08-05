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

  if (url.pathname === '/status/domain' && request.method === 'GET') {
    return domainStatus(url.searchParams.get('domain'), env)
  }

  if (url.pathname === '/appeal' && request.method === 'POST') {
    return appeal(request, env)
  }

  if (url.pathname === '/healthz') {
    return json({ ok: true })
  }

  return json({ error: 'not found' }, 404)
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
  } catch {
    return json({ error: 'the appeal could not be recorded — nothing was saved' }, 503)
  }

  return json({ reference, domain })
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
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
    return url.hostname || null
  } catch {
    return null
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}
