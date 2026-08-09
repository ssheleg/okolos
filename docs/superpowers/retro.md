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
7. **A new user-facing surface joins the accessibility sweep in the same
   change.** Four had accumulated outside it, and the one carrying an
   unlabelled control was the newest.
8. **A test comment that defers an assertion to a later release names the
   release and the requirement**, so the ledger carries the obligation. A
   promise living only in a comment is tracked by nothing — the HIBP
   attribution waited three releases in one.
9. **A number produced by a tool is a claim about the tool** until it has been
   checked against the artefact. Report it as "the diagnostic says X", or
   verify it — never as "X". Reported as fact, a diagnostic's 225 dangling
   edges turned out to be zero.
10. **Confirm a planted defect actually landed, and that it lands on the rule
   you meant to test.** Two wrong citation formats survived a plant that never
   applied, and the green was read as the gate working. The same mistake one
   level deeper: a recovery clause tested with the input that recovers without
   it reports green with the clause deleted.
11. **A test that agrees with the code proves they agree, and nothing else.**
   Four tests in one audit were holding wrong answers steady — two of them the
   same false privacy sentence, at two layers, and one misnamed so that even a
   reader who checked would look at the wrong case. Read what a test asserts
   against what the product *should* do.
12. **A rate limit, a retry budget or a quota must defer, never drop.** Work
   discarded when the budget is full is work nobody re-arms, and the last item
   of a burst is the one an attacker chooses.
13. **A detector that reads wording reads a language, and the language is a
   coverage claim.** Every text-matching detector in this codebase was written
   in English: nine injection signals, the ClickFix page pattern, the
   tech-support pattern. All of them shipped marked DONE, and for the audience
   this product's own watchlist, interstitial copy and documentation are
   written for, they found nothing at all. Name the languages a detector
   matches in its scenario's Known limit, and name the parts that have no
   language — an invisible-character class, a DOM difference, a fact about the
   connection — so nobody re-derives which is which.

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

### 2026-08-05 — a verdict announced to nobody

- **Symptom:** the background judged every download, cancelled the dangerous
  ones, wrote the journal entry — and sent `download/verdict` to a message type
  no context listened for. A blocked file was stopped in silence: the person who
  started it saw nothing at all.
- **Surfaced at:** sweeping the RPC contract for types with a handler and a
  sender, one iteration after the same method found an analyser with no caller.
- **Owned by:** the scenario's own coverage note, which said "unit only" and
  meant it about the *judge* — while SCN-012's UI elements line described a
  blocking banner nobody had built.
- **Fix, by grade:** the banner exists, top frame only, and it says the file was
  already cancelled rather than offering to discard something the browser
  discarded. A clean download says nothing at all — announcing every one of them
  is how a banner becomes wallpaper.
- **Two smaller things it dragged out.** `BannerHandlers.onInspect` was wired to
  the error state's "Try again" button, so every call site read as though it
  opened something; it is `onRetry` now, and one surface had indeed handed it a
  journal it could never show. And `BannerProps` gained a `primaryLabel`
  override, because a variant's default label is right until the surface knows
  better — "Discard the file" for a file the browser already discarded describes
  an action nobody can take.
- **Four dead contract entries:** `page/rescan`, `audit/list`, `data/export` and
  `data/wipe` had neither handler nor caller; the options page reads storage
  directly. Removed.
- **Catches it next time:** `tools/test-quality.test.ts` requires every message
  type to have both a handler and a sender. `rules/refresh` is a named exception
  with its reason — its only sender is an end-to-end test — and a further
  assertion keeps that list from becoming where dead types hide.
- **And the rule caught me writing the thing it forbids:** the exception was
  first implemented as `if (TEST_FACING.has(type)) return` inside the test. The
  unit rule only looked for `if (x) expect(…)`, so it sailed through. It now
  looks for bare early returns too, and the exception is applied where the test
  is created rather than inside one that exists and gives up.

### 2026-08-05 — the finishable list with no finishing move

- **Symptom:** SCR-07's record had promised per-item "resolve" and "not now"
  since it was designed. Neither existed. The queue's only control opened the
  page, so a user could read the list forever and never clear it.
- **Surfaced at:** sweeping the Elements line of every screen record against the
  literal labels its renderer produces — the third level of the same method that
  found an analyser with no caller and a verdict announced to nobody.
- **Owned by:** stage 5. The queue was built around its central claim, "at most
  three things", and the claim it forgot is the one that makes three a number
  worth having: that the list ends.
- **Fix, by grade:** "Done" resolves the finding and the next item is promoted;
  "Not now" ranks it last for a day. Deferring is deliberately not hiding — the
  item stays in the count, because a "not now" that removed it would be a
  dismissal the user never asked for, and a queue people have to lie to stops
  being a queue.
