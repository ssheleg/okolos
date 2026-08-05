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

### 2026-08-05 — a screen recorded as designed, and never built

- **Symptom:** SCR-09 (extensions watch) sat at `designed` in `screens.md` while
  SCN-017 and SCN-018 were marked implemented. The detection, the snapshot diff
  and the journal entry all existed; the user could not see the list or turn
  anything off.
- **Surfaced at:** a backlog sweep, by reading the screen record rather than the
  scenario table.
- **Owned by:** stage 5 — the scenarios were marked implemented on the strength
  of their detection half.
- **Fix, by grade:** the screen is built, with a Disable that disables. A
  security screen whose only verb is "review" leaves the user where they
  started.
- **Catches it next time:** the UX linter now flags a screen still marked
  `designed` that already carries Coverage, and errors when the table row and
  the record disagree — drift in the direction nobody notices, because the
  record understates the product and no reader goes looking.

### 2026-08-05 — the bundle scanner could not tell mention from use

- **Symptom:** `core-extensions` could not ship. Its whole job is to search
  other people's code for `document.cookie` and `localStorage.getItem`, and the
  gate scans built output for those very tokens.
- **Owned by:** the gate, which was a raw substring search.
- **Fix, by grade:** the scan now strips comments, then regex literals, then
  string literals, and reads what is left. A browser API cannot be called from
  inside a string, so nothing is lost — asserted by a test that requires real
  calls to still be caught, which stops the stripper from being "fixed" into
  stripping everything. The two rejected alternatives were exempting the
  package, which blinds the gate for everything in it, and splicing the string
  literals so the scanner cannot read them, which makes the source worse to
  satisfy a tool.
- **Found on the way:** sixteen `*.test.js` files were being emitted into
  package `dist/`. Test fixtures contain deliberate examples of the calls these
  gates forbid, so the artefact the gate reads was carrying its own false
  positives. Tests are now excluded from every built package.

### 2026-08-05 — fourteen documents that were never there

- **Symptom:** every screen record named a wireframe at `wireframes/SCR-NN.md`.
  The directory did not exist. Fourteen dangling paths, from the first commit.
- **Surfaced at:** a backlog sweep. Not by the linter, which validates markdown
  links `[text](path)` and never looked at a bare path in a field.
- **Owned by:** the linter, and worth stating precisely: it checked the form of
  a reference rather than the fact of it, so a whole class of reference was
  invisible to it.
- **Fix, by grade:** the wireframes are now generated from the renderers by
  `pnpm wireframes`, and a test asserts the committed files still match. A
  screen that gains a control fails the build until its wireframe is
  regenerated. Hand-writing them was the obvious alternative and the wrong one:
  a wireframe for a screen that is already built is a fourth copy of the truth —
  after the code, the scenario and the screen record — and the one nobody
  updates.
- **The trap the generator test almost fell into:** two empty strings compare
  equal, so a silently-failing extraction would have turned all fourteen
  assertions green on nothing. A separate test requires every screen to yield
  more than two elements.
- **Catches it next time:** `docs/ux/lint.py` now errors on a named wireframe
  that is not on disk, and `tools/wireframes.test.ts` on one that is stale.

### 2026-08-05 — CI described a project that no longer existed

- **Symptom:** a step named "scenarios SCN-003 and SCN-019" was running
  fifty-five specs across fifteen files, and the comment above it explained that
  Firefox was deliberately absent "and sits in the carry-over ledger rather than
  being quietly claimed here" — two jobs above the Firefox job, which had been
  added and had been green for hours.
- **Surfaced at:** a backlog sweep. Nothing was failing; CI was correct in what
  it *did* and wrong in what it *said*.
- **Owned by:** every commit that added a spec without reading the file it was
  running under.
- **Fix, by grade:** names and comments corrected, and `tools/ci.test.ts` now
  asserts the claims — no step may name an individual scenario while running all
  of them. Comments are not testable in general; this one was, because the
  failure mode was specific.
- **The heavier find, same file:** the Firefox job pinned
  `firefox-1538`, a Playwright build number, in an env var. An unrelated
  dependency bump would have turned that job red for a reason having nothing to
  do with the product — which is precisely the pressure that gets a browser
  quietly dropped from CI. The runner now finds the newest installed build
  itself and, when there is none, prints one sentence naming the command to run
  instead of a stack trace.
- **And a stale green in the local shortcut:** `pnpm gates` skipped `pnpm build`,
  so the bundle scanners inside it read whatever `dist/` happened to be lying
  around. It builds first now, and a test asserts the order.

### 2026-08-05 — the first file anyone opens, describing a different project

- **Symptom:** `docs/README.md` said the project was at pipeline stage 2 with
  "the skeleton in progress", listed 31 requirements and 3 human steps, and
  ended with "none of steps 1–5 has been started". By then there were 37
  requirements, 18 packages, 3 applications and a closed acceptance.
- **Surfaced at:** a backlog sweep. Nothing broke — it simply misled every
  reader at the moment they most needed orientation.
- **Owned by:** every commit that added a package without opening the map.
- **Fix, by grade:** rewritten to the truth, given a code map, and gated.
  `tools/docs.test.ts` asserts only what is falsifiable: every package and
  application on the map, the counts, and the requirement totals counted from
  the brief rather than remembered. "Phase" is a judgement and stays one.
- **The gate earned its keep in the first minute:** it failed on the count,
  because the map said 17 packages and there are 18. Written from memory, the
  wrong number would have shipped.
- **And the same anchor bug as before, in the same session:** a `replace` whose
  anchor had been removed by an earlier edit in the same script silently did
  nothing, so the row never appeared. The habit that ends it is asserting the
  anchor exists before writing — now done in the edit script itself.

