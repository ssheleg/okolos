#!/usr/bin/env node
/**
 * Signs a feed and publishes it, in one step that cannot be half-done.
 *
 *   node tools/publish-feed.mjs feed.json          # sign, upload, verify live
 *   node tools/publish-feed.mjs feed.json --dry-run
 *
 * The signing key never leaves this machine and the worker never signs, so
 * these are the only two places the private half is used: here, and in
 * `tools/sign-feed.mjs`, which this calls rather than reimplements.
 *
 * Why one command: the feed table stayed empty because publishing was a
 * sentence in a runbook. A step performed by hand is a step skipped when late.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const proxy = path.join(root, 'apps/proxy')
const dryRun = process.argv.includes('--dry-run')
const input = process.argv.find((arg) => arg.endsWith('.json'))

function die(message) {
  console.error(`publish-feed: ${message}`)
  process.exit(1)
}

if (!input) die('name a JSON file holding the feed update: { kind, body }')
if (!existsSync(input)) die(`${input} does not exist`)

/** Reads ~/.okolos/cloudflare.env without sourcing it. */
function loadEnv() {
  const file = path.join(homedir(), '.okolos/cloudflare.env')
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*(?:export\s+)?([A-Z0-9_]+)=(?:'([^']*)'|"([^"]*)"|(.*))\s*$/.exec(line)
    if (m) process.env[m[1]] ??= m[2] ?? m[3] ?? m[4]
  }
}
loadEnv()

console.log('\n── sign')
const signed = execFileSync('node', [path.join(root, 'tools/sign-feed.mjs'), input], {
  encoding: 'utf8',
})
const parsed = JSON.parse(signed)
const name = parsed.update?.body?.name
if (!name) die('the update has no body.name, so there is nothing to publish it under')
console.log(`   ${name} v${parsed.update.body.version}, ${parsed.update.body.entries?.length ?? 0} entries`)

console.log('\n── verify the signature against the key that ships')
const check = path.join(tmpdir(), 'okolos-feed-signed.json')
writeFileSync(check, signed)
execFileSync('node', [path.join(root, 'tools/sign-feed.mjs'), '--check', check], {
  stdio: 'inherit',
})

console.log('\n── publish')
if (dryRun) {
  console.log('   skipped: --dry-run')
  process.exit(0)
}

// Written through a file rather than inlined: a signed body on a command line
// is a body mangled by quoting.
const sql = path.join(tmpdir(), 'okolos-feed-publish.sql')
const escaped = signed.replace(/'/g, "''")
writeFileSync(
  sql,
  `INSERT INTO feeds (name, body, updated_at) VALUES ('${name}', '${escaped}', '${new Date().toISOString()}')\n` +
    `ON CONFLICT(name) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at;\n`,
)
execFileSync(
  'npx',
  ['wrangler', 'd1', 'execute', 'okolos', '--config', 'wrangler.generated.toml', '--remote', '--yes', `--file=${sql}`],
  { cwd: proxy, stdio: 'inherit', env: process.env },
)

console.log('\n── smoke: what the extension will actually fetch')
const base = process.env.OKOLOS_WORKER_URL ?? 'https://okolos-proxy.sergeysheleg4.workers.dev'
const response = await fetch(`${base}/feeds/${name}?cb=${parsed.update.body.version}`)
if (!response.ok) die(`the worker answered ${response.status} for /feeds/${name}`)
const served = await response.text()
if (served !== signed) die('what the worker serves is not byte-for-byte what was signed')
console.log(`   ok    /feeds/${name} serves exactly what was signed`)
console.log(`\npublished ${name} v${parsed.update.body.version}`)
