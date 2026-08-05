#!/usr/bin/env node
/**
 * Builds a loadable extension for each browser.
 *
 * Three separate passes, because the targets genuinely differ:
 *   - the content script must be one self-contained IIFE (Chrome does not
 *     support modules in content scripts, and a split chunk would simply fail
 *     to load on the page it is meant to protect);
 *   - the background is a module in both browsers;
 *   - the pages are ordinary multi-page HTML.
 *
 * The manifests are hand-written per browser rather than generated. They are
 * the security surface of the whole product — the permission list is the
 * promise a reviewer and a user actually read — and a generated manifest is
 * one indirection away from nobody noticing a permission appear.
 */

import { readFile, writeFile, mkdir, rm, cp } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { build } from 'vite'

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const app = path.join(root, 'apps/extension')
const targets = ['chrome', 'firefox']

const shared = {
  configFile: false,
  logLevel: 'warn',
  resolve: { conditions: ['import', 'module', 'browser', 'default'] },
}

for (const target of targets) {
  const outDir = path.join(app, 'dist', target)
  await rm(outDir, { recursive: true, force: true })
  await mkdir(outDir, { recursive: true })

  // 1. Content script — single file, IIFE, no code splitting.
  await build({
    ...shared,
    build: {
      outDir,
      emptyOutDir: false,
      target: 'chrome116',
      rollupOptions: {
        input: path.join(app, 'src/content/index.ts'),
        output: { entryFileNames: 'content.js', format: 'iife', inlineDynamicImports: true },
      },
    },
  })

  // 2. Background — module.
  await build({
    ...shared,
    build: {
      outDir,
      emptyOutDir: false,
      target: 'chrome116',
      rollupOptions: {
        input: path.join(app, 'src/background/index.ts'),
        output: { entryFileNames: 'background.js', format: 'es', inlineDynamicImports: true },
      },
    },
  })

  // 3. Pages.
  await build({
    ...shared,
    root: app,
    build: {
      outDir,
      emptyOutDir: false,
      target: 'chrome116',
      rollupOptions: {
        input: {
          options: path.join(app, 'src/options/index.html'),
          popup: path.join(app, 'src/popup/index.html'),
        },
        output: { entryFileNames: '[name].js', chunkFileNames: 'chunks/[name].js' },
      },
    },
  })

  // Vite keeps the source folder structure for HTML; flatten it so the
  // manifest can name popup.html and options.html directly.
  for (const page of ['options', 'popup']) {
    await cp(path.join(outDir, 'src', page, 'index.html'), path.join(outDir, `${page}.html`))
  }
  await rm(path.join(outDir, 'src'), { recursive: true, force: true })

  const manifest = await readFile(path.join(app, `manifest.${target}.json`), 'utf8')
  await writeFile(path.join(outDir, 'manifest.json'), manifest)

  console.log(`built ${target} → apps/extension/dist/${target}`)
}