- **Where the deferral lives:** beside the finding, in settings, not inside it.
  The finding record is what the detector saw; "the user is not ready today" is
  not a fact about the page.
- **What the sweep also found, unfixed and now written down:** SCR-08 promises
  grouping by fresh-versus-historical and the actions "Change password" and
  "Check reuse"; SCR-12 promises a trusted-domain list. All three are real gaps
  between record and screen, recorded rather than quietly closed.

### 2026-08-06 — a promise the interface made and the product could not keep

- **Symptom:** the comparison view told the user, in those words, that marking
  an address legitimate "can be undone in settings". There was no such list.
  Trust was granted in one click from a page — "This is legitimate" on a
  lookalike, "Continue anyway" on an interstitial — and could not be taken back
  through the interface at all.
- **Surfaced at:** the promised-vs-built sweep, as a missing control on SCR-12.
  It reads as a small gap and is not: a security product that can only ever
  lower its own guard reaches zero guard eventually, one annoyed click at a
  time.
- **Owned by:** whoever wrote the reassurance. A sentence that describes a
  control is a commitment to build it; writing it first is fine, leaving it is
  not.
- **Fix, by grade:** `ui/trusted` lists every domain with when it was trusted
  and why — the "why" is the user's own past action, which is usually the thing
  they have forgotten. Revoking deletes the exception, rebuilds the blocking
  rules (otherwise the site stays reachable and the revocation is cosmetic), and
  journals the reversal.
- **The assertion that matters:** the e2e checks storage after the click, not
  the list. A revocation that only repaints is the same bug as no revocation,
  and planting exactly that turns the test red.
- **One contract note:** `trust/list` now returns both `domains` and `entries`.
  The lookalike check asks on every navigation and needs only the names; the
  settings list needs the dates. Making the hot path carry the settings payload
  would have been the tidier type and the worse trade.

### 2026-08-06 — no test file had ever been type-checked

- **Symptom:** a test constructing the wrong shape — a required field missing, a
  handler renamed away — compiled, ran and passed. Vitest transpiles without
  checking types, and every package excludes `*.test.ts` from its build.
- **Surfaced at:** writing SCR-08, when a test kept passing against a state type
  that had just gained a required member.
- **Owned by:** a correct decision with an unexamined cost. Tests are excluded
  from the build for a real reason, stated in the tsconfig comment: a fixture
  shipped into `dist/` puts deliberate examples of the very calls the bundle
  gates forbid inside the artefact those gates read. Nobody noticed that
  "excluded from the build" also meant "excluded from `tsc`".
- **What it was hiding:** twenty-four errors. Two were mine from the previous
  cycle — `adapter.test.ts` still sent `page/rescan`, an RPC deleted in the
  contract sweep, and `banner.test.ts` still built `onInspect`, renamed to
  `onRetry` in the same commit. Both renames left dead references and every gate
  stayed green.
- **Fix, by grade:** `tsconfig.tests.json` type-checks tests with `noEmit`, so
  they are checked without being built, and `pnpm typecheck` runs both. The
  wireframe generator got a `.d.mts` beside it — a test that treats its imports
  as `any` cannot catch a rename either.
- **Catches it next time:** removing a required field from a test's state turns
  the gate red, which it did on the plant.

### 2026-08-06 — an interception that never intercepted

- **Symptom:** the leaks e2e routed `cavalier.hudsonrock.com` through
  `page.route` and asserted the coverage line. It passed. The route never fired:
  the lookup is made by the service worker, which `page.route` does not see.
- **Surfaced at:** extending the same test to assert the grouped result, which
  needs the response body and therefore could not pass on nothing.
- **Root cause:** the assertion did not depend on what was intercepted, so the
  interception failing changed nothing. A green that would have been green
  anyway.
- **Fix, by grade:** `context.route`, which covers the worker. The lesson
  generalises past this file: when a test stubs something, at least one
  assertion has to fail if the stub is not used.

### 2026-08-06 — the feature the product could not honestly build

- **The ask:** SCR-13 promised "continue on another device", and five of the
  nine steps in the worst checklist are not browser work — change your email
  password from a different machine, disconnect this one, phone the bank on the
  number printed on your card.
- **The obvious build:** sync. Put the incident and its progress behind an
  account, or a short-lived link, and let it appear on the phone.
- **Why not:** a recovery record says which incident happened to a particular
  person. Shipping it anywhere would trade this product's one real promise for a
  convenience the user can get by pasting text into a note. The scenario, read
  carefully, never asked for sync either: its alt path says the system "shows
  what to do there and preserves progress", and progress already survived.
- **Built instead:** the remaining steps as text, marked with which cannot be
  done here, each carrying its reason. The transport is the user's own — the
  clipboard, an email to themselves, paper.
