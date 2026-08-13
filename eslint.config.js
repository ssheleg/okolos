// Flat config. Two rules here are not style — they are the machine enforcement
// of promises the product makes to its users (REQ-01 and REQ-08). Weakening
// them silently voids the guarantee, so they live at the top of the file.

import js from '@eslint/js'
import tseslint from 'typescript-eslint'

/** The single module allowed to touch the network. See packages/net. */
const TRANSPORT = 'packages/net/src/transport.ts'

/** Browser globals a pure detector must never reach for. */
const BROWSER_GLOBALS = [
  'window',
  'document',
  'chrome',
  'browser',
  'navigator',
  'localStorage',
  'sessionStorage',
  'indexedDB',
]

/** Every way out to the network. */
const NETWORK_GLOBALS = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource']

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      '**/.wrangler/**',
      '**/coverage/**',
      'graphify-out/**',
    ],
  },

  js.configs.recommended,
  ...tseslint.configs.recommended,

  // REQ-08 — exactly one file may perform network I/O, so the audit log can
  // be a precondition of sending rather than a description of what happened.
  //
  // Ordering matters and is load-bearing: in flat config the last matching
  // block REPLACES a rule's options rather than merging them. core-* is
  // excluded here and gets its own, stricter list below — without the
  // exclusion this block would silently overwrite it, leaving the boundary
  // rule enforced in the file and absent in the linter. That failure was
  // found by planting a defect; keep both the ignore and the order.
  {
    files: ['packages/**/*.ts', 'apps/**/*.ts', 'tools/**/*.ts'],
    ignores: [TRANSPORT, 'packages/core-*/**', '**/*.test.ts', 'tools/gates/**'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...NETWORK_GLOBALS.map((name) => ({
          name,
          message: `Network I/O belongs in ${TRANSPORT} only (REQ-08). Use net.request().`,
        })),
      ],
    },
  },

  // REQ-01 — core-* is pure: no browser APIs, no network, no clock, no
  // randomness. This is what makes detectors reproducible on a corpus.
  {
    files: ['packages/core-*/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        ...BROWSER_GLOBALS.map((name) => ({
          name,
          message:
            'core-* must stay browser-free (REQ-01). Take the value as a parameter instead.',
        })),
        ...NETWORK_GLOBALS.map((name) => ({
          name,
          message: 'core-* must not reach the network (REQ-01/REQ-08).',
        })),
      ],
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['*platform*', 'webextension-polyfill', '*/net*'],
              message: 'core-* must not depend on platform or network layers (REQ-01).',
            },
          ],
        },
      ],
      'no-restricted-properties': [
        'error',
        { object: 'Date', property: 'now', message: 'Pass the timestamp in (REQ-01 purity).' },
        { object: 'Math', property: 'random', message: 'Pass an id generator in (REQ-01 purity).' },
      ],
    },
  },

  // Build and test-harness scripts run in Node, not in a page or a worker.
  // The Firefox harness is the one exception that touches both: `document`
  // appears inside functions it serialises into the browser via executeScript,
  // never in the Node process itself.
  {
    files: ['tools/**/*.mjs', '*.config.js'],
    languageOptions: {
      globals: {
        console: 'readonly',
        process: 'readonly',
        URL: 'readonly',
        fetch: 'readonly',
        // `fetch` without a deadline is a tool that can hang forever on a
        // source that stopped answering, so the timeout signal belongs beside it.
        AbortSignal: 'readonly',
        setTimeout: 'readonly',
        document: 'readonly',
        window: 'readonly',
        Buffer: 'readonly',
        // Two tools run code inside the browser via page.evaluate, where the
        // page's globals are the ones in scope, not Node's.
        chrome: 'readonly',
        indexedDB: 'readonly',
      },
    },
  },

  {
    files: ['**/*.test.ts', '**/*.bench.ts', 'tools/**/*.ts'],
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      // Mocks need typed parameters they never read, to pin the call signature.
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
)
