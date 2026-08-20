import { describe, expect, it } from 'vitest'

import { handle, type Env } from './router.js'

/**
 * `/appeal` was an unauthenticated writer into the production database.
 *
 * No rate limit, no body cap — `request.text()` and `request.json()` read
 * everything a sender chose to send, and the 2000-character `slice` came after —
 * no origin check of any kind, and a reference that was a 32-bit hash of the
 * domain and the message *and* the primary key, so an attacker could compute the
 * reference an owner's appeal would get, file it first, and the owner was told
 * "already filed" with their contact details never stored. The attack needed one
 * HTML page and no JavaScript, because the form is `x-www-form-urlencoded` and
 * that needs no preflight.
 *
 * And nothing ever read an appeal: the whole tree held an `INSERT` and a
 * `DELETE`. A form that files a complaint into a table nobody opens lies by
 * existing.
 */

interface Recorded {
  readonly sql: string
  readonly values: readonly unknown[]
}

function env(
  options: {
    recentAppeals?: number
    existing?: { reference: string } | null
    token?: string
    rows?: unknown[]
    countFails?: boolean
    insertFails?: 'duplicate' | 'other'
  } = {},
): Env & { recorded: Recorded[] } {
  const recorded: Recorded[] = []
  return {
    recorded,
    ...(options.token === undefined ? {} : { APPEALS_TOKEN: options.token }),
    DB: {
      prepare: (sql: string) => ({
        bind: (...values: unknown[]) => ({
          run: async () => {
            recorded.push({ sql, values })
            if (options.insertFails === 'duplicate') {
              throw new Error('UNIQUE constraint failed: appeals.reference')
            }
            if (options.insertFails === 'other') throw new Error('database unavailable')
            return {}
          },
          first: async <T>() => {
            recorded.push({ sql, values })
            if (sql.includes('COUNT(*)')) {
              if (options.countFails) throw new Error('database unavailable')
              return { n: options.recentAppeals ?? 0 } as T
            }
            if (sql.includes('SELECT reference FROM appeals')) {
              return (options.existing ?? null) as T | null
            }
            return null
          },
          all: async <T>() => {
            recorded.push({ sql, values })
            return { results: (options.rows ?? []) as T[] }
          },
        }),
      }),
    },
  }
}

const APPEAL = { domain: 'example.test', contact: 'owner@example.test', message: 'we cleaned it up' }

function postJson(body: unknown, headers: Record<string, string> = {}): Request {
  return new Request('https://proxy.test/appeal', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(body),
  })
}

function postForm(fields: Record<string, string>, headers: Record<string, string> = {}): Request {
  return new Request('https://proxy.test/appeal', {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams(fields).toString(),
  })
}

const inserts = (e: { recorded: Recorded[] }) =>
  e.recorded.filter((r) => r.sql.startsWith('INSERT INTO appeals'))

describe('an appeal that did not come from this site', () => {
  it('is refused when the browser says the request is cross-site', async () => {
    // `Sec-Fetch-Site` is set by the browser on every request it makes, and a
    // page cannot forge it. The form needs no preflight, so this is the check
    // that has to hold.
    const e = env()
    const response = await handle(postForm(APPEAL, { 'sec-fetch-site': 'cross-site' }), e)
    expect(response.status).toBe(403)
    expect(inserts(e)).toEqual([])
  })

  it('is refused when the Origin belongs to somebody else', async () => {
    const e = env()
    const response = await handle(postJson(APPEAL, { origin: 'https://evil.test' }), e)
    expect(response.status).toBe(403)
    expect(inserts(e)).toEqual([])
  })

  it('says nothing was saved, because nothing was', async () => {
    // A refusal that leaves the sender guessing is a refusal that gets retried
    // until it works.
    const response = await handle(postForm(APPEAL, { 'sec-fetch-site': 'cross-site' }), env())
    expect(await response.text()).toContain('nothing was saved')
  })

  it('accepts the form from the page that serves it', async () => {
    const e = env()
    const response = await handle(postForm(APPEAL, { 'sec-fetch-site': 'same-origin' }), e)
    expect(response.status).toBe(200)
    expect(inserts(e)).toHaveLength(1)
  })

  it('accepts a request with neither header, because that is not a browser', async () => {
    /**
     * A client posting from a terminal sends no `Sec-Fetch-Site` and no `Origin`,
     * and it cannot be made to act on a visitor's behalf without their knowledge
     * — which is the entire thing this check protects. It is not authentication
     * and does not pretend to be; the rate limit and the body cap are what bound
     * a determined script.
     */
    const e = env()
    expect((await handle(postJson(APPEAL), e)).status).toBe(200)
    expect(inserts(e)).toHaveLength(1)
  })
})