- **One detail worth keeping:** the text renders whether or not the copy button
  works. A clipboard permission the browser declines must not be the thing that
  strands someone mid-recovery.
- **And an irony handled rather than ignored:** this product warns about pages
  that write to the clipboard. Its own write happens on a real click and shows
  exactly what it copied — which is precisely the distinction its ClickFix
  detector draws.

### 2026-08-06 — the pages had no stylesheet, and the sweep had been lucky

- **Symptom:** adding one button turned the recovery screen's axe run red on
  WCAG 2.2 target size — controls under 24px, too close together.
- **Root cause:** the extension's own pages ship no CSS at all. Every control
  was whatever size the browser made it, and the sweep had passed because the
  elements happened to sit far enough apart.
- **Fix, by grade:** a small shared stylesheet with a minimum target size and
  spacing, imported by all four pages. Deliberately close to nothing — the pages
  are plain HTML on purpose and a design system for four internal screens would
  be its own liability — but it fixes the class rather than the button that
  exposed it. Removing the rule turns the sweep red again.

### 2026-08-06 — the noise that hid the signal, now gated

- **What it was:** the promised-vs-built sweep, run by hand, kept returning
  twelve rows. Six were real gaps — two unwritten buttons, an unreachable
  analyser, a control that could not be revoked. Six were wording: the record
  said "Wipe all data" and the button said "Delete all data".
- **Why the wording mattered anyway:** a twelve-line report where half the lines
  are harmless is a report nobody finishes reading. The noise was not a
  cosmetic problem, it was camouflage.
- **Fix, by grade:** `tools/docs.test.ts` compares every quoted label in a
  screen record's Elements line against the strings its renderer draws,
  normalised for case and punctuation, allowing the renderer to extend the
  record ("Show all" matches "Show all (12 more)"). Renaming a button without
  touching its record turns it red.
- **The rule that makes it possible:** a quoted string in an Elements line means
  "this screen has a control with this label". A description or a reference to
  another screen's control goes unquoted. Three records were rewritten to obey
  it rather than weakening the check to accommodate them.
- **The gate found three more the hand sweep had missed**, one of which was a
  false premise of my own: labels do not all live in the renderer. The leaks
  panel composes its group headings in `core-leaks`. The check now follows a
  renderer's workspace imports one level, which is the truth rather than a
  concession.
- **And it very nearly shipped depending on a gitignored file.** The first
  version read the screen list from a JSON sidecar under `graphify-out/` — a
  directory absent on a fresh clone, so the gate would have failed for everyone
  but me. It reads the generator directly now.

### 2026-08-06 — I reported a defect that was not there

- **What I said:** after rebuilding the knowledge graph, graphify's diagnostic
  printed 225 dangling-endpoint edges, and I reported it as a finding —
  "5.7% of edges point nowhere" — filed it as a task, and repeated it to the
  user. I also said `build_merge` "promises to save and does not".
- **What was true:** the saved graph has 2289 nodes, 3824 edges and **zero**
  dangling endpoints. `build_merge` saved correctly; the file on disk went from
  505 nodes to 2289. Both claims were wrong.
- **Root cause:** the diagnostic reads the raw *extraction*, and on a two-layer
  build that is the wrong scope. The semantic pass legitimately emits edges
  pointing at nodes the AST pass supplies; measured on the semantic layer alone
  they look dangling and are not. Re-measured from the cache: 115 such edges,
  every one resolving against the merged graph, none lost.
- **The mistake underneath:** I read a number off a tool and passed it on
  without checking the artefact it was supposedly about. That is precisely the
  fault this project spent a day hunting in its own gates — an estimate reported
  as a measurement — and the sweep that found it was pointed outward, at the
  code, rather than at what I was saying.
- **Fix, by grade:** `pnpm graph:check` reads `graph.json` — the thing that is
  actually used — and fails on an edge to a node that does not exist. Not a
  repository gate: `graphify-out/` is gitignored and absent on a fresh clone, so
  a test asserting on it would fail for everyone but me. It is a command to run
  after rebuilding.
- **Standing instruction (9):** a number produced by a tool is a claim about the
  tool until it has been checked against the artefact. Report it as "the
  diagnostic says X" or verify it — never as "X".

### 2026-08-06 — a hundred and seven citations, twenty-nine of them rotted

- **Symptom:** the audit checked, for the first time, whether the `file:line`
  references in scenarios.md, screens.md and the acceptance note resolve.
  Twenty-nine of a hundred and seven pointed at a blank line, a closing brace,
  or the middle of a comment. Every one had been correct when written.
- **Root cause:** a line number is a coordinate into a moving target. The UX
  linter validates markdown links and never looked at these — the same blind
  spot that let fourteen wireframe paths point at a directory that did not
  exist.
