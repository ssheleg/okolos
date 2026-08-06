<!-- Managed with super-ux (ux-contract v4). The design map: every screen and state with its Figma frame, wireframe, code coverage, and resources. Update in the same change as any interface change; when Figma is enabled, update the frame too. -->

# Screens — UI map

Figma is disabled for now (see [foundation.md](foundation.md) → Design
tooling), so the `Figma frame` column holds `-` until Figma is switched on
before UI implementation. Most screens below are `designed` — specified, not
built. Two are `built` and carry their code coverage: the banner (injection
variant only; the other six variants land with their modules) and the
self-audit panel.

## Index

| ID | Screen | Used by | Figma | Status | Coverage |
|----|--------|---------|-------|--------|----------|
| SCR-01 | First-run check | FLW-01, FLW-14 | - | built | packages/ui/src/first-run/screen.ts:45 |
| SCR-02 | Popup | FLW-17, FLW-11, FLW-13 | - | built | e2e/scn-020.spec.ts |
| SCR-03 | In-page warning banner | FLW-02, FLW-05, FLW-06, FLW-07, FLW-08, FLW-09, FLW-10 | - | built | packages/ui/src/banner/banner.ts:52 |
| SCR-04 | Finding inspector | FLW-02, FLW-03 | - | built | packages/ui/src/inspector/inspector.ts:57 |
| SCR-05 | Block interstitial | FLW-04 | - | built | e2e/scn-007.spec.ts |
| SCR-06 | Agent action gate | FLW-03 | - | built | e2e/scn-010.spec.ts |
| SCR-07 | Findings queue | FLW-01, FLW-17 | - | built | e2e/scn-020.spec.ts, e2e/scn-002.spec.ts |
| SCR-08 | Leaks and repair | FLW-10, FLW-11, FLW-16 | - | built | e2e/scn-015.spec.ts |
| SCR-09 | Extensions watch | FLW-12 | - | built | e2e/scn-017.spec.ts |
| SCR-10 | Self-audit | FLW-13, FLW-17 | - | built | packages/ui/src/self-audit/panel.ts:26 |
| SCR-11 | Journal and weekly diff | FLW-17 | - | built | e2e/scn-020.spec.ts |
| SCR-12 | Settings | FLW-05, FLW-14 | - | built | packages/ui/src/settings/data-controls.ts:31 |
| SCR-13 | Recovery checklist | FLW-06, FLW-07, FLW-16 | - | built | e2e/scn-025.spec.ts |
| SCR-14 | Public domain status | FLW-04, FLW-15 | - | built | apps/status-page/src/render.test.ts |

## Design system

- **Style pack:** not chosen yet — to be picked with the `sheleg-design`
  companion skill before any frame or code (`workbench` is the expected fit:
  dense product UI, calm defaults, no decorative motion). Locked here once
  chosen.
- **Figma library:** none — Figma disabled until UI implementation
- **Tokens in code:** planned `packages/ui/src/tokens.ts`
- **Component source:** planned `packages/ui/src/components/`
- **Assets:** planned `packages/ui/assets/`

**Cross-screen rules (apply to every screen below):**

- Severity is never conveyed by colour alone — icon plus text carry it (WCAG
  2.2 AA, foundation → Product mechanics).
- Every verdict shows its source: which check fired, which feed or stage, and
  when the data was last updated.
- Every verdict is disputable in one click ("this is wrong"), and the
  disagreement is remembered.
- No counters of "threats blocked", no protection score, no streaks.
- In-page surfaces render inside a closed Shadow DOM so page CSS cannot
  restyle or hide them.

## Screens

### SCR-01: First-run check
- **Used by:** FLW-01 (all steps), FLW-14 (post-wipe return)
- **Purpose:** deliver a real, local result within 30 seconds of install — the product's proof of value before any configuration
- **Elements:** one-line statement of what runs locally; per-check progress list (open tabs / installed extensions / password corpus readiness); findings summary; **primary action: "See what to do first"**; secondary "Skip for now"; link "What this sends" → SCR-10
- **States:**
  | State | Trigger | Figma frame | Behavior |
  |-------|---------|-------------|----------|
  | loading | install completed | - | per-check rows with live progress; no spinner without a label |
  | empty | checks ran, nothing found | - | plain "nothing found" plus the list of what was actually checked |
  | error | a check could not run | - | that row shows the reason and a retry; other checks continue |
  | success | findings exist | - | count by category, primary action into SCR-07 |
- **Wireframe:** wireframes/SCR-01.md
- **Coverage:** packages/ui/src/first-run/screen.ts:45, apps/extension/src/first-run/index.ts:17
- **Scenarios:** SCN-001, SCN-002
- **Resources:** local corpus loader, extension inventory adapter, tab scanner
- **Status:** built

