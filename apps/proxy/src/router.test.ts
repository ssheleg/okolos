import { describe, expect, it } from 'vitest'

import { handle, normaliseDomain, type Env } from './router.js'

type Row = { feed: string; entry_date: string }

function env(overrides: { listing?: Row | null; fail?: boolean; inserted?: unknown[] } = {}): Env {
  const inserted = overrides.inserted ?? []
  return {
    DB: {
      prepare: () => ({
        bind: (...values: unknown[]) => ({
          run: async () => {
            if (overrides.fail) throw new Error('database unavailable')
            inserted.push(values)
            return {}
          },
          first: async <T>() => {
            if (overrides.fail) throw new Error('database unavailable')
            return (overrides.listing ?? null) as T | null
          },
          all: async <T>() => ({ results: [] as T[] }),
        }),
      }),
    },
  }
}

const get = (path: string) => new Request(`https://proxy.test${path}`)
const post = (path: string, body: unknown) =>
  new Request(`https://proxy.test${path}`, { method: 'POST', body: JSON.stringify(body) })

describe('a domain nobody has heard of', () => {
  it('is reported as not listed, in those words', async () => {
    const response = await handle(get('/status/domain?domain=example.test'), env())
    await expect(response.json()).resolves.toMatchObject({ status: 'not-listed' })
  })

  it('needs a domain to answer about', async () => {
    expect((await handle(get('/status/domain'), env())).status).toBe(400)
  })
})

describe('a domain that is listed', () => {
  it('says which list and when it was added', async () => {
    const response = await handle(
      get('/status/domain?domain=bad.test'),
      env({ listing: { feed: 'OpenPhish', entry_date: '2026-08-01' } }),
    )
    await expect(response.json()).resolves.toMatchObject({
      status: 'listed',
      feed: 'OpenPhish',
      entryDate: '2026-08-01',
    })
  })

  it('points the owner at whoever actually listed them', async () => {
    // Most listings are not ours. Saying so is the difference between an owner
    // fixing the problem and arguing with the wrong party.
    const response = await handle(
      get('/status/domain?domain=bad.test'),
      env({ listing: { feed: 'OpenPhish', entry_date: '2026-08-01' } }),
    )
    await expect(response.json()).resolves.toMatchObject({ appealTo: 'OpenPhish' })
  })
})

describe('when the lookup fails', () => {
  it('never answers "clean" for a question it could not ask', async () => {
    const response = await handle(get('/status/domain?domain=bad.test'), env({ fail: true }))
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({ status: 'unknown' })
  })
})

describe('appeals', () => {
  it('records one and returns a reference the owner can quote', async () => {
    const inserted: unknown[] = []
    const response = await handle(
      post('/appeal', { domain: 'mysite.test', contact: 'me@mysite.test', message: 'we cleaned it' }),
      env({ inserted }),
    )
    const body = (await response.json()) as { reference: string }
    expect(body.reference).toMatch(/^OK-/)
    expect(inserted).toHaveLength(1)
  })

  it('says nothing was saved when nothing was saved', async () => {
    const response = await handle(post('/appeal', { domain: 'mysite.test' }), env({ fail: true }))
    expect(response.status).toBe(503)
    await expect(response.json()).resolves.toMatchObject({
      error: expect.stringContaining('nothing was saved'),
    })
  })

  it('refuses an appeal with no domain', async () => {
    expect((await handle(post('/appeal', { message: 'hello' }), env())).status).toBe(400)
  })

  it('refuses a body that is not JSON', async () => {
    const request = new Request('https://proxy.test/appeal', { method: 'POST', body: 'not json' })
    expect((await handle(request, env())).status).toBe(400)
  })
})

describe('what the backend never does', () => {
  it('sets no cookies on any route', async () => {
    for (const request of [get('/healthz'), get('/status/domain?domain=a.test')]) {
      const response = await handle(request, env())
      expect(response.headers.get('set-cookie')).toBeNull()
    }
  })

  it('answers a preflight without requiring anything of the caller', async () => {
    const request = new Request('https://proxy.test/appeal', { method: 'OPTIONS' })
    expect((await handle(request, env())).status).toBe(204)
  })
})

describe('domain normalisation', () => {
  it('accepts what an owner would actually type', () => {
    expect(normaliseDomain('HTTPS://My-Site.TEST/path')).toBe('my-site.test')
    expect(normaliseDomain(' mysite.test. ')).toBe('mysite.test')
  })

  it('refuses what it cannot read', () => {
    expect(normaliseDomain('')).toBeNull()
    expect(normaliseDomain(null)).toBeNull()
  })
})