describe('how much an appeal may weigh', () => {
  it('refuses a declared length over the cap without reading the body', async () => {
    const e = env()
    const request = new Request('https://proxy.test/appeal', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'content-length': String(64 * 1024) },
      body: JSON.stringify(APPEAL),
    })
    const response = await handle(request, e)
    expect(response.status).toBe(413)
    expect(inserts(e)).toEqual([])
  })

  it('refuses a body that turns out to be over the cap as it arrives', async () => {
    /**
     * `content-length` is optional, and a chunked body has none — so trusting
     * the header alone is trusting the sender about how much the sender is
     * sending. The stream is read with a running total for that reason.
     */
    const huge = { ...APPEAL, message: 'x'.repeat(20 * 1024) }
    const e = env()
    const request = new Request('https://proxy.test/appeal', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(new TextEncoder().encode(JSON.stringify(huge)))
          controller.close()
        },
      }),
      // Required by the platform for a stream body.
      duplex: 'half',
    } as RequestInit & { duplex: 'half' })

    expect((await handle(request, e)).status).toBe(413)
    expect(inserts(e)).toEqual([])
  })

  it('accepts an ordinary appeal', async () => {
    // The cap must not be so tight that the form it guards cannot be submitted:
    // 2000 characters of message plus 200 of contact is what the fields allow.
    const e = env()
    const full = { domain: 'example.test', contact: 'o'.repeat(200), message: 'm'.repeat(2000) }
    expect((await handle(postJson(full), e)).status).toBe(200)
    expect(inserts(e)).toHaveLength(1)
  })
})

describe('how often one domain may appeal', () => {
  it('refuses past the hourly budget, and says how many are already on file', async () => {
    const e = env({ recentAppeals: 5 })
    const response = await handle(postJson(APPEAL), e)
    expect(response.status).toBe(429)
    await expect(response.json()).resolves.toMatchObject({ domain: 'example.test' })
    expect(inserts(e)).toEqual([])
  })

  it('accepts below it', async () => {
    const e = env({ recentAppeals: 4 })
    expect((await handle(postJson(APPEAL), e)).status).toBe(200)
    expect(inserts(e)).toHaveLength(1)
  })

  it('counts within a window rather than for ever', async () => {
    // A domain that appealed five times last year must still be able to appeal.
    const e = env({ recentAppeals: 0 })
    await handle(postJson(APPEAL), e)
    const count = e.recorded.find((r) => r.sql.includes('COUNT(*)'))
    expect(count?.sql).toContain('created_at > ?')
    const since = String(count?.values[1])
    expect(Date.now() - Date.parse(since)).toBeGreaterThan(59 * 60 * 1000)
    expect(Date.now() - Date.parse(since)).toBeLessThan(61 * 60 * 1000)
  })

  it('still records the appeal when the counting itself fails', async () => {
    /**
     * A limiter that cannot be read must not become a refusal: the appeal is what
     * this service exists for, and turning a database hiccup into "your appeal
     * was rejected" is a denial of service performed on the owner. The body cap
     * and the duplicate check still bound the write.
     */
    const e = env({ countFails: true })
    expect((await handle(postJson(APPEAL), e)).status).toBe(200)
    expect(inserts(e)).toHaveLength(1)
  })

  it('limits by domain and nothing about the sender', async () => {
    // Nothing about a request is stored, so the limit is keyed on the only thing
    // an appeal contains that is worth limiting. No address, no identifier.
    const e = env()
    await handle(postJson(APPEAL), e)
    const count = e.recorded.find((r) => r.sql.includes('COUNT(*)'))
    expect(count?.values).toContain('example.test')
    expect(JSON.stringify(e.recorded)).not.toMatch(/cf-connecting-ip|x-forwarded-for/i)
  })
})

describe('the reference nobody can compute in advance', () => {
  it('is not derived from the appeal’s contents', async () => {
    // Two identical appeals, filed against fresh databases, must not land on the
    // same reference — that equality was the attack.
    const first = env()
    const second = env()
    const a = (await (await handle(postJson(APPEAL), first)).json()) as { reference: string }
    const b = (await (await handle(postJson(APPEAL), second)).json()) as { reference: string }
    expect(a.reference).not.toBe(b.reference)
  })

  it('is long enough that guessing is not a strategy', async () => {
    const body = (await (await handle(postJson(APPEAL), env())).json()) as { reference: string }
    expect(body.reference).toMatch(/^OK-[0-9A-Z]{16}$/)
  })

  it('reports the stored reference when the same appeal arrives twice', async () => {
    // The owner refreshed the page. They are owed the reference of the appeal
    // that is on file, not a new one that is not.
    const e = env({ existing: { reference: 'OK-ALREADYONFILE1' } })
    const response = await handle(postJson(APPEAL), e)
    await expect(response.json()).resolves.toMatchObject({
      alreadyFiled: true,
      reference: 'OK-ALREADYONFILE1',
    })
    expect(inserts(e)).toEqual([])
  })

  it('treats a different contact as a different appeal', async () => {
    /**
     * The heart of the old attack: guess the message, file first, and the real
     * owner's contact is never stored. The duplicate check reads domain, message
     * **and** contact, so an attacker who does not know the owner's address
     * cannot suppress the owner's appeal.
     */
    const e = env({ existing: null })
    await handle(postJson(APPEAL), e)
    const lookup = e.recorded.find((r) => r.sql.includes('SELECT reference FROM appeals'))
    expect(lookup?.values).toEqual(['example.test', 'we cleaned it up', 'owner@example.test'])
  })

  it('treats a key conflict as the appeal being on file, not as a failure', async () => {
    // The duplicate check is not a lock, so two requests can pass it together.
    const e = env({ insertFails: 'duplicate' })
    await expect((await handle(postJson(APPEAL), e)).json()).resolves.toMatchObject({
      alreadyFiled: true,
    })
  })

  it('says plainly that nothing was saved when the write really failed', async () => {
    const e = env({ insertFails: 'other' })
    const response = await handle(postJson(APPEAL), e)
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('nothing was saved'),
    })
  })
})