- **Fix, by grade:** citations name a symbol now, or the file alone where the
  file is the evidence. A symbol survives the code moving and fails loudly when
  it is renamed away.
- **The fix was wrong twice before it was right, and both wrongs looked fine.**
  The first conversion took the nearest declaration above the stale line and
  produced `group.ts:SESSION_MATERIAL` — a private regex cited as the evidence
  for a scenario. It passed the new gate, because the symbol does exist in the
  file. The second took each file's first export and produced type names. Only
  the third — the file's principal exported *action* — says what the scenario
  is actually covered by.
- **What made the first two survive:** I ran the plants, saw them not fire, and
  nearly concluded the gate was fine. They had not applied at all — my grep
  pattern stopped at an underscore. A plant that does not apply is not evidence
  of a working gate, and checking that the plant landed is now part of planting
  one.

### 2026-08-07 — an audit of everything, and what six sweeps found

- **Symptom:** nothing was failing. The suite was green, the UX linter passed,
  the requirement ledger read 35 DONE / 2 PARTIAL, and the graph checked clean.
  The audit was run anyway, on the theory that a green nobody has attacked is a
  green nobody has read.
- **Surfaced at:** a deliberate sweep, not a failure.
- **Owned by:** the gates, mostly — five of the six findings were things a gate
  could have caught and did not.
- **What it found, in the order it found it:**
  1. 29 of 107 `file:line` citations across the UX records and the acceptance
     note pointed at lines that had moved. Converted to symbol citations and
     gated: a cited symbol must exist, and line numbers may not return.
  2. `docs/README.md` claimed 703 unit tests and 55 e2e against an actual 932
     and 63; the acceptance note claimed 663 in 56 files. Volatile counts are
     now the command that reports them.
  3. The standing-instruction list held six entries while retro entries cited
     nine. Stage 0 of every run reads that list, so three rules learned the hard
     way were being skipped by the mechanism meant to stop them recurring.
  4. The licence gate proved this project publishes AGPL-3.0 and credits HIBP,
     and said nothing about the licences of what it links against — the one
     licence question still open (which classifier weights it may carry) had no
     mechanism behind it at all. Now three rules, one of which turns red the
     moment a weight file lands undecided.
  5. Three Playwright failure artefacts, including a binary `trace.zip`, were
     committed with an unrelated feature and were being read into the knowledge
     graph as project documentation.
  6. SCN-014, SCN-015 and SCN-016 sat marked `implemented` in the index table
     while their own records still read `draft` / `Coverage: none yet`. The UX
     linter already had exactly this check — for `screens.md`.
- **What it did not find:** the exports-versus-callers sweep came back clean,
  every gate that was attacked with a planted defect bit, and the requirement
  ledger still holds. One flagged discrepancy — 17 packages versus 18 — was a
  misread: the "17" lives in a retro entry *about* that error being fixed.
- **Prevention:** each finding left a gate behind rather than a corrected
  document. A fix without one is a fix that has to be found again.

### 2026-08-07 — instruction 5, broken in the session that wrote instruction 10

- **Symptom:** the scenarios commit went out with the suite red. `pnpm test`
  had exited 1; the exit code was chained past and read only after the push.
- **Surfaced at:** the next command, one line too late.
- **Owned by:** me. The command was `pnpm test >/tmp/t.log; echo $?` followed
  unconditionally by `git commit && git push`.
- **Root cause:** the failure was mine too — a coverage line I had just written
  cited `packages/net/src/request.ts:sendRequest`, and the export is `request`.
  The citation gate built earlier in the same audit caught it correctly.
- **Prevention:** none new. Standing instruction 5 already says exactly this,
  and it did not help, because it lives in a document and the push lives in a
  shell. The honest note is that a rule read at stage 0 does not survive
  contact with a chained command; only a hook would.

### 2026-08-07 — the instruction that needed a hook, and the deploy that needed running

- **Symptom:** two of the three defects in the worker deploy were invisible to
  reading. `d1 execute` silently used the committed template instead of the
  rendered config and sent `set-at-deploy` as a database id; the worker URL is
  printed by `deploy` and not by `deployments list`, so the first real run
  reached its smoke step with nothing to test — after a deploy that had
  succeeded. The third was a contract written from memory: `/status/domain`
  answers `status: listed | not-listed | unknown`, not `listed: boolean`.
- **Surfaced at:** the first execution. Every gate had been green.
- **Owned by:** the belief that a script reviewed carefully enough does not
  need to be run.
- **What the smoke was worth before it was attacked:** pointed at
  `example.com`, three of four checks failed and one passed — "an unknown path
  is a 404" is true of every wrong host in the world. It reads the body now.
  The strongest check turned out to be the unlisted-domain one, because
  `unknown` is precisely what the worker answers when it cannot reach D1: a
  deploy whose schema never landed fails there rather than passing on a 200.
