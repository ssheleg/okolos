# Instructions

- Following Playwright test failed.
- Explain why, be concise, respect Playwright best practices.
- Provide a snippet of code with the fix, if possible.

# Test info

- Name: firefox.spec.ts >> warns in Firefox when hidden text is addressing an assistant
- Location: e2e/firefox.spec.ts:24:1

# Error details

```
Error: the extension did not load into Firefox: no background page. Profile proxy-file installation does not work on this build — see REQ-34.
```

# Test source

```ts
  1  | import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
  2  | import { tmpdir } from 'node:os'
  3  | import path from 'node:path'
  4  | import { fileURLToPath } from 'node:url'
  5  | import { firefox, test as base, type BrowserContext } from '@playwright/test'
  6  | 
  7  | const here = path.dirname(fileURLToPath(import.meta.url))
  8  | const BUILD = path.join(here, '..', 'apps', 'extension', 'dist', 'firefox-e2e')
  9  | const ADDON_ID = 'okolos@ssheleg.dev'
  10 | 
  11 | /**
  12 |  * Firefox, the browser our cross-browser claim rests on and the one no test
  13 |  * touched until now.
  14 |  *
  15 |  * Playwright cannot install an extension through its API, so the profile is
  16 |  * prepared the way Firefox itself supports: a proxy file under
  17 |  * `<profile>/extensions/<addon-id>` holding the path to the unpacked build.
  18 |  * Signature enforcement is turned off by preference, which works because
  19 |  * Playwright ships an unbranded build rather than a release channel one.
  20 |  *
  21 |  * This exists because review — not a test — caught a bug that broke every
  22 |  * verdict in Firefox while Chrome stayed green. A claim about a browser nobody
  23 |  * runs is a claim about a build, not about behaviour. REQ-34.
  24 |  */
  25 | export const test = base.extend<{ context: BrowserContext }>({
  26 |   // eslint-disable-next-line no-empty-pattern
  27 |   context: async ({}, use) => {
  28 |     const profile = mkdtempSync(path.join(tmpdir(), 'okolos-ff-'))
  29 |     mkdirSync(path.join(profile, 'extensions'), { recursive: true })
  30 |     writeFileSync(path.join(profile, 'extensions', ADDON_ID), BUILD, 'utf8')
  31 | 
  32 |     const context = await firefox.launchPersistentContext(profile, {
  33 |       firefoxUserPrefs: {
  34 |         'xpinstall.signatures.required': false,
  35 |         'extensions.autoDisableScopes': 0,
  36 |         'extensions.enabledScopes': 5,
  37 |         'extensions.startupScanScopes': 5,
  38 |       },
  39 |     })
  40 | 
  41 |     // Without this, a Firefox that ignored the extension would run every spec
  42 |     // below against a bare browser — and the negative cases ("stays silent on
  43 |     // an ordinary page") would pass by doing nothing at all. A suite that goes
  44 |     // green when the thing under test is absent is worse than no suite.
  45 |     await context.waitForEvent('backgroundpage', { timeout: 10_000 }).catch(() => undefined)
  46 |     if (context.backgroundPages().length === 0) {
> 47 |       throw new Error(
     |             ^ Error: the extension did not load into Firefox: no background page. Profile proxy-file installation does not work on this build — see REQ-34.
  48 |         'the extension did not load into Firefox: no background page. ' +
  49 |           'Profile proxy-file installation does not work on this build — see REQ-34.',
  50 |       )
  51 |     }
  52 | 
  53 |     await use(context)
  54 |     await context.close()
  55 |   },
  56 | })
  57 | 
  58 | export const expect = test.expect
  59 | 
  60 | export async function serve(context: BrowserContext, html: string): Promise<void> {
  61 |   await context.route('https://fixture.test/**', (route) =>
  62 |     route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: html }),
  63 |   )
  64 | }
  65 | 
```