describe('reading appeals back', () => {
  it('does not admit the route exists without the token', async () => {
    // A 401 confirms the address, and an address that is confirmed gets guessed
    // at. Unset token means the route is not there.
    const response = await handle(new Request('https://proxy.test/appeals'), env())
    expect(response.status).toBe(404)
  })

  it('answers 404 to a wrong token as well', async () => {
    const response = await handle(
      new Request('https://proxy.test/appeals', { headers: { authorization: 'Bearer nope' } }),
      env({ token: 'secret-token' }),
    )
    expect(response.status).toBe(404)
  })

  it('returns the appeals to whoever holds it', async () => {
    const rows = [
      { reference: 'OK-1', domain: 'a.test', contact: 'a@a.test', message: 'hi', created_at: 'x' },
    ]
    const response = await handle(
      new Request('https://proxy.test/appeals', {
        headers: { authorization: 'Bearer secret-token' },
      }),
      env({ token: 'secret-token', rows }),
    )
    expect(response.status).toBe(200)
    await expect(response.json()).resolves.toEqual({ appeals: rows })
  })

  it('is never cached and never readable from another origin', async () => {
    // The one response here that contains something somebody wrote in confidence.
    const response = await handle(
      new Request('https://proxy.test/appeals', {
        headers: { authorization: 'Bearer secret-token' },
      }),
      env({ token: 'secret-token' }),
    )
    expect(response.headers.get('cache-control')).toBe('no-store')
    expect(response.headers.get('access-control-allow-origin')).toBeFalsy()
  })

  it('bounds how much one request may take', async () => {
    const e = env({ token: 'secret-token' })
    await handle(
      new Request('https://proxy.test/appeals?limit=99999', {
        headers: { authorization: 'Bearer secret-token' },
      }),
      e,
    )
    const read = e.recorded.find((r) => r.sql.includes('SELECT reference, domain'))
    expect(read?.values).toEqual([200])
  })
})

describe('the headers every response carries', () => {
  /**
   * There were none. A grep for CSP, `x-content-type-options`,
   * `referrer-policy`, HSTS or `x-frame-options` across the whole repository
   * returned nothing — on a service whose pages are quoted by crawlers and whose
   * form a domain owner types their contact details into.
   */
  const required = [
    'content-security-policy',
    'x-content-type-options',
    'referrer-policy',
    'x-frame-options',
    'strict-transport-security',
    'permissions-policy',
  ]

  for (const [what, request] of [
    ['the JSON lookup', new Request('https://proxy.test/status/domain?domain=a.test')],
    ['the status page', new Request('https://proxy.test/status?domain=a.test')],
    ['the landing page', new Request('https://proxy.test/')],
    ['the privacy page', new Request('https://proxy.test/privacy')],
    ['a 404', new Request('https://proxy.test/nope')],
    ['the health check', new Request('https://proxy.test/healthz')],
  ] as const) {
    it(`sends them on ${what}`, async () => {
      const response = await handle(request, env())
      for (const header of required) {
        expect(response.headers.get(header), `${what} is missing ${header}`).toBeTruthy()
      }
    })
  }

  it('sends them on an appeal’s reply, which is the page an owner reads', async () => {
    const response = await handle(postForm(APPEAL, { 'sec-fetch-site': 'same-origin' }), env())
    for (const header of required) {
      expect(response.headers.get(header), `the appeal reply is missing ${header}`).toBeTruthy()
    }
  })

  it('forbids script outright, because these pages have none', async () => {
    // The pages are rendered whole on the server. `script-src 'none'` costs
    // nothing here and closes the class.
    const policy = (await handle(new Request('https://proxy.test/'), env())).headers.get(
      'content-security-policy',
    )
    expect(policy).toContain("default-src 'none'")
    expect(policy).toContain("frame-ancestors 'none'")
    expect(policy).toContain("form-action 'self'")
  })

  it('does not let another origin read an appeal’s reply', async () => {
    const response = await handle(postJson(APPEAL), env())
    expect(response.headers.get('access-control-allow-origin')).toBeFalsy()
  })

  it('still lets anyone read the public lookup', async () => {
    // The domain status is public information and the extension reads it from a
    // page context. Narrowing that would break the thing CORS is there for.
    const response = await handle(new Request('https://proxy.test/status/domain?domain=a.test'), env())
    expect(response.headers.get('access-control-allow-origin')).toBe('*')
  })
})