### SCR-02: Popup
- **Used by:** FLW-17 (entry), FLW-11 and FLW-13 (entry points)
- **Purpose:** the 3-second answer — is this page fine, and is there anything new
- **Elements:** current page verdict with reason; "what changed" count; up to 3 queued actions; footer links to Self-audit, Journal, Settings; **primary action: the top queued item**
- **States:**
  | State | Trigger | Figma frame | Behavior |
  |-------|---------|-------------|----------|
  | loading | popup opened before verdict ready | - | skeleton with "checking this page" |
  | empty | page clean, nothing new | - | "Nothing new since <time>" and the current page verdict |
  | error | local storage unreadable | - | states the failure and offers repair; never silently blank |
  | success | verdict and/or queue present | - | verdict line + up to 3 actions |
- **Wireframe:** wireframes/SCR-02.md
- **Coverage:** packages/ui/src/popup/popup.ts:39, apps/extension/src/popup/index.ts:44, e2e/scn-020.spec.ts:65
- **Scenarios:** SCN-020, SCN-021
- **Resources:** verdict store, queue selector
- **Status:** built

### SCR-03: In-page warning banner
- **Status note:** built for the injection variant only
- **Used by:** FLW-02, FLW-05, FLW-06, FLW-07, FLW-08, FLW-09, FLW-10
- **Purpose:** speak at the moment of the decision, inside the page, without stealing the page
- **Elements:** severity icon + label; one-sentence plain-language reason; **one primary action per variant**; secondary "Show me" → SCR-04 where applicable; "This is wrong"; dismiss. Variants: `injection`, `lookalike`, `clickfix` (blocking), `techsupport`, `download`, `credential`, `password`
- **States:**
  | State | Trigger | Figma frame | Behavior |
  |-------|---------|-------------|----------|
  | success | a finding is raised | - | banner appears in the corner; blocking variants (clickfix) overlay and require a deliberate dismiss |
  | error | detail view or action failed | - | inline failure text with retry; the warning itself never disappears on error |
- **Behavior notes:** closed Shadow DOM; keyboard reachable; announced to screen readers; never covers a form field it warns about; low-confidence findings never block
- **Wireframe:** wireframes/SCR-03.md
- **Coverage:** packages/ui/src/banner/banner.ts:52 (injection variant built; the other six land with their modules)
- **Scenarios:** SCN-003, SCN-006, SCN-008, SCN-009, SCN-011, SCN-012, SCN-013
- **Resources:** shared banner component, variant copy table, i18n strings
- **Status:** built

### SCR-04: Finding inspector
- **Used by:** FLW-02 (inspect), FLW-03 (from the gate)
- **Purpose:** show the evidence so the user can judge the verdict instead of trusting it
- **Elements:** the concealed text verbatim; concealment technique; DOM location; which stage fired and its confidence; neutralised/restored toggle; "This is wrong"; **primary action: "Keep it neutralised"**
- **States:**
  | State | Trigger | Figma frame | Behavior |
  |-------|---------|-------------|----------|
  | loading | opening details | - | skeleton, evidence arrives in one pass |
  | success | evidence available | - | text + technique + location + stage |
  | error | evidence lost (page mutated) | - | says the page changed, offers a re-scan |
- **Wireframe:** wireframes/SCR-04.md
- **Coverage:** packages/ui/src/inspector/inspector.ts:57 (restore lands with the sanitizer, M5)
- **Scenarios:** SCN-004, SCN-005
- **Resources:** evidence store, DOM locator renderer
- **Status:** built

### SCR-05: Block interstitial
- **Used by:** FLW-04
- **Purpose:** replace a known-malicious page and make the override honest
- **Elements:** what was blocked; the verdict's source (feed name, entry date); **primary action: "Go back"**; secondary "Continue anyway" (deliberate, states that the exception is remembered and journalled); "I own this site" → SCR-14
- **States:**
  | State | Trigger | Figma frame | Behavior |
  |-------|---------|-------------|----------|
  | success | feed match | - | full-page interstitial replacing the site |
  | error | feed metadata unavailable | - | still blocks, states the source is unknown and how to check |
- **Wireframe:** wireframes/SCR-05.md
- **Coverage:** packages/ui/src/interstitial/interstitial.ts:38, e2e/scn-007.spec.ts:39
- **Scenarios:** SCN-007
- **Resources:** feed metadata store, exception store
- **Status:** built

### SCR-06: Agent action gate
- **Used by:** FLW-03
- **Purpose:** put a human decision between a poisoned page and a sensitive action
- **Elements:** the action being attempted; the unresolved finding in one line; **primary action: "Block"**; secondary "Allow once"; "Show the injection" → SCR-04; timeout notice
- **States:**
  | State | Trigger | Figma frame | Behavior |
  |-------|---------|-------------|----------|
  | success | sensitive action on a page with an unresolved finding | - | modal, blocking, default is Block |
  | error | the action context cannot be identified | - | blocks and says what could not be determined |
