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

### 2026-08-04 — a Firefox suite that would have passed with no extension loaded

- **Symptom:** the first Firefox e2e run had one spec fail and one pass. The
  passing one asserted "no banner on an ordinary page" — which is also true of
  a browser with no extension at all. Diagnostics showed the add-on was never
  installed: the profile held only Firefox's built-ins.
- **Surfaced at:** the first Firefox run, before any of it was trusted.
- **Owned by:** the fixture — a harness that cannot tell "absent" from "silent"
  produces green for the wrong reason.
- **Root cause:** installing an unpacked extension through a profile proxy file
  no longer works on this Firefox build; it needs the remote-debugging install
  path that `web-ext` and geckodriver use.
- **Fix, by grade:** mechanical — the fixture now fails unless a background page
  appears, and the Firefox spec runs in its own project so a known-open REQ does
  not sit red in the default suite while also not being claimed as covered.
- **Catches it next time:** the fixture's own precondition.

### 2026-08-04 — measuring the background needed three attempts, two of which looked like product bugs

- **Symptom:** the memory ceiling could not be read. `context.newCDPSession(worker)`
  throws — Playwright attaches to a Page or Frame, never a service worker. Inside
  the worker there is nothing to ask: extension service workers expose neither
  `performance.memory` nor `measureUserAgentSpecificMemory()`. Then the spec
  timed out waiting for a banner that was on screen.
- **Surfaced at:** the REQ-33 work.
- **Owned by:** the test, all three times.
- **Root cause:** the last one is worth naming — `locator.waitFor()` waits for
  *visibility*, and the banner host has no box of its own because everything
  inside its shadow root is positioned fixed. `toHaveCount()` asserts presence.
- **Fix, by grade:** mechanical — the heap is read through the DevTools port
  (`Runtime.getHeapUsage`), and presence assertions replaced visibility waits.
- **Note that expires in two runs:** when a surface renders only inside a shadow
  root, assert presence rather than visibility.

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

### 2026-08-05 — a gate that swallowed the user's own clicks

- **Symptom:** on a page with an unresolved finding, a real human click was
  cancelled and then quietly waved through as "ungated" — the action never
  happened, and nothing said so.
- **Surfaced at:** stage 6, by the unit test "does not hold a submit the person
  made themselves".
- **Owned by:** stage 5 — the interceptor cancelled the event before asking
  whether the gate applied at all.
- **Root cause:** `preventDefault()` ran before `assessAction()`. The ordering
  looked harmless because the assessment usually says "ask".
- **Fix, by grade:** structural — decide first, cancel only when the assessment
  is not already settled as ungated. A guard that eats real clicks is a broken
  page, which is the failure mode most likely to get a security tool removed.
- **Catches it next time:** `apps/extension/src/content/agent-gate.test.ts:88`
  and `e2e/scn-010.spec.ts:94`.

### 2026-08-05 — the replay guard, proven by a crash

- **Symptom:** with the `#replaying` flag removed, the allowed action was
  re-caught by the same listener, gated again, allowed again: the test run died
  with a V8 out-of-memory rather than an assertion.
- **Surfaced at:** stage 6, planted-defect check on REQ-11.
- **Owned by:** stage 6 — worth recording because the failure was not a red
  assertion but a dead process, which is easy to misread as flakiness.
- **Root cause:** replaying an action dispatches the very event that is being
  intercepted.
- **Fix, by grade:** none needed — the guard was already there; the plant
  confirmed it is load-bearing.
- **Catches it next time:** "does not gate the action it was just told to allow".

### 2026-08-05 — a bundle gate tripped by an English full stop

- **Symptom:** the core-* browser-API scan failed on `packages/core-queue/dist/diff.js`,
  reporting the token `browser.` — which came from the sentence "in a test and
  in a browser." in a doc comment.
- **Surfaced at:** stage 6, on the first full run after the module was written.
- **Owned by:** nobody — this is the gate behaving correctly.
- **Root cause:** the scan is a substring search over built output, and tsc
  keeps comments.
- **Fix, by grade:** the comment was reworded. Loosening the scan to skip
  comments would trade a certain, cheap false positive for an uncertain, silent
  false negative, and the whole value of that gate is that it cannot be talked
  out of a match.
- **Catches it next time:** `tools/gates/bundle-scan.test.ts`.

### 2026-08-05 — an e2e assertion that was true for two different reasons

- **Symptom:** removing the popup's "no active URL" guard did not turn any e2e
  red. The verdict stayed `unknown` — but by a different route: `new URL(null)`
  throws, and the catch returns the same answer.
- **Surfaced at:** stage 6, planted-defect check on REQ-12.
- **Owned by:** stage 6 — the assertion was weaker than it looked.
- **Root cause:** opened as a tab rather than from the toolbar, the popup has no
  `activeTab` grant, so both guards collapse to the same output.
- **Fix, by grade:** documentary — the unit tests separate the two causes and do
  go red; the e2e now states in a comment exactly which claim it proves
  (the product refuses to say "clean" about a page it cannot see) so nobody
  reads more into it later.
- **Catches it next time:** `apps/extension/src/popup/state.test.ts:63`.

### 2026-08-05 — a requirement whose last mile is a licence, not code

- **Symptom:** REQ-37 asks for a bench under 250 ms and a measured corpus
  quality. Both need weights, and every candidate classifier ships under
  acceptable-use terms a public AGPL repository cannot restate for its users.
