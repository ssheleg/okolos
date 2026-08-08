#!/usr/bin/env node
/**
 * The archive you upload, built by one command that refuses to lie.
 *
 *   node tools/package.mjs           # builds, checks, writes dist/release/*.zip
 *   node tools/package.mjs --check   # every check, no archive
 *
 * Why a command and not a runbook: this session has twice paid for a step that
 * lived in a document. The feeds table stayed empty because publishing was a
 * sentence someone had to remember, and the feed's own source spent a release
 * in a temporary file for the same reason. A release is the worst place to
 * discover that habit.
 *
 * What it refuses to package, in order of how badly it would end:
 *
 *   - a build carrying the test hooks. Those open the shadow roots, which is
 *     exactly the property the in-page surfaces rest on: an open root lets a
 *     hostile page read and remove the warning about itself. Shipping that is
 *     shipping the vulnerability the product exists to prevent.
 *   - a manifest naming a file the package does not contain — an icon, a
 *     locale, a page. The browser rejects it, but only after the upload.
 *   - a stale build. The archive is made from a build this command performed,
 *     not from whatever was in `dist` from an afternoon of experiments.
 */
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from 'node:fs'
import path from 'node:path'

const root = path.resolve(import.meta.dirname, '..')
const dist = path.join(root, 'apps/extension/dist')
const out = path.join(dist, 'release')
const TARGETS = ['chrome', 'firefox']
const checkOnly = process.argv.includes('--check')

function die(message) {
  console.error(`\npackage: ${message}`)
  process.exit(1)
}

const ok = (message) => console.log(`   ok    ${message}`)

/** Everything in a directory, relative to it. */
function filesIn(dir, prefix = '') {
  const found = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    if (entry.isDirectory()) found.push(...filesIn(path.join(dir, entry.name), rel))
    else found.push(rel)
  }
  return found
}

/**
 * Every path the manifest points at.
 *
 * Read from the JSON rather than from a list here: a manifest field added next
 * year is a file this would otherwise stop checking, silently.
 */
function referencedPaths(manifest) {
  const paths = new Set()
  const walk = (value) => {
    if (typeof value === 'string') {
      if (/\.(js|html|css|png|json)$/.test(value) && !value.startsWith('http')) paths.add(value)
    } else if (Array.isArray(value)) {
      for (const item of value) walk(item)
    } else if (value && typeof value === 'object') {
      for (const item of Object.values(value)) walk(item)
    }
  }
  walk(manifest)
  return [...paths]
}

console.log('\n── build, so the archive is of something this command made')
if (!checkOnly || !existsSync(dist)) {
  execFileSync('pnpm', ['build'], { cwd: root, stdio: 'inherit' })
}

for (const target of TARGETS) {
  const dir = path.join(dist, target)
  console.log(`\n── ${target}`)
  if (!existsSync(dir)) die(`${target} was not built`)

  const manifestPath = path.join(dir, 'manifest.json')
  if (!existsSync(manifestPath)) die(`${target} has no manifest.json`)
  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'))

  // The one that would ship the vulnerability.
  const content = readFileSync(path.join(dir, 'content.js'), 'utf8')
  if (content.includes('"open"') || content.includes("'open'")) {
    die(
      `${target} carries the test hooks: its shadow roots are open, which lets a page ` +
        `read and remove the warning about itself. Build without --with-test-hooks.`,
    )
  }
  ok('shadow roots are closed — no test hooks in this build')

  const present = new Set(filesIn(dir))
  const missing = referencedPaths(manifest).filter((file) => !present.has(file))
  if (missing.length > 0) {
    die(`${target}'s manifest names files the package does not contain:\n     ${missing.join('\n     ')}`)
  }
  ok(`every file the manifest names is in the package (${present.size} files)`)

  if (manifest.default_locale !== undefined) {
    const locale = `_locales/${manifest.default_locale}/messages.json`
    if (!present.has(locale)) die(`${target} declares default_locale ${manifest.default_locale} and has no ${locale}`)
    const messages = JSON.parse(readFileSync(path.join(dir, locale), 'utf8'))
    const asked = [...JSON.stringify(manifest).matchAll(/__MSG_([A-Za-z0-9_]+)__/g)].map((m) => m[1])
    const absent = asked.filter((key) => messages[key] === undefined)
    if (absent.length > 0) die(`${target}'s manifest asks for messages that are not in ${locale}: ${absent.join(', ')}`)
    ok(`default locale ${manifest.default_locale} answers every __MSG__ the manifest uses`)
  }

  if (Object.keys(manifest.icons ?? {}).length === 0) die(`${target} declares no icons`)
  ok(`icons declared: ${Object.keys(manifest.icons).join(', ')}`)

  if (checkOnly) continue

  mkdirSync(out, { recursive: true })
  const archive = path.join(out, `okolos-${target}-${manifest.version}.zip`)
  rmSync(archive, { force: true })
  // `-X` drops the extra attributes that make two archives of identical bytes
  // differ; the store cares about none of them and a reviewer diffing two
  // releases does.
  execFileSync('zip', ['-q', '-r', '-X', archive, '.'], { cwd: dir })

  const bytes = statSync(archive).size
  const digest = createHash('sha256').update(readFileSync(archive)).digest('hex')
  console.log(`\n   ${path.relative(root, archive)}`)
  console.log(`   ${bytes.toLocaleString('en-US')} bytes`)
  console.log(`   sha256 ${digest}`)
}

console.log(
  checkOnly
    ? '\nevery check passed; no archive written (--check)'
    : '\nready to upload. The sha256 above is what you compare against the store listing.',
)
