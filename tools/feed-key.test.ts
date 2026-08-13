import { execFileSync } from 'node:child_process'
import { Buffer } from 'node:buffer'
import { createPublicKey, generateKeyPairSync, sign, verify } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { serialiseUpdate, type FeedUpdate } from '../packages/core-feeds/src/apply.js'

/**
 * REQ-20's key, on both sides of the signature.
 *
 * The extension carries the public half compiled in; `tools/sign-feed.mjs`
 * holds the other end. What is asserted here is the pair: that the shipped key
 * is a real Ed25519 key rather than the placeholder it was for four releases,
 * that the signing tool produces something that key accepts, and — the rule
 * that matters most — that no private key material has entered the repository.
 */

const root = path.resolve(import.meta.dirname, '..')
const feeds = readFileSync(path.join(root, 'apps/extension/src/background/feeds.ts'), 'utf8')
const shipped = /FEED_PUBLIC_KEY = '([^']*)'/.exec(feeds)?.[1] ?? ''

const UPDATE: FeedUpdate = {
  kind: 'snapshot',
  body: {
    name: 'phish',
    version: 1,
    updatedAt: '2026-08-07T00:00:00.000Z',
    entries: ['evil.test'],
  },
}

/** Rebuild an importable key from the 32 raw bytes the extension carries. */
function shippedKey() {
  const spki = Buffer.concat([
    Buffer.from('302a300506032b6570032100', 'hex'),
    Buffer.from(shipped, 'base64'),
  ])
  return createPublicKey({ key: spki, format: 'der', type: 'spki' })
}

describe('the key the extension ships', () => {
  it('is not the placeholder', () => {
    expect(shipped).not.toContain('REPLACE')
    expect(shipped).not.toBe('')
  })

  it('is 32 raw bytes, the form importKey("raw", …) accepts', () => {
    expect(Buffer.from(shipped, 'base64')).toHaveLength(32)
  })

  it('is importable as an Ed25519 key', () => {
    // Weaker than it looks: Node imports 32 bytes of 0xff without complaint,
    // because it does not check the point is on the curve. What actually
    // proves the key is the right one is the pair test below — this only
    // catches a value that is not a key at all.
    expect(() => shippedKey()).not.toThrow()
  })
})

/**
 * Where the private half is, and is not.
 *
 * ADR-0002 says publication needs the machine that holds the key, and that
 * moving it into CI is the thing not to do. So this file asks a different
 * question depending on where it runs, and both questions are assertions —
 * neither is a skip.
 *
 * On the machine: the pair matches. `.githooks/pre-push` runs the whole suite
 * before every push, so the pair is checked by the only party that can check
 * it, on every change that leaves here.
 *
 * On CI: the key is **absent**, and that absence is asserted rather than
 * tolerated. A first attempt at this wired `secrets.OKOLOS_FEED_KEY` into the
 * workflow so the pair test could run there — which would have put the private
 * half on GitHub to satisfy a gate, the exact trade ADR-0002 refuses.
 */
const KEY_FILE = path.join(homedir(), '.okolos/feed-signing-key.pem')
const hasKey = process.env.OKOLOS_FEED_KEY !== undefined || existsSync(KEY_FILE)
const onCI = process.env.CI === 'true'

describe.runIf(onCI)('the private half never reaches CI', () => {
  it('is not in the environment or on the runner', () => {
    // Not "we could not find it, so nothing was checked". This is the ADR-0002
    // invariant stated as a test: the runner must not be able to sign.
    expect(process.env.OKOLOS_FEED_KEY, 'the signing key was passed to CI').toBeUndefined()
    expect(existsSync(KEY_FILE), 'a signing key exists on the runner').toBe(false)
  })
})

describe('somebody able to check the pair actually did', () => {
  it('is either CI without the key, or a machine with it', () => {
    // The hole this closes: with neither branch true, both blocks below skip
    // and the pair goes unchecked while the suite reports green. A machine that
    // cannot verify the pair has to say so rather than pass over it.
    expect(
      onCI || hasKey,
      `no signing key here and this is not CI, so the key pair went unchecked. Put a PKCS8 PEM at ${KEY_FILE} or set OKOLOS_FEED_KEY.`,
    ).toBe(true)
  })
})

describe.runIf(hasKey && !onCI)('the signing tool and the shipped key are one pair', () => {
  it('signs an update the shipped key verifies', () => {
    const signed = execFileSync(
      'node',
      [path.join(root, 'tools/sign-feed.mjs'), '-'],
      { input: JSON.stringify(UPDATE), encoding: 'utf8' },
    )
    const { signature } = JSON.parse(signed) as { signature: string }
    // Verified here rather than through --check, so this test fails if the
    // tool's own verifier and its signer ever agree with each other while
    // disagreeing with the extension.
    const ok = verify(
      null,
      Buffer.from(serialiseUpdate(UPDATE), 'utf8'),
      shippedKey(),
      Buffer.from(signature, 'base64'),
    )
    expect(ok).toBe(true)
  })

  it('refuses a signature made by any other key', () => {
    const { privateKey } = generateKeyPairSync('ed25519')
    const impostor = sign(null, Buffer.from(serialiseUpdate(UPDATE), 'utf8'), privateKey)
    const file = path.join(mkdtempSync(path.join(tmpdir(), 'okolos-')), 'signed.json')
    writeFileSync(
      file,
      JSON.stringify({ update: UPDATE, signature: impostor.toString('base64') }),
    )
    expect(() =>
      execFileSync('node', [path.join(root, 'tools/sign-feed.mjs'), '--check', file], {
        encoding: 'utf8',
      }),
    ).toThrow()
  })
})

describe('the private half is not in the repository', () => {
  const tracked = execFileSync('git', ['ls-files'], { cwd: root, encoding: 'utf8' })
    .split('\n')
    .filter(Boolean)

  it('reads the index, so an empty list cannot pass as a clean tree', () => {
    expect(tracked.length).toBeGreaterThan(50)
  })

  it('tracks no file whose contents are a private key', () => {
    // Contents, not filename: a private key committed as notes.txt is still a
    // private key, and *.pem in .gitignore would not have stopped it.
    const leaked = tracked.filter((file) => {
      let body: string
      try {
        body = readFileSync(path.join(root, file), 'utf8')
      } catch {
        return false // binary or unreadable — no PEM header to find
      }
      return /-----BEGIN (?:[A-Z ]+ )?PRIVATE KEY-----/.test(body)
    })
    expect(leaked, `private key material in: ${leaked.join(', ')}`).toEqual([])
  })

  it('ignores the shapes a key arrives in', () => {
    const ignore = readFileSync(path.join(root, '.gitignore'), 'utf8')
    expect(ignore).toMatch(/^\*\.pem$/m)
    expect(ignore).toMatch(/^\*\.key$/m)
  })
})