- **Surfaced at:** stage 5, while wiring the session.
- **Owned by:** the brief — human step 4 has named this since intake.
- **Fix, by grade:** the runtime is a documented seam (`createOnnxRuntime`
  returns null) and every layer above degrades honestly: the host reports
  `no-runtime`, stage 3 never fires, no surface claims a page was checked by a
  model that is absent. REQ-37 is recorded PARTIAL with the two missing numbers
  named, rather than closed on the half that was buildable.
- **Catches it next time:** `apps/extension/src/background/inference.test.ts`
  asserts the `no-runtime` state explicitly, so the absence is a tested
  behaviour rather than an oversight.

### 2026-08-05 — the detector that would have flagged every install page

- **Symptom:** the first ClickFix rule fired on "copy this, paste it in your
  terminal, press Enter" plus a scripted copy. That is a ClickFix page. It is
  also every developer documentation page in the world, where the copy button
  fires `execCommand('copy')`.
- **Surfaced at:** stage 6, writing the false-positive half of the corpus —
  not by a failing test, but by asking what else matches.
- **Owned by:** stage 5 — the rule was written from the attack outward instead
  of from the population of pages it would run against.
- **Root cause:** two of the three signals are shared with legitimate pages. The
  pretext ("verify you are human", "fix this error") is the only one that is
  never innocent: no genuine verification has ever required a terminal.
- **Fix, by grade:** the pretext is now required for any verdict at all. Cost:
  a ClickFix variant with unfamiliar pretext wording is missed. Benefit: the
  extension does not accuse npm's install page.
- **Catches it next time:** `packages/core-traps/src/clickfix.test.ts` carries
  the documentation page as a named negative, and removing the pretext
  requirement turns three tests red.

### 2026-08-05 — a guard nothing tested, kept for what it claims

- **Symptom:** removing the `isTrusted` check on copy events failed nothing.
- **Surfaced at:** stage 6, planted-defect check on REQ-16.
- **Root cause:** with the pretext rule in place, the check no longer changes
  whether a warning appears — only what the warning says. The banner's sentence
  is "this page copied a command for you", which is untrue when the user copied
  it themselves.
- **Fix, by grade:** the watcher now reports the signals behind each warning
  through a callback — used to journal the trap, and asserted in a test that
  goes red without the guard. A claim worth making is a claim worth testing.

### 2026-08-05 — three watchers installed on every DOM mutation

- **Symptom:** two ClickFix banners on one page, and a blocking banner that made
  the fixture's own button unclickable — surfacing as an e2e failure two
  requirements after the mistake was made.
- **Surfaced at:** stage 6, on the full e2e run. Lint, typecheck and every unit
  test were green throughout: the code was valid, just in the wrong place.
- **Owned by:** stage 5 — a mechanical edit anchored on the string
  `void safely(scan)`, which appears twice in the content script. Each of the
  three wirings was therefore also inserted inside `rescanSoon`, where it ran
  on every mutation, up to twice a second, installing a fresh lookalike check,
  trap watcher and credential watcher each time.
- **Fix, by grade:** the duplicated block was removed. The deeper fix is the
  habit: an anchor for a mechanical edit has to be checked for uniqueness
  before it is used, and the result read back rather than assumed.
- **Catches it next time:** the e2e that failed. It is worth saying plainly that
  no unit test could have caught this — the fault was in composition, not in any
  module, and only a real page running the real script exhibited it.

### 2026-08-05 — a headline that was true half the time

- **Symptom:** the ClickFix banner said "This page copied a command for you to
  run" in the case where nothing had been copied yet.
- **Surfaced at:** stage 6, while correcting the e2e above — the assertion had
  to be written against what the banner actually says, and what it said was
  wrong.
- **Root cause:** the detector reports two confidence levels and the banner had
  one sentence.
- **Fix, by grade:** two headlines, and the warning now says "Nothing has been
  copied yet" when that is the case. The earlier moment is the more useful one
  to warn at; it is not a reason to describe it inaccurately.

### 2026-08-05 — an accessibility bug that only the sweep could find

- **Symptom:** every checkbox in the recovery checklist was unlabelled to a
  screen reader. The `<label>` was there, next to the input, carrying the right
  text — and associated with nothing.
- **Surfaced at:** stage 6, on extending the axe sweep to the surfaces built
  since it was written.
- **Owned by:** stage 5, and worth naming precisely: the markup looked correct
  in the source and correct on screen. Only a tool that reads it the way a
  screen reader does could tell the difference.
- **Fix, by grade:** an id on the input and `for` on the label, plus a unit test
  asserting the association for every step — so the next checklist cannot
  regress it silently.
- **Standing instruction (7):** when a new user-facing surface ships, it joins
  the axe sweep in the same change. Four surfaces had accumulated outside it,
  and the one with the defect was the one written most recently.

### 2026-08-05 — a test that said it would grow, and did not

- **Symptom:** the HIBP attribution existed only in the README. The leak panel
  and the password banner both display data derived from Have I Been Pwned,
  whose CC BY 4.0 terms require credit *wherever the data appears*.
- **Surfaced at:** a backlog sweep after acceptance — not by a failing gate.
- **Owned by:** the gate itself, which had written its own excuse: "No feature
  uses it yet… the UI assertion arrives with the leak features in R4, and this
  test grows then." R4 shipped and the test did not grow. A comment describing
  future work does not perform it.
- **Fix, by grade:** the attribution renders in every state of the panel,
  including the empty one — "nothing found" is still a result computed from
  someone else's data — and on the password banner. The licensing gate now
  asserts the UI source, and an e2e asserts it on screen. Removing it turns
  three tests red.
- **Standing instruction (8):** a test comment that defers an assertion to a
  later release names the release *and* the requirement, so the ledger row
  carries the obligation. A promise living only in a comment is not tracked by
  anything.
