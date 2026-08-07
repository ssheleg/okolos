#!/usr/bin/env node
/**
 * Deploying the proxy worker, end to end and idempotently.
 *
 *   node tools/deploy-worker.mjs            # render config, apply schema, deploy, smoke
 *   node tools/deploy-worker.mjs --dry-run  # do everything except the three mutating steps
 *
 * Every step here was once a line in a runbook. A runbook step that is
 * performed by hand is performed differently each time and skipped when it is
 * late; this exists so the post-deploy list is empty rather than short.
 *
 * Credentials come from the environment, or from ~/.okolos/cloudflare.env,
 * which is mode 0600 and outside every repository. Nothing here prints a
 * token, and the rendered config is gitignored because it carries a database
 * id the checked-in template deliberately leaves as `set-at-deploy`.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import path from 'node:path'

import { renderConfig } from './deploy-config.mjs'

const root = path.resolve(import.meta.dirname, '..')
const proxy = path.join(root, 'apps/proxy')
const dryRun = process.argv.includes('--dry-run')

function die(message) {
  console.error(`deploy-worker: ${message}`)
  process.exit(1)
}

function step(label) {
  console.log(`\n── ${label}`)
}

/** Reads the env file without sourcing it, so a stray command in it cannot run. */
function loadEnv() {
  const file = path.join(homedir(), '.okolos/cloudflare.env')
  if (!existsSync(file)) return
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = /^\s*(?:export\s+)?([A-Z0-9_]+)=(?:'([^']*)'|"([^"]*)"|(.*))\s*$/.exec(line)
    if (m) process.env[m[1]] ??= m[2] ?? m[3] ?? m[4]
  }
}

function wrangler(args, { capture = false } = {}) {
  return execFileSync('npx', ['wrangler', ...args], {
    cwd: proxy,
    encoding: 'utf8',
    stdio: capture ? ['inherit', 'pipe', 'inherit'] : 'inherit',
    env: process.env,
  })
}

loadEnv()

for (const name of ['CLOUDFLARE_API_TOKEN', 'CLOUDFLARE_ACCOUNT_ID', 'OKOLOS_D1_ID']) {
  if (!process.env[name]) {
    die(`${name} is not set. Put it in ~/.okolos/cloudflare.env (mode 0600) or the environment.`)
  }
}

step('render the deploy config')
const template = readFileSync(path.join(proxy, 'wrangler.toml'), 'utf8')
let rendered
try {
  rendered = renderConfig(template, process.env.OKOLOS_D1_ID)
} catch (cause) {
  die(cause.message)
}
const configPath = path.join(proxy, 'wrangler.generated.toml')
writeFileSync(configPath, rendered)
console.log(`   wrote ${path.relative(root, configPath)} (gitignored)`)

step('apply the schema (CREATE TABLE IF NOT EXISTS — safe to repeat)')
if (dryRun) console.log('   skipped: --dry-run')
else wrangler(['d1', 'execute', 'okolos', '--remote', '--yes', '--file=schema.sql'])

step('deploy')
if (dryRun) console.log('   skipped: --dry-run')
else wrangler(['deploy', '--config', 'wrangler.generated.toml'])

step('smoke: the deployed worker answers as itself')
if (dryRun) {
  console.log('   skipped: --dry-run')
  process.exit(0)
}

const listRaw = wrangler(['deployments', 'list', '--config', 'wrangler.generated.toml'], {
  capture: true,
})
const host = /https:\/\/([a-z0-9-]+\.[a-z0-9-]+\.workers\.dev)/i.exec(listRaw)?.[1]
const base = process.env.OKOLOS_WORKER_URL ?? (host ? `https://${host}` : null)
if (!base) {
  die('could not determine the worker URL. Set OKOLOS_WORKER_URL and re-run to smoke-test it.')
}

const checks = []
async function check(name, fn) {
  try {
    await fn()
    checks.push([name, true, ''])
  } catch (cause) {
    checks.push([name, false, String(cause.message ?? cause)])
  }
}

await check('/healthz answers 200', async () => {
  const res = await fetch(`${base}/healthz`)
  if (res.status !== 200) throw new Error(`status ${res.status}`)
})

await check('/status/domain answers for a domain nobody listed', async () => {
  const res = await fetch(`${base}/status/domain?domain=example.test`)
  if (!res.ok) throw new Error(`status ${res.status}`)
  const body = await res.json()
  // The point of the endpoint: an unlisted domain gets a stated "not listed",
  // not a 404 that a caller has to interpret.
  if (body.listed !== false) throw new Error(`expected listed:false, got ${JSON.stringify(body)}`)
})

await check('the D1 binding is live — a query reaches a table that exists', async () => {
  // If the schema had not been applied, /status/domain would surface a D1
  // error rather than a verdict. This asserts the distinction explicitly.
  const res = await fetch(`${base}/status/domain?domain=example.test`)
  const text = await res.text()
  if (/no such table|D1_ERROR/i.test(text)) throw new Error(text.slice(0, 200))
})

for (const [name, ok, detail] of checks) {
  console.log(`   ${ok ? 'ok  ' : 'FAIL'}  ${name}${detail ? ` — ${detail}` : ''}`)
}
const failed = checks.filter(([, ok]) => !ok)
if (failed.length) {
  console.error(`\n${failed.length} smoke check(s) failed against ${base}`)
  process.exit(1)
}
console.log(`\nall smoke checks passed against ${base}`)
