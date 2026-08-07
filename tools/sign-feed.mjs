#!/usr/bin/env node
/**
 * Signing a feed update, publisher side.
 *
 * The extension verifies with a key compiled into the build; this is the other
 * half. It reads the update from a file or stdin, serialises it with the exact
 * function the verifier uses — importing it rather than reimplementing it, so
 * the two cannot drift — and prints a SignedUpdate.
 *
 *   node tools/sign-feed.mjs update.json > signed.json
 *   node tools/sign-feed.mjs --check signed.json     # verify against the shipped key
 *
 * The private key is read from OKOLOS_FEED_KEY (a PKCS8 PEM) or, failing that,
 * ~/.okolos/feed-signing-key.pem. It is never read from the repository, and
 * nothing here writes it anywhere.
 */
import { Buffer } from 'node:buffer'
import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

// The source, not a build artefact: core-feeds publishes its TypeScript
// directly and has no dist, and importing the same file the extension compiles
// is what makes "these two cannot drift" structural rather than a promise.
import { serialiseUpdate } from '../packages/core-feeds/src/apply.ts'

const DEFAULT_KEY = path.join(homedir(), '.okolos', 'feed-signing-key.pem')

function die(message) {
  console.error(`sign-feed: ${message}`)
  process.exit(1)
}

function loadPrivateKey() {
  const inline = process.env.OKOLOS_FEED_KEY
  if (inline) return createPrivateKey(inline)
  try {
    return createPrivateKey(readFileSync(DEFAULT_KEY, 'utf8'))
  } catch (cause) {
    die(
      `no signing key. Set OKOLOS_FEED_KEY to a PKCS8 PEM, or place one at ${DEFAULT_KEY}.\n  (${cause.message})`,
    )
  }
}

function readInput(file) {
  const raw = file && file !== '-' ? readFileSync(file, 'utf8') : readFileSync(0, 'utf8')
  try {
    return JSON.parse(raw)
  } catch (cause) {
    die(`input is not JSON: ${cause.message}`)
  }
}

/** The verifier refuses anything it cannot recognise; refuse it here too, louder. */
function assertUpdateShape(update) {
  if (update === null || typeof update !== 'object') die('input is not an object')
  if (update.kind !== 'snapshot' && update.kind !== 'delta') {
    die(`kind must be "snapshot" or "delta", got ${JSON.stringify(update.kind)}`)
  }
  if (update.body === null || typeof update.body !== 'object') die('update has no body')
  if (typeof update.body.name !== 'string' || update.body.name === '') die('body.name is required')
  if (!Number.isInteger(update.body.version)) die('body.version must be an integer')
}

const args = process.argv.slice(2)

if (args[0] === '--check') {
  const signed = readInput(args[1])
  if (!signed?.update || typeof signed.signature !== 'string') {
    die('--check expects a SignedUpdate: { update, signature }')
  }
  const source = readFileSync(
    new URL('../apps/extension/src/background/feeds.ts', import.meta.url),
    'utf8',
  )
  const shipped = /FEED_PUBLIC_KEY = '([^']+)'/.exec(source)?.[1]
  if (!shipped) die('could not read FEED_PUBLIC_KEY out of feeds.ts')

  // Rebuild an SPKI key from the 32 raw bytes the extension carries, so this
  // checks the key that actually ships rather than whatever is on this disk.
  const spki = Buffer.concat([
    Buffer.from('302a300506032b6570032100', 'hex'),
    Buffer.from(shipped, 'base64'),
  ])
  const key = createPublicKey({ key: spki, format: 'der', type: 'spki' })
  const ok = verify(
    null,
    Buffer.from(serialiseUpdate(signed.update), 'utf8'),
    key,
    Buffer.from(signed.signature, 'base64'),
  )
  console.log(ok ? 'valid — this signature verifies against the shipped key' : 'INVALID')
  process.exit(ok ? 0 : 1)
}

const update = readInput(args[0])
assertUpdateShape(update)
const signature = sign(null, Buffer.from(serialiseUpdate(update), 'utf8'), loadPrivateKey())
process.stdout.write(`${JSON.stringify({ update, signature: signature.toString('base64') }, null, 2)}\n`)