- **Prevention:** `--smoke-only`, so the checks can be attacked without a
  deploy, and a runbook that records all three traps by name.

- **The other half:** standing instruction 5 — read the gate output before
  pushing — was broken earlier the same day, and the honest note then was that
  a rule in a document cannot stop a chained shell command. `.githooks/pre-push`
  now runs lint, typecheck, unit and the UX linter and refuses the push,
  printing the failing output rather than a summary of it. Verified by planting
  a defect in each of the four.
- **The escape hatch is `OKOLOS_SKIP_GATES=1`, not `--no-verify`,** on purpose:
  `--no-verify` skips the hook silently and leaves no record of what was not
  checked. The override announces itself in two lines.
- **Wiring, not remembering:** `core.hooksPath` is per-clone, so a `prepare`
  script sets it on install and a test asserts both the hook and that script
  exist. A hook nobody's clone runs is a document with a shebang.

### 2026-08-08 — the second browser had four checks, and the money moved

- **Symptom:** none. `pnpm test:e2e:firefox` was green and REQ-27 rested on it.
  The suite made four assertions against sixty-four in Chromium, and three of
  the four were about the banner.
- **Surfaced at:** a deliberate comparison of the two suites' scope, not a
  failure.
- **Owned by:** the decision, correct at the time, to keep the Firefox harness
  small. Small is fine; *arbitrary* is not, and nothing recorded why those four.
- **What changed:** the harness now covers the paths where the engines actually
  differ rather than a convenient subset — Firefox runs a background page
  rather than a service worker, delivers scripted clicks through a different
  path than real ones, and schedules MutationObserver callbacks on its own
  terms. Nine checks: the sanitiser (the sentence is gone from the DOM an
  assistant would read, and the element is marked rather than deleted) and the
  agent gate (a scripted submit is held, and the page does not navigate).
- **What the plant showed:** with the gate uninstalled, Firefox did not merely
  fail the assertion — it navigated to `/transferred?amount=900`. The product
  exists to stop that, and until this run nothing in the second browser would
  have noticed it happening.
- **Two plants that taught more than they were meant to.** Emptying the
  sanitisation plan produced code that threw, so the banner never appeared and
  every downstream check failed for the wrong reason — a red that proves
  nothing. And cloning the held contents instead of moving them still ended
  with a clean DOM, because a re-scan takes the other branch and empties the
  element anyway; the "defect" was a delay, not a defect. Only the third
  attempt — `apply` returning zero and touching nothing — put the injected
  sentence back in the document.
- **Prevention:** standing instruction 10 already covers confirming a plant
  landed. This adds the other half: confirm it landed *as the defect intended*,
  because a plant that breaks compilation or that the product routes around
  produces a red with no information in it.

### 2026-08-08 — a bug hunt, and four defects that no gate was looking for

The previous audit swept documents and gates. This one swept behaviour, and
found four defects plus one gap in the threat model. Every one of them had a
green suite over it.

- **A rate limiter that dropped work instead of deferring it.** The content
  script re-read the page on mutation, capped at two scans a second, and over
  the cap it returned with nothing left to re-arm. A page that mutated hard
  enough to exhaust the budget and then went quiet was never examined in its
  final state — which is exactly where an injection would be placed by anyone
  who read the file. The policy lived in two constants, two module variables
  and a `setTimeout`; nothing tested it because nothing could.

- **A privacy guard blind to percent-encoding, and a product relying on it.**
  The choke point read the raw query, so it caught `?u=https://victim/page` —
  a form nobody writes — and missed the encoded form that every API actually
  uses. It never inspected the path at all, which is where HIBP takes the
  address. Fixing both broke four leak tests, and *that* was the finding: the
  leak check sends the user's address in clear to two third parties and passed
  the guard only because of the encoding. The exception existed and was written
  nowhere. It is declared now — and the panel had been telling the user
  "Checking sends a hashed form of your address, never the address itself."

- **A version of NaN disabled the replay guard permanently.** `version <=
  current.version` is false for NaN, so a NaN was accepted; and once NaN stood
  in force, so did every later update, including a replay of a fixed entry.
  One `parseInt(undefined)` in the publishing pipeline would have done it to
  every client at once.

- **The padding this product asks for was read as a breach.** `Add-Padding`
  makes the API invent zero-count entries so the response size says nothing;
  they were reported as compromises, with the sentence "This password appears
  0 times in breached data".

- **And a gap rather than a bug:** the agent gate covers forms, links and
  buttons inside forms. A scripted click on a plain button that fires `fetch`
  — which is how a modern app transfers money — is not an action "leaving the
  page" by the code's test, and is not gated. SCN-010 promises that no action
  proceeds without a human decision. Filed as #34; the minimum is to narrow the
  promise, and the maximum is a decision about noise.

