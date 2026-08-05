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
