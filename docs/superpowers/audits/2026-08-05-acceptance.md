# Acceptance — 2026-08-05

Every requirement in the brief, checked against what is in the repository and
what the gates actually assert. The bar is the one used throughout: a
requirement is DONE when a test would go red without it, and PARTIAL when the
missing part is named rather than implied.

## The numbers

| | |
|---|---|
| Requirements | 37 — 35 DONE, 2 PARTIAL (REQ-25, REQ-37) |
| Scenarios | 26 of 26 implemented |
| Screens | every screen with a scenario is built |
| Unit tests | 663, in 56 files |
| End-to-end (Chromium) | 49 specs |
| End-to-end (Firefox) | 4 checks, via geckodriver |
| Packages | 17 (`core-*` are pure by lint rule and by bundle scan) |

## What is PARTIAL, and exactly which part

**REQ-37 — the ONNX session.** The session, the WebGPU→WASM fallback, the
per-browser host (offscreen in Chrome, background page in Firefox), the weights
cache and every honest-unavailability path ship and are tested. The benchmark
and the corpus-quality measurement do not exist, because both need weights, and
which weights is a licence decision the repository cannot make on a user's
behalf (human step 4). Until it is made, `createOnnxRuntime()` returns null, the
host reports `no-runtime`, stage 3 never fires, and no surface claims a page was
checked by a model that is absent.

**REQ-25 — the worker.** Router, schema and the 180-day sweep are written and
covered by 13 tests. The deploy smoke test waits on a Cloudflare API token
(human step 1).

## Coverage that is unit-only, and why

These scenarios are implemented and tested, but not through a browser:

- **SCN-012, SCN-013 (downloads).** Driving a real download through an
  extension in Playwright is not stable enough to gate a build on. The judge and
  the background handler are covered directly.
- **SCN-017, SCN-018 (extensions).** A test profile cannot have other
  extensions installed to change under it.
- **SCN-026 (public status).** The page is not deployed; its rendering and the
  worker's routes are covered separately.
- **SCN-014, SCN-016 (password, leak repair).** Covered through the modules and
  the audit-log assertions rather than a page.

Each of these is a statement about test reach, not about whether the feature
exists.

## Gates, and what each would catch

| Gate | Would catch |
|---|---|
| ESLint boundary rules | a `core-*` package reaching for a browser API or the network |
| `tools/gates/bundle-scan.test.ts` | the same thing surviving into the built artefact — and it did fire once, on the word "browser." in a comment |
| `tools/manifest.test.ts` | a permission added without the feature that justifies it |
| `tools/licensing.test.ts` | the HIBP attribution disappearing from the README |
| `e2e/scn-019.spec.ts` | a request leaving without an audit entry written first |
| `e2e/memory.spec.ts` | the background context passing 64 MB, measured through DevTools rather than assumed |
| `docs/ux/lint.py` | a scenario, flow or screen record drifting from the others |
| `pnpm test:e2e:firefox` | a Chrome-only assumption in shared code |

## Human steps, unchanged from intake

1. **Cloudflare API token** — blocks the worker deploy and the smoke test.
2. **Ed25519 feed-signing key** — the verifier and the whole refusal path are
   built and tested against real generated keys; what is missing is the
   publisher's own key.
3. **Chrome Web Store account** — for distribution.
4. **Choice of classifier weights** — the licence question behind REQ-37.

Nothing else in the project waits on a person.