**Four tests were holding wrong answers in place.** Two asserted the false
privacy sentence — one unit, one e2e — and a third required an unreadable
range response to be a compromise. That third was *misnamed*: "reads a count of
zero as a count, not as absence", feeding `:not-a-number`. A test agreeing with
the code proves they agree, and nothing else; a misnamed one stops even the
reader who checks.

**What the plants taught this round.** One plant did not apply and reported
"green" — the recovery clause for a stored bad version, tested with NaN, which
recovers on its own because comparisons against NaN are false. The clause
protects against a stored *Infinity*, where `3 <= Infinity` is true and the
client refuses every update forever. Same shape as standing instruction 10, one
level deeper: confirm the plant lands, and confirm it lands *on the rule you
think you are testing*.

### 2026-08-08 — three detectors, one language, and an audience that reads another

- **Symptom:** none. Every text detector was green, marked DONE, and had been
  through an acceptance audit.
- **Surfaced at:** a probe that ran the same attacks twice — once in English,
  once in Russian.
- **What it found:** the nine injection signals produced **zero** on five
  Russian attack shapes; the ClickFix page pattern passed a Russian campaign
  clean; the tech-support pattern passed a locked-screen scam clean. The
  watchlist ships `sberbank.ru` and `gosuslugi.ru`. The documentation is in
  Russian. The interstitial speaks to a Russian reader. The detectors did not.
- **Why it survived so long:** two of the three modules had no tests of their
  own — `signals.ts` was covered through `detectHidden`, and the redactor and
  retention modules turned out the same way earlier in this audit. A rule
  reached only through its caller is a rule whose wording nobody reads back.
- **What was NOT wrong:** the credential guard, which reads facts rather than
  words — encryption, imitation, age of the domain, where the form posts. That
  is now pinned by a test, so the next sweep does not have to re-derive it.
- **Prevention:** standing instruction 13, and a Known limit in SCN-003,
  SCN-008 and SCN-009 naming the two languages matched and saying plainly that
  a third passes clean.

### 2026-08-09 — the suite had been talking to production all along

- **Symptom:** SCN-007 failed about one run in seventy, always the same way —
  a page that should have been blocked loaded instead. Two hypotheses stood
  recorded, neither checked. One of them claimed a real window in which a
  flagged page reaches a real user; that is the kind of claim worth being sure
  about.
- **Surfaced at:** a probe written to measure the gap rather than argue about
  it — install the rules, navigate at once, record blocked-or-not and the delay,
  twenty times over.
- **Owned by:** the fixture, which had no opinion about the network at all.
- **What the probe showed:** round 0 blocked; every round after it did not,
  with the rules still present. Dumping them was the whole answer — they were
  not the test's rules. They named `sberbank-online-vhod.test` and three other
  domains from the **published** feed. `pullFeed()` runs at every service-worker
  boot and fetches from the production worker; nothing in the suite stopped it,
  so the seeded feed was being replaced mid-test. Whether the test passed
  depended on who won a race with the internet.
- **Both recorded hypotheses were wrong.** There is no propagation window: the
  first round blocked in about 100 ms. Retiring that one mattered more than
  fixing the test, because it had been standing as a possible security limit.
- **Prevention:** the fixture refuses every outbound request except the test
  origin, registered first so a spec can still stub the one destination it is
  about; the readiness helper now asks whether the domain under test is
  covered, not whether any rule exists.

### 2026-08-09 — a gate that watched its own recorder

- **Symptom:** the new "nothing reaches a real host" check passed a planted
  defect that let requests through to the real internet.
- **Root cause:** it asserted over the fixture's own list of attempted URLs.
  Recording a request and then forwarding it satisfies that list exactly as
  well as recording and refusing it. The gate was watching the instrument
  rather than the world.
- **Fix:** assert the product's consequence instead — the journal must contain
  the feed pull failing with the fixture's 503. A suite that reached production
  would have fetched a real feed and written nothing of the kind. Both plants
  now turn it red.
- **The same shape, one file over:** two SCN-021 journal tests broke the moment
  the network closed, because they asserted exact entry counts over a store the
  extension also writes to. They had been green only while the extension
  happened to stay silent. Their `seed()` now clears before writing — a helper
  that adds to an unknown state cannot establish a known one.

### 2026-08-09 — a counting gate that demanded wrong Russian

- **Symptom:** adding one e2e spec turned `tools/docs.test.ts` red, correctly.
  Writing the new count in correct Russian — «22 файла» — left it red.
- **Root cause:** the gate asserted the document contained the literal
  `${n} файлов`. Russian chooses файл / файла / файлов by the last digits, so
  the genitive plural is right for 5 and wrong for 22. The gate was enforcing a
  grammatical error into `docs/brand/facts.md`, of all documents — the one
  whose entire subject is the product speaking properly.