### 2026-08-05 — a plan that had quietly become a claim

- **Symptom:** `coverage-matrix.md` listed forty-two attack vectors with a
  milestone each, written the day before implementation began. Seventeen of them
  were built. The other twenty-five read exactly like the seventeen.
- **Surfaced at:** a documentation sweep, reading it as a stranger would.
- **Owned by:** nobody in particular, which is the problem: a forward-looking
  document ages into a claim without anyone editing it.
- **Fix, by grade:** a header saying outright what the document is and is not,
  and a Готово column. Seventeen rows carry a tick, each citing the requirement
  and the spec behind it; the rest carry a dash and the header says a row
  without a tick is an intention and must not be read as a capability. The
  `v0.3`/`v0.7` milestone labels are named as planning-only — they correspond to
  nothing in the repository, which ships R1–R5.
- **Catches it next time:** `tools/docs.test.ts` resolves every tick against the
  requirement ledger and checks the cited spec exists. Ticking an unbuilt row
  fails two tests.
- **Same sweep, the module map:** it named `core-url`, `core-page`, `playbooks`
  and `ui/a11y` — modules from the plan that never existed under those names,
  because the work landed inside `core-feeds`, `core-lookalike`, `core-recovery`
  and an axe sweep in the e2e suite. Now gated against the workspace: a map may
  not name a package or a UI surface that is not on disk.

### 2026-08-05 — I wrote the vacuous green I had spent the day hunting

- **Symptom:** `e2e/scn-017.spec.ts` opened with
  `const state = await panel.getAttribute('data-state'); if (state !== 'ready') return`.
  It reads as caution. It behaves as a skip: every assertion after it is
  abandoned, the run is green, and the report says the scenario passed.
- **Surfaced at:** a sweep for the pattern, two hours after writing it — in the
  same session whose recurring finding is that a green nobody has watched fail
  is not evidence.
- **Owned by:** me, and the honest reason is worth recording: the branch was
  written defensively because a test profile *might* not grant `management`.
  Defensive branching in a test is how a test stops testing.
- **What it would have hidden:** losing the `management` permission — precisely
  the regression that screen exists to survive. Dropping it from the manifest
  now turns both tests red; before, it turned them green.
- **Fix, by grade:** both assertions are unconditional. `management` is in the
  manifest, so `ready` is not a maybe, and the inventory count is asserted
  exactly (`Installed (0)`) rather than by substring.
- **Catches it next time:** `tools/e2e-quality.test.ts` fails any spec
  containing a bare early return. The rule is narrow on purpose — a
  `return <value>` is a helper computing something, and `memory.spec.ts`
  legitimately returns `-1`, which its caller rejects with
  `toBeGreaterThan(0)`. A branch that genuinely cannot be asserted belongs in a
  unit test where the condition can be constructed, not in an end-to-end run
  where it is left to chance.

### 2026-08-05 — the same shape again, thirteen times, in unit tests

- **Symptom:** thirteen assertions across `core-gate` and `core-feeds` sat
  inside `if (!outcome.accepted) { … }` and `if (asked(assessment)) expect(…)`.
  When the branch is not taken the assertions do not run and the test passes.
- **Surfaced at:** a sweep for the pattern, one iteration after finding it in
  an end-to-end spec. The same hand wrote both.
- **Root cause, precisely:** TypeScript needs the discriminant narrowed before
  the union's fields are reachable, and `if` is the first tool that comes to
  hand. It narrows and it skips, and only the narrowing is intended.
- **Fix, by grade:** narrowing helpers that throw — `settled()`, `asking()`,
  `refusal()`, `accepted()`. They narrow identically and turn a wrong shape into
  a failure with a sentence naming what came instead. Flipping the
  human-gesture rule now reports "expected an assessment that settles on its
  own, got one that asks a human" rather than passing.
- **Catches it next time:** `tools/test-quality.test.ts` sweeps every unit test
  and every spec in the repository — found rather than listed — for both shapes:
  `if (x) expect(…)` and an `if` block opening on an assertion. It also asserts
  it found something to check, because a sweep over an empty list is the same
  vacuous green in a different costume.

### 2026-08-05 — a requirement closed on a module nothing called

- **Symptom:** `analysePackage` — the whole of REQ-24, obfuscation, `eval`,
  remote code and endpoints — had no caller anywhere in the product. It was
  written, exported, and covered by fixtures. Nothing in the extension ever ran
  it, and the screen's `analysisNote` was hard-coded to `null`.
- **Surfaced at:** a sweep for exported entry points with no call site, nine
  iterations after the requirement was marked DONE.
- **Owned by:** the acceptance bar. REQ-24's evidence was "unit на фикстурах",
  and that bar was honestly met — which is exactly how a requirement gets closed
  over unreachable code. A test proves a function works; only a caller proves it
  runs.
- **What the screen record already said:** SCR-09's Elements line listed
  "Inspect package". It was never built, so the analyser had nowhere to be
  called from and the field for its output stayed null. The record was right and
  the screen was short of it.
- **Fix, by grade:** the control exists. No browser hands one extension
  another's code, so the only runtime path is a file the user chooses — read in
  the page, analysed in the page, never uploaded. The screen now says that
  outright instead of leaving a silent null, which would read as "nothing to
  report" rather than "this cannot be done from here".
- **Catches it next time:** an e2e feeds a real file through the control and
  asserts findings appear. Before this commit there was no code path from the
  product to the analyser at all, so nothing could have caught it — which is the
  argument for sweeping exports against call sites rather than trusting the
  ledger.
