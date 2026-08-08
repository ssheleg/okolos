import { describe, expect, it, vi } from 'vitest'

import { transport } from './transport.js'

/**
 * The one place in this codebase that calls `fetch`, tested where it lives.
 *
 * What matters here is not that a request goes out — it is what the request
 * does not carry. A cookie on one of these lookups turns an anonymous query
 * into an identified one, which is the promise this whole product is built on.
 */

describe('what leaves the device carries nothing it should not', () => {
  it('sends no credentials, no referrer and no cache entry', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response('ok'))
    vi.stubGlobal('fetch', fetchMock)
    try {
      await transport({ url: 'https://api.test/range/ABCDE', method: 'GET' })
      const init = fetchMock.mock.calls[0]?.[1]
      expect(init, 'transport was never called').toBeDefined()
      expect(init?.credentials, 'a session would identify an anonymous lookup').toBe('omit')
      expect(init?.referrerPolicy, 'the referrer would name the page being checked').toBe(
        'no-referrer',
      )
      expect(init?.cache).toBe('no-store')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('passes the method, body and headers it was given', async () => {
    const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response('ok'))
    vi.stubGlobal('fetch', fetchMock)
    try {
      await transport({
        url: 'https://api.test/appeal',
        method: 'POST',
        body: '{"domain":"x.test"}',
        headers: { 'content-type': 'application/json' },
      })
      const init = fetchMock.mock.calls[0]?.[1]
      expect(init, 'transport was never called').toBeDefined()
      expect(init?.method).toBe('POST')
      expect(init?.body).toBe('{"domain":"x.test"}')
    } finally {
      vi.unstubAllGlobals()
    }
  })
})