- **Owned by:** a check written in a language it does not decline.
- **Fix:** match the row and compare the *number*; the noun after it is the
  writer's business. Both branches verified by planting — a drifted count and a
  deleted row each turn it red, and the correct grammar now passes.
- **The wider point:** a gate that pins prose rather than facts will be
  satisfied by wrong prose and will refuse right prose. Assert what was
  measured, and let the sentence be written by whoever writes sentences.

### 2026-08-09 — the check that agreed with the intention

- **Symptom:** four Chrome Web Store screenshots were in English, on a
  Russian-first listing, taken by a tool whose own comment said `--lang=ru`
  existed precisely to prevent that.
- **Surfaced at:** looking at the regenerated image, while fixing an unrelated
  framing defect. Nothing was failing.
- **Root cause, measured rather than assumed:** `chrome.i18n.getUILanguage()`
  returns `ru-RU` and `chrome.i18n.getMessage('@@ui_locale')` returns `en_GB`
  **in the same call**. Playwright's bundled Chromium ships no locale packs at
  all, so Chrome's application locale — the one message selection actually uses
  — falls back regardless of the flag.
- **Why it survived:** the obvious check agrees with the intention. Anyone
  verifying `--lang=ru` by asking `getUILanguage()` gets `ru-RU` and stops.
- **The near-miss worth recording:** the first reading of this was "the product
  ships in English", which would have been wrong and expensive. The built
  artefact carries `default_locale: ru` and 195 Russian keys; a real Chrome has
  220 locale packs. It is the screenshot harness that cannot render Russian,
  not the extension that cannot speak it. Standing instruction 9 earned its
  place again — and one level further than usual, because the misleading number
  came from the browser rather than from a diagnostic.
- **Fix:** `pnpm screenshots` now reads `@@ui_locale`, refuses to write a single
  file when it is not Russian, and prints the cause and the way out. Verified by
  planting: with the check disabled it writes four English images; restored, it
  refuses. An image is the one artefact nobody diffs, so a silent wrong one
  looks finished.
- **Also fixed, and smaller than it looked:** the popup is a ~390px panel shot
  into a 1280×800 frame, so it sat in the corner with two thirds empty. It is
  centred now, with a seeded queue — a listing image of "nothing needs you" is a
  picture of the product with nothing to say. The reported "footer buttons
  stacked" was measured and **is not a defect**: three labels do not fit on one
  line at panel width, and they wrap.

### 2026-08-09 — a defect retracted, and the check it was standing in front of

- **The claim:** `tools/icons.mjs` hardcodes `[30, 41, 59]` and
  `[226, 232, 240]`, which are exactly two values in
  `packages/ui/src/tokens.ts`, with no import between them — so a palette change
  would leave the icon behind while every gate stayed green.
- **The first two facts were right and the conclusion was wrong.** The values do
  coincide and there is no link, but a toolbar icon is one fixed artwork
  rendered against a light toolbar and a dark one at the same moment. There is
  no theme at that point to pick a side, so it *cannot* follow a token. Wiring
  it to `accent` would have created a false dependency and made a UI decision
  silently change the brand mark.
- **Checked before concluding:** no document claims the linkage. The
  design-system rule that "no stylesheet writes a colour of its own" is about
  stylesheets; ADR-0007 lists icons as generated, which is about regeneration.
  The docs and the code agree — the reader's assumption was the only thing
  wrong, and two readers made it, including a vision agent.
- **What was actually missing, one level down:** nothing checked the constraint
  that does govern. `tools/manifest.test.ts` compares the committed PNGs to
  `draw()`, so it agrees with whatever the generator decides. Both colours could
  be made dark and the icon would vanish on a dark toolbar, green throughout.
- **Measured, which also corrected a comment:** against a light toolbar the
  plate carries the mark at 14.63:1 while the ring is invisible at 1.23:1;
  against a dark toolbar they swap — plate 1.02:1, ring 11.64:1. The silhouette
  differs by toolbar, and the docstring had claimed the plate was "dark enough
  for a light toolbar, light enough for a dark one", which 1.02:1 says it is
  not.
- **Fix:** `tools/icons.test.ts` — at least one colour clears 3:1 (WCAG 2.2
  non-text contrast) against four real toolbar surfaces, and the two stay
  legible against each other. Both rules verified by planting.
- **The lesson worth keeping:** the wrong premise was worth chasing. Retracting
  it took reading the intent rather than the values, and the check that replaced
  it guards something real that nothing guarded. A duplicated constant is not a
  defect on its own; a constraint nobody asserts is.

### 2026-08-09 — the catalogue was guarded on one side only