describe('a domain that is not one', () => {
  it('refuses dots standing alone', () => {
    // `..` normalised to "." and `../../etc/passwd` to ".." — both went into
    // the database as domains and came back out as answers about a domain.
    // Parameterised SQL means it is not an injection; it is nonsense stored
    // and nonsense returned.
    expect(normaliseDomain('..')).toBeNull()
    expect(normaliseDomain('.')).toBeNull()
    expect(normaliseDomain('../../etc/passwd')).toBeNull()
  })

  it('refuses a single label, which is never a public domain', () => {
    // This service answers about sites on the public internet. `localhost` is
    // not one, and an appeal filed for it is a row nobody can act on.
    expect(normaliseDomain('localhost')).toBeNull()
    expect(normaliseDomain('intranet')).toBeNull()
  })

  it('keeps the hosts it is actually for', () => {
    expect(normaliseDomain('evil.test')).toBe('evil.test')
    expect(normaliseDomain('EVIL.test.')).toBe('evil.test')
    expect(normaliseDomain('https://evil.test/path')).toBe('evil.test')
    expect(normaliseDomain('evil.test:8080')).toBe('evil.test')
    expect(normaliseDomain('xn--80ak6aa92e.com')).toBe('xn--80ak6aa92e.com')
  })

  it('keeps an address literal, which a listing can legitimately be', () => {
    expect(normaliseDomain('127.0.0.1')).toBe('127.0.0.1')
    expect(normaliseDomain('[::1]')).toBe('[::1]')
  })
})

describe('the same appeal, sent twice', () => {
  it('says it is already on file rather than that nothing was saved', async () => {
    /**
     * The reference is a hash of the domain and the message, and it is the
     * primary key. An owner who submits the same appeal again — a refreshed
     * page, an impatient second click — hits a key conflict, and the handler
     * reported "the appeal could not be recorded — nothing was saved".
     *
     * It was saved. The first time. Telling them otherwise sends them away
     * believing nobody has their case.
     */
    const conflicting = {
      DB: {
        prepare: () => ({
          bind: () => ({
            run: async () => {
              throw new Error('UNIQUE constraint failed: appeals.reference')
            },
            first: async () => null,
            all: async () => ({ results: [] }),
          }),
        }),
      },
    } as unknown as Env

    const response = await handle(
      post('/appeal', { domain: 'evil.test', message: 'this is mine' }),
      conflicting,
    )
    expect(response.status).toBe(200)
    const body = (await response.json()) as { reference: string; alreadyFiled?: boolean }
    expect(body.alreadyFiled).toBe(true)
    expect(body.reference).toMatch(/^OK-/)
  })

  it('still reports a real database failure as one', async () => {
    // The distinction has to survive: a conflict means it is on file, and
    // anything else means it is not.
    const response = await handle(post('/appeal', { domain: 'evil.test' }), env({ fail: true }))
    expect(response.status).toBe(503)
  })
})

describe('the page a person or a crawler actually gets', () => {
  /**
   * REQ-26 promised a public status page and SCR-14 was marked built, on a
   * renderer that nothing called: no document, no entry point, no request to
   * this worker. The same shape as the static analyser closed on unreachable
   * code, recorded in the retro and repeated here.
   *
   * It is served from the worker with the answer already in the markup rather
   * than fetched by a script, because the second reader of a public page is a
   * crawler and a page that needs JavaScript says nothing to one.
   */
  it('serves HTML, not JSON, at the human address', async () => {
    const response = await handle(get('/status?domain=evil.test'), env({ listing: null }))
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toMatch(/text\/html/)
  })

  it('puts the answer in the markup, where it can be read without running anything', async () => {
    const response = await handle(
      get('/status?domain=evil.test'),
      env({ listing: { feed: 'openphish', entry_date: '2026-08-01' } }),
    )
    const html = await response.text()
    expect(html).toContain('evil.test')
    expect(html).toMatch(/listed/i)
    expect(html).toContain('openphish')
  })

  it('says plainly when a domain is not listed', async () => {
    const html = await (await handle(get('/status?domain=ok.test'), env({ listing: null }))).text()
    expect(html).toMatch(/not listed/i)
  })

  it('escapes the feed name, which is data this service does not write', async () => {
    /**
     * The first version of this test sent markup as the *domain*, and passed
     * with escaping disabled — because `normaliseDomain` rejects it, so
     * nothing reached the output either way. Green for the wrong reason.
     *
     * The feed name is the value that actually matters: it comes out of the
     * database, this service does not write it, and it is interpolated into a
     * public page.
     */
    const html = await (
      await handle(
        get('/status?domain=evil.test'),
        env({ listing: { feed: '<script>alert(1)</script>', entry_date: '2026-08-01' } }),
      )
    ).text()
    expect(html).not.toContain('<script>alert(1)</script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('rejects a domain that is not one before it ever reaches the markup', () => {
    // Stated beside the escaping test so the two are not confused again: this
    // is normalisation's job, and it is why the first version of that test
    // proved nothing.
    expect(normaliseDomain('<script>alert(1)</script>')).toBeNull()
  })

  it('asks for a domain rather than guessing when none was given', async () => {
    const response = await handle(get('/status'), env())
    const html = await response.text()
    expect(response.headers.get('content-type')).toMatch(/text\/html/)
    expect(html).toMatch(/enter a domain|which domain/i)
  })

  it('does not claim a domain is clean when the lookup failed', async () => {
    const html = await (
      await handle(get('/status?domain=evil.test'), env({ fail: true }))
    ).text()
    expect(html).not.toMatch(/not listed/i)
    expect(html).toMatch(/could not/i)
  })

  it('carries a canonical link, so one question has one address', async () => {
    const html = await (await handle(get('/status?domain=Evil.TEST.'), env({ listing: null }))).text()
    expect(html).toMatch(/<link rel="canonical" href="[^"]*domain=evil\.test"/)
  })
})