- **Behavior notes:** timing out defaults to Block, never to Allow; Block holds focus so a stray Enter blocks; Escape blocks; "Show the injection" leaves the gate standing behind the evidence
- **Wireframe:** wireframes/SCR-06.md
- **Coverage:** packages/ui/src/gate/gate.ts:38, e2e/scn-010.spec.ts:31
- **Scenarios:** SCN-010
- **Resources:** action interceptor, finding store
- **Status:** built

### SCR-07: Findings queue
- **Used by:** FLW-01, FLW-17
- **Purpose:** turn everything found into at most three next actions
- **Elements:** up to 3 prioritised items, each with what happened, why it matters, and one executable action; "show all" (collapsed by default); per-item "resolve" and "not now"
- **States:**
  | State | Trigger | Figma frame | Behavior |
  |-------|---------|-------------|----------|
  | loading | opening after a scan | - | skeleton rows |
  | empty | nothing outstanding | - | "Nothing needs you right now" plus when it was last checked |
  | error | queue store unreadable | - | states the failure, offers repair |
  | success | items exist | - | max 3 shown; the rest behind "show all" |
- **Behavior notes:** the queue never exceeds three visible items — this is the anti-pattern this product exists to avoid (203 alerts, nothing done)
- **Wireframe:** wireframes/SCR-07.md
- **Coverage:** packages/core-queue/src/rank.ts:52, packages/ui/src/queue/queue.ts:30, e2e/scn-020.spec.ts:160
- **Scenarios:** SCN-002, SCN-022
- **Resources:** priority scorer, action registry
- **Status:** built

### SCR-08: Leaks and repair
- **Used by:** FLW-10 (reuse list), FLW-11, FLW-16
- **Purpose:** what of mine is exposed, and the repair for each
- **Elements:** monitored sources (email, phone) with add/remove; results split into "fresh — infostealer" and "historical breaches"; per-entry data classes, date, source; **primary action per entry: "Change password"**; "Check reuse"; "Mark resolved"; archive; manual password check field; the list of sources actually checked and when
- **States:**
  | State | Trigger | Figma frame | Behavior |
  |-------|---------|-------------|----------|
  | loading | check running | - | per-source progress, partial results shown as they arrive |
  | empty | no sources monitored | - | prompt to add an email or phone, with what will and won't be sent |
  | error | a source failed | - | that row states unavailable + retry; other results stand |
  | success | results present | - | freshest first, historical collapsed |
- **Wireframe:** wireframes/SCR-08.md
- **Coverage:** packages/ui/src/leaks/leaks.ts:47, packages/core-leaks/src/merge.ts:39, e2e/scn-015.spec.ts:12
- **Scenarios:** SCN-014, SCN-015, SCN-016
- **Resources:** source adapters (HIBP, XposedOrNot, Hudson Rock), local hash store, reuse index
- **Status:** built

### SCR-09: Extensions watch
- **Used by:** FLW-12
- **Purpose:** the inventory plus what changed in it — the delta is the product, not the list
- **Elements:** installed extensions with risk level and last change; deltas highlighted at the top (permissions added, publisher changed, silent update); per-item detail with static findings (obfuscation, `eval`, remote code, endpoints); **primary action: "Disable"**; "Trust this change"; "Inspect package"
- **States:**
  | State | Trigger | Figma frame | Behavior |
  |-------|---------|-------------|----------|
  | loading | inventory or package analysis running | - | list renders first, analysis fills in |
  | empty | no extensions installed | - | plain statement, no filler |
  | error | package could not be fetched | - | permission delta still shown; analysis marked unavailable |
  | success | inventory with deltas | - | deltas first, then the rest by risk |
- **Wireframe:** wireframes/SCR-09.md
- **Coverage:** packages/ui/src/extensions/extensions.ts:44, packages/core-extensions/src/diff.ts:37, e2e/scn-017.spec.ts:12
- **Scenarios:** SCN-017, SCN-018
- **Resources:** management adapter, snapshot store, CRX static analyser
- **Status:** built

### SCR-10: Self-audit
- **Used by:** FLW-13, FLW-17
- **Purpose:** make "we don't collect your browsing" verifiable rather than promised
- **Elements:** outbound request log — time, destination, purpose, payload shape, what triggered it; filters by period and feature; **primary action: "Export log"**; per-row detail with the exact bytes sent and redaction applied; a one-line summary ("this week: N requests, none containing a URL or address")
- **States:**
  | State | Trigger | Figma frame | Behavior |
  |-------|---------|-------------|----------|
  | loading | opening the log | - | skeleton rows |
  | empty | nothing sent yet | - | "Nothing has been sent from this device" |
  | error | journal unreadable | - | states the problem and offers repair; never shows an empty list on error |
  | success | entries exist | - | newest first, grouped by purpose |