- **Symptom:** with the screenshots finally rendering Russian, the popup came
  out half in each language, and the first-run screen came out entirely in
  English — on a build declaring `default_locale: ru` with 195 Russian keys.
- **Root cause:** 49 user-facing sentences are held in the code rather than
  asked of the catalogue. `tools/locales.test.ts` checks the catalogue
  thoroughly — same keys in every locale, no empty messages, every key the code
  asks for exists, nothing present that nobody asks for — and never asks
  whether the code goes around it. A gate that guards one side of a boundary
  and does not know the other side exists.
- **How the harness was fixed on the way, and what that taught:** Chrome picks
  a catalogue by its *application* locale, and the browsers here ship no locale
  packs, so that locale is en_GB whatever `--lang` says. The fix needs no other
  browser: take the shots against a copy of the build with `_locales/en`
  removed, and Chrome falls back to `default_locale`, which is `ru`. Every
  string rendered is the real catalogue's; the extension's code is byte-identical.
- **The check that agreed with itself, twice.** Yesterday's guard read
  `@@ui_locale` — and would have refused this very run, since Chrome still
  calls its locale en_GB while resolving Russian. Corrected to compare the
  rendered string against the catalogue, it then passed while `02-first-run`
  was English from its heading down, because it read one key on one screen. It
  now runs per screen: this product ships Russian first, so a screen with no
  Cyrillic anywhere is a screen nobody translated. Blunt on purpose — it cannot
  catch a half-translated screen, and it cannot be satisfied by a lucky string.
- **A test pinned to prose, again.** Moving the popup's "Nothing new since…"
  into the catalogue turned a unit test red on a screen that had become more
  correct. It asserted `/nothing new/i`. It asserts the moment now — the
  control's promise is that a zero is never shown bare, not that it is shown in
  English.
- **Fix by grade:** the popup's nine sentences are in the catalogue (10 keys);
  the remaining 43 in 14 files are a ledger row with a measured count, not a
  vague "finish i18n"; and `pnpm screenshots` names every untranslated screen
  and exits non-zero.

### 2026-08-09 — four counts in a row, all of them low

- **Symptom:** each iteration of the localisation work reported how many
  sentences were left — 49, then 43, then 36, then 15. The screenshot of the
  self-audit page then showed English lines that none of those numbers had
  counted.
- **Root cause:** the count was re-derived every iteration by a throwaway regex
  typed into the shell, and every version required a capital first letter. The
  audit log's own copy does not have one: "downloading the list of known-bad
  sites", "triggered by alarm:feeds", "none contained a page address". The true
  figure at that moment was 44 in 15 files, not 15 in 10.
- **Owned by:** me, and standing instruction 9 applies to a number my own
  command produced exactly as it applies to a diagnostic's. Reported as fact
  four times, it was a claim about a regex.
- **What made it survive:** each count was *lower* than the last, so the shape
  of the sequence looked like progress. A number that moves the way you expect
  is the hardest kind to doubt.
- **Fix:** `tools/i18n-sweep.mjs` and `pnpm i18n:sweep`. The pattern is written
  down, reviewable and the same every run, and `--list` prints file and line so
  the number can be checked rather than believed. The generate-what-would-drift
  rule (ADR-0007) applies to measurements, not only to documents.

### 2026-08-09 — untranslated copy travelling as data

- **Symptom:** the self-audit screenshot read "запросов отправлено с the last
  seven days: 1", and one row's payload said "none" among Russian neighbours —
  while `pnpm i18n:sweep`, written that same hour to stop exactly this kind of
  guessing, reported the file clean.
- **Root cause:** a sweep over source literals can only see copy that *is* a
  literal in the module that renders it. Two other shapes exist and it is blind
  to both:
    - a value handed in as a substitution — `since: 'the last seven days'` sits
      in the options page, arrives as an argument, and reads as English inside a
      Russian sentence;
    - a field stored on a record and rendered later — `payloadShape: 'none'`,
      written by the background into the audit log.
- **Owned by:** the measurement, again, and this time it was found by looking
  at a picture. The sweep now says so in its own docstring: a number from it is
  a floor, not a total.
- **The stored-field case has a rule, and it is not "translate it".** The audit
  log and the trusted list are records. Translating on write freezes whichever
  language was active that day into evidence, and a log half in each language
  has stopped being one record. So: store a key, resolve on read — the pattern
  the journal already used for `explainKey`, now extended to exception rows
  (`reasonKey`) and to the one payload shape that is prose rather than shape.
  `email:…` and `hash-prefix:…` stay as they are; a shape reads the same in
  every language.
- **No migration, deliberately**, following the journal's note: guessing which
  key an old English sentence came from is how a record stops being evidence.
  Rows written before today keep their sentence and are shown as written.
