import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { serialiseUpdate, type SignedUpdate } from '@okolos/core-feeds'
import { closeDb, openDb } from '@okolos/storage'

import { createVerifier, readFeed, updateFeed } from './feeds.js'

const NOW = '2026-08-05T12:00:00.000Z'

/** A real Ed25519 pair, generated per run — the point is the algorithm, not a fixture. */
async function publisher() {
  const pair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, [
    'sign',
    'verify',
  ])) as CryptoKeyPair
  const raw = await crypto.subtle.exportKey('raw', pair.publicKey)
  const publicKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(raw)))

  return {
    publicKeyBase64,
    async sign(update: SignedUpdate['update']): Promise<SignedUpdate> {
      const signature = await crypto.subtle.sign(
        { name: 'Ed25519' },
        pair.privateKey,
        new TextEncoder().encode(serialiseUpdate(update)),
      )
      return { update, signature: btoa(String.fromCharCode(...new Uint8Array(signature))) }
    },
  }
}

const SNAPSHOT = {
  kind: 'snapshot' as const,
  body: {
    name: 'phishing',
    version: 1,
    updatedAt: '2026-08-05T00:00:00.000Z',
    entries: ['bad.test'],
  },
}

beforeEach(() => {
  indexedDB.deleteDatabase('okolos')
  closeDb()
})

describe('a real signature, checked for real', () => {
  it('accepts what the publisher signed', async () => {
    const pub = await publisher()
    const db = await openDb()
    const result = await updateFeed(db, await pub.sign(SNAPSHOT), createVerifier(pub.publicKeyBase64), () => NOW)

    expect(result.accepted).toBe(true)
    expect((await readFeed(db, 'phishing'))?.entries).toEqual(['bad.test'])
  })

  it('refuses a body edited after signing', async () => {
    const pub = await publisher()
    const signed = await pub.sign(SNAPSHOT)
    const tampered: SignedUpdate = {
      ...signed,
      update: { kind: 'snapshot', body: { ...SNAPSHOT.body, entries: ['innocent.test'] } },
    }

    const db = await openDb()
    const result = await updateFeed(db, tampered, createVerifier(pub.publicKeyBase64), () => NOW)
    expect(result.accepted).toBe(false)
    expect(await readFeed(db, 'phishing')).toBeNull()
  })

  it('refuses a signature from another key', async () => {
    const real = await publisher()
    const impostor = await publisher()
    const db = await openDb()

    const result = await updateFeed(
      db,
      await impostor.sign(SNAPSHOT),
      createVerifier(real.publicKeyBase64),
      () => NOW,
    )
    expect(result.accepted).toBe(false)
  })

  it('treats an unusable key as "not verified", never as "fine"', async () => {
    const pub = await publisher()
    const db = await openDb()
    const result = await updateFeed(db, await pub.sign(SNAPSHOT), createVerifier('not base64 at all'), () => NOW)
    expect(result.accepted).toBe(false)
  })
})

describe('what survives a refusal', () => {
  it('keeps the last verified version in force', async () => {
    const pub = await publisher()
    const db = await openDb()
    await updateFeed(db, await pub.sign(SNAPSHOT), createVerifier(pub.publicKeyBase64), () => NOW)

    const impostor = await publisher()
    const bad = await impostor.sign({
      kind: 'snapshot' as const,
      body: { ...SNAPSHOT.body, version: 2, entries: [] },
    })
    const result = await updateFeed(db, bad, createVerifier(pub.publicKeyBase64), () => NOW)

    expect(result.accepted).toBe(false)
    expect(result.inForce?.version).toBe(1)
    expect((await readFeed(db, 'phishing'))?.entries).toEqual(['bad.test'])
  })

  it('writes the refusal to the journal rather than swallowing it', async () => {
    // A feed that quietly stopped updating looks exactly like one with nothing
    // new to say. The difference has to be visible somewhere.
    const pub = await publisher()
    const impostor = await publisher()
    const db = await openDb()
    await updateFeed(db, await impostor.sign(SNAPSHOT), createVerifier(pub.publicKeyBase64), () => NOW)

    const journal = await db.getAll('journal')
    expect(journal).toHaveLength(1)
    expect(journal[0]).toMatchObject({ kind: 'error' })
    expect(String(journal[0]?.detail?.explain)).toMatch(/not signed by the expected key/i)
  })
})

describe('deltas over the real path', () => {
  it('applies onto the version in force and stores the result', async () => {
    const pub = await publisher()
    const verify = createVerifier(pub.publicKeyBase64)
    const db = await openDb()
    await updateFeed(db, await pub.sign(SNAPSHOT), verify, () => NOW)

    const delta = await pub.sign({
      kind: 'delta' as const,
      body: {
        name: 'phishing',
        base: 1,
        version: 2,
        updatedAt: '2026-08-06T00:00:00.000Z',
        added: ['worse.test'],
        removed: ['bad.test'],
      },
    })
    await updateFeed(db, delta, verify, () => NOW)

    const stored = await readFeed(db, 'phishing')
    expect(stored?.entries).toEqual(['worse.test'])
    expect(stored?.version).toBe(2)
  })
})