- **Behavior notes:** this log is written by the single network choke point before each request; if a request could bypass it, the guarantee is void — enforced by lint and test, not by convention
- **Wireframe:** wireframes/SCR-10.md
- **Coverage:** packages/ui/src/self-audit/panel.ts:26, apps/extension/src/options/index.ts:12
- **Scenarios:** SCN-019
- **Resources:** net layer journal, exporter
- **Status:** built

### SCR-11: Journal and weekly diff
- **Used by:** FLW-17
- **Purpose:** what changed since last time — not an ever-growing red list
- **Elements:** default view "since your last check"; grouped by type; each entry with verdict, action taken, and whether it was automatic; toggle to full history; retention statement
- **States:**
  | State | Trigger | Figma frame | Behavior |
  |-------|---------|-------------|----------|
  | empty | nothing changed | - | "Nothing changed since <time>" |
  | success | changes exist | - | grouped diff, newest first |
- **Wireframe:** wireframes/SCR-11.md
- **Coverage:** packages/core-queue/src/diff.ts:45, packages/ui/src/journal/journal.ts:32, e2e/scn-020.spec.ts:106
- **Scenarios:** SCN-021
- **Resources:** event journal, diff selector
- **Status:** built

### SCR-12: Settings
- **Used by:** FLW-05 (watchlist edit), FLW-14
- **Purpose:** the few switches that change behaviour, plus data ownership
- **Elements:** brand watchlist (add/edit/remove); trusted domains list (populated by "this is legitimate" decisions, editable); quiet mode toggle; proxy on/off with a plain explanation of what each option reveals and to whom; retention period; **primary action: "Export all data"**; "Wipe all data" (destructive, confirms with a list of what is deleted)
- **States:**
  | State | Trigger | Figma frame | Behavior |
  |-------|---------|-------------|----------|
  | success | default | - | grouped settings |
  | error | export or wipe failed | - | inline failure with retry; state left unchanged |
- **Wireframe:** wireframes/SCR-12.md
- **Coverage:** packages/ui/src/settings/data-controls.ts:31, packages/ui/src/trusted/trusted.ts:33, e2e/scn-024.spec.ts:34 (data controls and the trusted list built; watchlist, quiet mode and the proxy toggle land with their modules)
- **Scenarios:** SCN-023, SCN-024
- **Resources:** settings store, exporter, wipe routine
- **Status:** built

### SCR-13: Recovery checklist
- **Used by:** FLW-06, FLW-07, FLW-16
- **Purpose:** turn "I already did the bad thing" into an ordered, finishable list
- **Elements:** incident type picker (ran a pasted command / entered credentials / installed something / not sure); ordered steps, most damaging first, each with why; per-step done state; "continue on another device" instructions; **primary action: the current step**
- **States:**
  | State | Trigger | Figma frame | Behavior |
  |-------|---------|-------------|----------|
  | loading | building the checklist | - | brief; steps are local |
  | empty | no incident selected | - | the picker, nothing else |
  | success | checklist active | - | one current step highlighted, rest visible |
- **Behavior notes:** no time estimates, no reassurance copy, no scare copy; progress survives a browser restart
- **Wireframe:** wireframes/SCR-13.md
- **Coverage:** packages/ui/src/recovery/recovery.ts:17, packages/core-recovery/src/checklist.ts:120, e2e/scn-025.spec.ts:8
- **Scenarios:** SCN-025
- **Resources:** playbook definitions, incident store
- **Status:** built

### SCR-14: Public domain status
- **Used by:** FLW-04 (from the interstitial), FLW-15
- **Purpose:** let an affected site owner see and dispute a verdict without an account — the gap that generated the loudest complaint about the incumbent
- **Elements:** domain lookup field; current verdict with feed source and entry date; upstream appeal link when the verdict came from a third-party feed; appeal form (domain, contact, note) with reference id; **primary action: "Check domain"**
- **States:**
  | State | Trigger | Figma frame | Behavior |
  |-------|---------|-------------|----------|
  | loading | lookup running | - | inline progress |
  | empty | domain not in any list | - | "Nothing is recorded for this domain" |
  | error | service unavailable | - | states it plainly and offers retry; never implies "clean" |
  | success | verdict found | - | verdict, source, date, appeal path |
- **Behavior notes:** a public web page, not an extension surface; no account, no tracking, no analytics
- **Wireframe:** wireframes/SCR-14.md
- **Coverage:** apps/status-page/src/render.ts:38, apps/proxy/src/router.ts:60, apps/status-page/src/render.test.ts:29
- **Scenarios:** SCN-026
- **Resources:** worker status endpoint, feed metadata
- **Status:** built
