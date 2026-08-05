# Retrospective — okolos

One file per project. Stage 0 of every run reads the standing instructions
below **in full**; they bind the run. The list is capped at ten, and pruning
happens before adding.

## Standing instructions

1. **Plant a defect in every gate before calling it done.** Four of the four
   gates checked this way in the first run had holes: a lint rule silently
   overwritten by a later flat-config block, a build failure reported as
   *skipped*, a performance assertion passing on a missing measurement, and an
   e2e negative case that could not distinguish a working detector from a
   broken one. A green nobody has watched fail is not evidence.
2. **Check the artefact, not only the source.** ESLint reads the files it is
   pointed at, and flat config *replaces* rule options rather than merging them.
   Every runtime promise gets a second check against the built bundle.
3. **Absence of data must never read as a pass.** Assert that the measurement
   exists before comparing it to a ceiling; assert that the list was read before
   showing it as empty.
4. **Cross-browser claims rest on tests, not on builds.** A build that compiles
   for Firefox proved nothing: `chrome.runtime` awaited there returns
   `undefined` and every verdict was silently dropped. Until a test runs in the
   second browser, REQ-27-style rows are PARTIAL.
5. **Read the gate output before pushing.** One commit went out with lint red
   because the command was chained past its own failure.
6. **Say what was not covered, in the same breath as what was.** Every audit
   carries a Scope and limits section, and the carry-over count is printed
   beside the verdict.

## Run stamps

- **2026-08-04** — P0–P5 brief; stages 0–10 (stage 8 blocked on a human step).
  Delivered the walking skeleton and its gates: 151 unit tests, 10 e2e specs,
  two loadable builds, 8 REQ DONE / 5 PARTIAL / 21 PLANNED, 3 new REQ rows from
  the acceptance walk. Verdict REFINE.

## Entries

### 2026-08-04 — a lint rule that existed in the file and not in the linter

- **Symptom:** planting `document.querySelector` in `packages/core-injection`
  produced no lint error, while the same planting for `fetch` did.
- **Surfaced at:** stage 5, first planted-defect check.
- **Owned by:** stage 5 — the rule was written and never exercised.
- **Root cause:** in ESLint flat config the last matching block replaces a
  rule's options; the network block matched `packages/**` including `core-*` and
  overwrote the browser-globals list.
- **Fix, by grade:** mechanical — the network block now excludes `core-*`, the
  stricter list is ordered last, and a bundle scan repeats the check against the
  built output. Standing instructions 1 and 2 carry the general lesson.
- **Catches it next time:** `tools/gates/bundle-scan.test.ts`.

### 2026-08-04 — a gate that reported "skipped" when the build broke

- **Symptom:** a planted defect that failed typecheck turned six gate tests into
  *skipped*; a reader scanning for failures would have seen none.
- **Surfaced at:** stage 5, second planted-defect check.
- **Owned by:** stage 6 — the gate's own failure mode was never tested.
- **Root cause:** the build ran in `beforeAll` and threw.
- **Fix, by grade:** mechanical — the build error is captured and asserted by a
  dedicated test, "the build failed, so nothing below was really checked".
- **Catches it next time:** that test.

### 2026-08-04 — a performance assertion that passed on no measurement

- **Symptom:** with the `performance.measure` call removed, the large-page
  budget spec still passed, because a missing measurement returns `-1`.
- **Surfaced at:** stage 6.
- **Owned by:** stage 6.
- **Root cause:** the assertion compared to a ceiling without first requiring a
  reading.
- **Fix, by grade:** mechanical — both specs assert `>= 0` before comparing.
  Standing instruction 3 generalises it.
- **Catches it next time:** `e2e/budget.spec.ts`.
