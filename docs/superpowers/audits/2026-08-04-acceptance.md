# Acceptance — pipeline run 2026-08-04 (P0–P5 brief, walking skeleton delivered)

- **Scope:** the whole REQ table (31 rows) from
  [../briefs/2026-08-04-okolos-p0-p5.md](../briefs/2026-08-04-okolos-p0-p5.md)
- **Method:** ladder walk per REQ — decision → spec section → contract and its
  failure behaviour → task → change → executed test → surface and docs. Absences
  became new REQ rows **before** this table was written.
- **Base:** commit `53b25f2`, 151 unit tests, 10 e2e specs, two builds

## What the run actually delivered

The brief covers five releases. This run built **the walking skeleton and the
gates**, which is R1 minus its three remaining surfaces. Reading the table
below as "R1 is done" would be wrong, and the rows say so individually.

## Ladder walk

Legend: **DONE** — every rung present, test executed and seen to fail against a
planted defect · **PARTIAL** — implemented, one rung thin · **PLANNED** — belongs
to a later release, no work claimed.

| REQ | Verdict | Evidence / what is missing |
|---|---|---|
| REQ-01 core-* browser-free | **DONE** | `eslint.config.js` rule + `tools/gates/bundle-scan.test.ts`. Shown red by planting `document.querySelector`; that planting exposed the flat-config override bug |
| REQ-02 contracts + storage v1 | **DONE** | `packages/contracts/src/*`, `packages/storage/src/schema.ts`; 15 tests incl. the model-only property invariant |
| REQ-03 stage 1 diff | **DONE** | `apps/extension/src/content/collect.ts`; 20 hidden-text cases; false-positive corpus is a gate |
| REQ-04 rules and signatures | **DONE** | `packages/core-injection/src/signals.ts`; 100% recall / 0 FP on the corpus; regression proven by widening the vocative rule |
| REQ-05 ONNX classifier | **PLANNED (R1, not started)** | No inference host, no model, no "no signal ⇒ no inference" test. **R1 is not complete without it** |
| REQ-06 banner + inspector | **PARTIAL** | Banner built and e2e-covered (SCN-003). Inspector SCR-04 is not built — the content script logs evidence to the console instead |
| REQ-07 first run <30s | **PLANNED (R1, not started)** | SCR-01 does not exist; SCN-001/002 remain `draft` |
| REQ-08 single egress + audit log | **DONE** | `packages/net/*`; three enforcement levels; planted `fetch` in `ui` shown red |
| REQ-09 performance budgets | **PARTIAL** | Traversal budget measured in real Chromium (`e2e/budget.spec.ts`), planted missing-measure shown red. **Memory ceiling (≤64 MB) is unmeasured** → new REQ-33 |
| REQ-10 … REQ-26 | **PLANNED (R2–R5)** | No work claimed. Sanitizer, agent gate, feeds, URL and page guards, downloads, credentials, recovery, extension guard, worker and public status page |
| REQ-27 cross-browser | **PARTIAL** | Both builds produced and gated; the Firefox-only bug in the content script was found by review, not by a test. **No Firefox e2e** → new REQ-34 |
| REQ-28 zero leaking egress, export/wipe | **PARTIAL** | Egress gate DONE. Export reachable from the options page; **wipe exists as a function nobody can call from the UI** → new REQ-32 |
| REQ-29 WCAG 2.2 AA | **PARTIAL** | axe green on options and popup. The banner is unreachable to axe by design (closed shadow root) and is covered by unit tests instead — stated in `e2e/a11y.spec.ts` |
| REQ-30 AGPL + HIBP attribution | **DONE** | `tools/licensing.test.ts`; UI attribution assertion arrives with the leak features, noted in the test |
| REQ-31 UX chain does not drift | **DONE** | `docs/ux/lint.py` in CI; SCN-003/019 moved to `implemented` with `file:line`, SCR-03/10 to `built` |

## New REQ rows created by this walk

Added to the frozen list, not substituted for anything:

| REQ | Requirement | How it will be verified | Release |
|---|---|---|---|
| REQ-32 | Wipe is reachable from the settings UI, with the confirmation that names what will be deleted | e2e SCN-023 | R2 |
| REQ-33 | Background memory ceiling (≤64 MB) is measured, not assumed | CI measurement against a large-page session | R2 |
| REQ-34 | Firefox end-to-end harness on `web-ext`, so REQ-27 rests on a test rather than on a build | web-ext run of SCN-003 | R1 |

## Coverage summary

| Status | Count |
|---|---|
| DONE | 8 |
| PARTIAL | 5 |
| PLANNED (later release, no claim) | 21 |
| **Total (31 original + 3 new)** | **34** |

**Carry-over ledger: 9 items.** Web3, proactive feeds, sync and carer mode, OCR,
email, journal passphrase, store publication, Figma mockups, Firefox e2e (now
also REQ-34). Counted here beside the verdict so "green" is not read as "done".

## Scope and limits

- **Covered:** every REQ row was walked; the eight DONE rows each have a test
  that was seen red against a planted defect.
- **Not covered:** R2–R5 features were not started and are not claimed. The
  Firefox runtime path is exercised by no test.
- **Could not verify:** deploy (stage 8) — the worker does not exist yet and the
  Cloudflare token is an outstanding human step; CI has not run on the remote
  yet, so the workflow file is asserted by reading, not by a green run.
- **Open questions:** none blocking; the classifier's model choice (22M ONNX)
  stays a spec assumption until it is measured on the corpus.

## Verdict

**REFINE.** The design held: nothing found in this run argued for redoing an
artefact. What the walk exposed is unfinished work, correctly located — R1 needs
REQ-05, REQ-06's inspector and REQ-07 before it can be called a release, and
three thin rungs became REQ rows rather than footnotes.
