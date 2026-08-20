<!-- Managed with super-ux (ux-contract v4). The design map: every screen and state with its Figma frame, wireframe, code coverage, and resources. Update in the same change as any interface change; when Figma is enabled, update the frame too. -->

# Screens — UI map

Figma is disabled by the 2026-08-04 decision (see
[foundation.md](foundation.md) → Design tooling), so the `Figma frame` column
holds `-` throughout and every wireframe in `wireframes/` is **generated from
the renderers** by `tools/wireframes.mjs` and held current by
`tools/wireframes.test.ts` — a screen that gains a control fails the build until
its wireframe is regenerated. That inverts the usual order: here the record of
intent is this file, and the wireframe is derived evidence rather than a mockup
drawn ahead of the code.

**All eighteen screens are `built`.** SCR-15, the dashboard overview, was
specified in [plans/2026-08-12-options-dashboard.md](plans/2026-08-12-options-dashboard.md)
and shipped in the same pass. (The paragraph here previously said most screens were
`designed` and exactly two were `built`; it was written before the build and
never updated, which is the same drift this file exists to catch.)

## Index

| ID | Screen | Used by | Figma | Status | Coverage |
|----|--------|---------|-------|--------|----------|
| SCR-01 | First-run check | FLW-01, FLW-14 | - | built | packages/ui/src/first-run/screen.ts:renderFirstRun |
| SCR-02 | Popup | FLW-17, FLW-11, FLW-13 | - | built | e2e/scn-020.spec.ts |
| SCR-03 | In-page warning banner | FLW-02, FLW-05, FLW-06, FLW-07, FLW-08, FLW-09, FLW-10 | - | built | packages/ui/src/banner/banner.ts:mountBanner |
| SCR-04 | Finding inspector | FLW-02, FLW-03 | - | built | packages/ui/src/inspector/inspector.ts:mountInspector |
| SCR-05 | Block interstitial | FLW-04 | - | built | e2e/scn-007.spec.ts |
| SCR-06 | Agent action gate | FLW-03 | - | built | e2e/scn-010.spec.ts |
| SCR-07 | Findings queue | FLW-01, FLW-17 | - | built | e2e/scn-020.spec.ts, e2e/scn-002.spec.ts |
| SCR-08 | Leaks and repair | FLW-10, FLW-11, FLW-16 | - | built | e2e/scn-015.spec.ts |
| SCR-09 | Extensions watch | FLW-12 | - | built | e2e/scn-017.spec.ts |
| SCR-10 | Self-audit | FLW-13, FLW-17 | - | built | packages/ui/src/self-audit/panel.ts:renderSelfAudit |
| SCR-11 | Journal and weekly diff | FLW-17 | - | built | e2e/scn-020.spec.ts |
| SCR-12 | Settings | FLW-05, FLW-14 | - | built | packages/ui/src/settings/data-controls.ts:renderDataControls |
| SCR-13 | Recovery checklist | FLW-06, FLW-07, FLW-16 | - | built | e2e/scn-025.spec.ts |
| SCR-14 | Public domain status | FLW-04, FLW-15 | - | built | apps/proxy/src/router.test.ts |
| SCR-15 | Dashboard overview | FLW-17 | - | built | packages/ui/src/dashboard/overview.ts:renderOverview, e2e/scn-027.spec.ts |
| SCR-16 | Trusted domains | FLW-05, FLW-14 | - | built | packages/ui/src/trusted/trusted.ts:renderTrusted, e2e/scn-024.spec.ts |
| SCR-17 | Product landing page | FLW-18 | - | built | apps/proxy/src/landing.test.ts |
| SCR-18 | Privacy page | FLW-18 | - | built | tools/privacy-page.mjs, tools/docs.test.ts |
| SCR-19 | Lookalike comparison | FLW-05 | - | built | packages/ui/src/comparison/comparison.ts:mountComparison, e2e/scn-006.spec.ts, e2e/a11y-overlays.spec.ts |
| SCR-20 | Local store unavailable | FLW-14 | - | built | packages/ui/src/storage/storage-problem.ts:renderStorageProblem |

## Design system

- **Style pack:** dense product UI, calm defaults, **no motion at all** — there
  is nothing here for `prefers-reduced-motion` to reduce, which is the strongest
  form of respecting it. Chosen 2026-08-08, after the line above said "not
  chosen yet" through fourteen screens and the first-run screen shipped
  unreadable: three spans with no rule between them render as
  "Local storage**done**ready".
- **Figma library:** none — the layer is CSS over the markup the renderers
  already emit, and not one renderer changed to receive it
- **Tokens in code:** `packages/ui/src/tokens.ts` → generated into
  `apps/extension/src/tokens.generated.css` by `tools/tokens.mjs`. A test
  asserts the generated file matches, that both colour schemes carry the same
  roles, and that **no stylesheet writes a colour or a length of its own**
- **Component source:** none — `data-role` selectors over existing markup
- **Assets:** `apps/extension/icons`, drawn by `tools/icons.mjs`

## Web surfaces

- **Web surfaces:** yes

Three screens are public URLs served by the proxy worker: SCR-17 (`/`), SCR-18
(`/privacy`) and SCR-14 (`/status`). Each carries the five-field
`Web surface:` block below.

The answer was recorded 2026-08-12, after the code had already given it: the
landing page was designed for a human and a crawler at once in B-15 and is held
by eleven rules in `apps/proxy/src/landing.test.ts`, four of them verified by
planted defects. Recording it late is the drift this section exists to prevent —
SCR-17 and SCR-18 shipped with no screen entry at all, which the project's own
hard rule forbids.

**The custom domain changes every `Route` below at once.** `canonical` and the
`ld+json` block are derived from `url.origin` in
`apps/proxy/src/router.ts:landingPage`, so they follow the origin by themselves — but two hosts then serve the
same content with self-referencing canonicals. Adding the domain therefore
includes a redirect from `*.workers.dev`, not just a CNAME.

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
- **Elements:** one-line statement of what runs locally; per-check progress list (open tabs / installed extensions / password corpus readiness); findings summary; **primary action: "С чего начать"**; secondary "Пока пропустить"; link "Что отправляется" → SCR-10
- **States:**
  | State | Trigger | Figma frame | Behavior |
  |-------|---------|-------------|----------|
  | loading | install completed | - | per-check rows with live progress; no spinner without a label |
  | empty | checks ran, nothing found | - | plain "nothing found" plus the list of what was actually checked |
  | error | a check could not run | - | that row shows the reason and a retry; other checks continue |
  | success | findings exist | - | count by category, primary action into SCR-07 |
- **Wireframe:** wireframes/SCR-01.md
- **Coverage:** packages/ui/src/first-run/screen.ts:renderFirstRun, apps/extension/src/first-run/index.ts
- **Scenarios:** SCN-001, SCN-002
- **Resources:** local corpus loader, extension inventory adapter, tab scanner
- **Status:** built

### SCR-02: Popup
- **Used by:** FLW-17 (entry), FLW-11 and FLW-13 (entry points)
- **Purpose:** the 3-second answer — is this page fine, and is there anything new
- **Elements:** current page verdict with reason; a what-changed count that opens the diff; up to 3 queued actions; footer links to Self-audit, Journal, Settings; **primary action: the top queued item**
- **States:**
  | State | Trigger | Figma frame | Behavior |
  |-------|---------|-------------|----------|
  | loading | popup opened before verdict ready | - | skeleton with "checking this page" |
  | empty | page clean, nothing new | - | "Nothing new since <time>" and the current page verdict |
  | error | local storage unreadable | - | states the failure and offers repair; never silently blank |
  | success | verdict and/or queue present | - | verdict line + up to 3 actions |
- **Wireframe:** wireframes/SCR-02.md
- **Coverage:** packages/ui/src/popup/popup.ts:renderPopup, apps/extension/src/popup/index.ts, e2e/scn-020.spec.ts
- **Scenarios:** SCN-020, SCN-021
- **Resources:** verdict store, queue selector
- **Status:** built

### SCR-03: In-page warning banner
- **Status note:** built for the injection variant only
- **Used by:** FLW-02, FLW-05, FLW-06, FLW-07, FLW-08, FLW-09, FLW-10
- **Purpose:** speak at the moment of the decision, inside the page, without stealing the page
- **Elements:** severity icon + label; one-sentence plain-language reason; **one primary action per variant**; secondary "Показать" → SCR-04 where applicable; "Это неверно"; dismiss. Variants: `injection`, `lookalike`, `clickfix` (blocking), `techsupport`, `download`, `credential`, `password`
- **States:**
  | State | Trigger | Figma frame | Behavior |
  |-------|---------|-------------|----------|
  | success | a finding is raised | - | banner appears in the corner; blocking variants (clickfix) overlay and require a deliberate dismiss |
  | error | detail view or action failed | - | inline failure text with retry; the warning itself never disappears on error |
  | removed by the page | the page deletes the host from the document | - | put back up to three times, a quarter-second apart; after that the extension's **icon** carries a badge and the journal records the count. The banner is not on the page any more, and the product says so rather than going quiet |
  | more than one kind of finding | a second detector finds something on the same page | - | **one panel, never two.** The worst finding holds it, a tie leaves it where it is, and the rest become a single line naming how many other kinds are here. Two panels at the same `inset` drew one warning on top of another until 2026-08-20 (B-69) |
  | the verdict outlived the page that asked for it | a form navigated away while the leak check was in flight (FLW-10, SCN-036) | - | drawn on the page the login landed on, naming the site the password was sent to — which keeps the sentence true on a page that is not the form. Shown once: the panel confirms it was drawn, and `pagehide` withholds that confirmation when the document is leaving |
  | the finding is in an embedded frame | a frame reports upward — an injection (FLW-02), a login form (FLW-09) or a leak verdict on a password it received (FLW-10) | - | drawn in the **top** frame, never in the frame that found it: a banner inside a 300x200 frame is clipped and inside a hidden ad frame warns nobody. The headline names the frame's origin, and it comes from the sender as the background stamped it. The frame's controls act on the frame's domain — trusting means trusting the site in the frame, and "Сменить пароль" opens that site's change-password page rather than the embedding page's |
- **Behavior notes:** closed Shadow DOM; keyboard reachable; announced to screen readers; never covers a form field it warns about; low-confidence findings never block. **A page can delete this surface and nothing can forbid that** — the DOM belongs to the page — so the answer is bounded (ADR-0001, amended 2026-08-20): a short argument, then a channel the page does not own. A dismissal by the user is not a removal: the watch stops before the product destroys its own banner
- **Wireframe:** wireframes/SCR-03.md
- **Coverage:** packages/ui/src/banner/banner.ts:mountBanner, e2e/scn-003.spec.ts, e2e/a11y-overlays.spec.ts, e2e/scn-034.spec.ts (the credential variant drawn from a frame's report, asserted through the open shadow root of the hooked build)
- **Scenarios:** SCN-003, SCN-006, SCN-008, SCN-009, SCN-011, SCN-012, SCN-013, SCN-031, SCN-034, SCN-035, SCN-036
- **Resources:** shared banner component, variant copy table, i18n strings
- **Status:** built

### SCR-04: Finding inspector
- **Used by:** FLW-02 (inspect), FLW-03 (from the gate)
- **Purpose:** show the evidence so the user can judge the verdict instead of trusting it
- **Elements:** the concealed text verbatim; concealment technique; DOM location; which stage fired and its confidence; neutralised/restored toggle; "Это неверно"; **primary action: "Оставить обезвреженным"**; `[data-role=restore-note]` — what a restore could not put back, shown above the buttons when it could not finish
- **States:**
  | State | Trigger | Figma frame | Behavior |
  |-------|---------|-------------|----------|
  | ~~loading~~ | — | - | **removed 2026-08-20.** The inspector is mounted with the verdict's evidence already in hand, so opening details waits on nothing: there is no state to build and a skeleton would be a wait the product does not have. The row described an architecture this product never had (B-59) |
  | success | evidence available | - | text + technique + location + stage |
  | error | evidence lost (page mutated) | - | says the page changed, offers a re-scan |
  | refused | restore pressed on a node the page has taken over | - | the panel stays and `[data-role=restore-note]` names which of the two happened; **every further press repeats the same sentence.** Until 2026-08-20 the second press answered "nothing to do" and the panel closed as after a success, because the executor dropped its holds whatever the outcome |
- **Wireframe:** wireframes/SCR-04.md
- **Coverage:** packages/ui/src/inspector/inspector.ts:mountInspector, e2e/scn-004-click.spec.ts, e2e/a11y-overlays.spec.ts (restore lands with the sanitizer, M5)
- **Scenarios:** SCN-004, SCN-005
- **Resources:** evidence store, DOM locator renderer
- **Status:** built

### SCR-05: Block interstitial
- **Used by:** FLW-04
- **Purpose:** replace a known-malicious page and make the override honest
- **Elements:** what was blocked; the verdict's source (feed name, entry date), which fills in on a retry if the background was not ready; **primary action: "Назад"**; secondary "Всё равно продолжить" (deliberate, states that the exception is remembered and journalled); "Это мой сайт" → SCR-14, **with the blocked domain already in the link** so the owner does not retype what they were just shown; only the host travels, never the blocked URL's path or query
- **States:**
  | State | Trigger | Figma frame | Behavior |
  |-------|---------|-------------|----------|
  | success | feed match | - | full-page interstitial replacing the site |
  | error | feed metadata unavailable | - | still blocks, states the source is unknown and how to check |
- **Wireframe:** wireframes/SCR-05.md
- **Coverage:** packages/ui/src/interstitial/interstitial.ts:renderInterstitial, apps/extension/src/interstitial/appeal-link.ts:appealLinkFor, e2e/scn-007.spec.ts
- **Scenarios:** SCN-007
- **Resources:** feed metadata store, exception store
- **Status:** built

### SCR-06: Agent action gate
- **Used by:** FLW-03
- **Purpose:** put a human decision between a poisoned page and a sensitive action
- **Elements:** the action being attempted; the unresolved finding in one line; **primary action: "Заблокировать"**; secondary "Разрешить один раз"; "Показать инструкцию" → SCR-04; timeout notice
- **States:**
  | State | Trigger | Figma frame | Behavior |
  |-------|---------|-------------|----------|
  | success | sensitive action on a page with an unresolved finding | - | modal, blocking, default is Block |
  | error | the action context cannot be identified | - | blocks and says what could not be determined |
- **Behavior notes:** timing out defaults to Block, never to Allow; Block holds focus so a stray Enter blocks; Escape blocks; "Show the injection" leaves the gate standing behind the evidence. **What never reaches this screen:** an action with no form and no navigation behind it — a scripted click on a bare button firing `fetch` — is not held, so the gate never appears for it. **What now does reach it:** a trusted click in a browser that reports it is being driven — until 2026-08-08 automation input passed as a human gesture, because it arrives trusted. SCN-010 carries both, with the measurement
- **Wireframe:** wireframes/SCR-06.md
- **Coverage:** packages/ui/src/gate/gate.ts:mountGate, e2e/scn-010.spec.ts, e2e/a11y-overlays.spec.ts
- **Scenarios:** SCN-010
- **Resources:** action interceptor, finding store
- **Status:** built

### SCR-07: Findings queue
- **Used by:** FLW-01, FLW-17
- **Purpose:** turn everything found into at most three next actions
- **Elements:** up to 3 prioritised items, each with what happened, why it matters, and one executable action; "show all" (collapsed by default); per-item "Готово" and "Не сейчас"
- **States:**
  | State | Trigger | Figma frame | Behavior |
  |-------|---------|-------------|----------|
  | loading | opening after a scan | - | skeleton rows |
  | empty | nothing outstanding | - | "Nothing needs you right now" plus when it was last checked |
  | error | queue store unreadable | - | states the failure, offers repair |
  | success | items exist | - | max 3 shown; the rest behind "show all" |
- **Behavior notes:** the queue never exceeds three visible items — this is the anti-pattern this product exists to avoid (203 alerts, nothing done)
- **Wireframe:** wireframes/SCR-07.md
- **Coverage:** packages/core-queue/src/rank.ts:buildQueue, packages/ui/src/queue/queue.ts:renderQueue, e2e/scn-020.spec.ts
- **Scenarios:** SCN-002, SCN-022
- **Resources:** priority scorer, action registry
- **Status:** built

### SCR-08: Leaks and repair
- **Used by:** FLW-10 (reuse list), FLW-11, FLW-16
- **Purpose:** what of mine is exposed, and the repair for each
- **Elements:** monitored sources (email, phone) with add/remove; results split into "Недавнее — устройство было заражено" and "Более старые утечки"; per-entry data classes, date, source; **primary action per entry: "Сменить пароль"**; "Отметить решённым"; archive; manual password check field; the list of sources actually checked and when
- **States:**
  | State | Trigger | Figma frame | Behavior |
  |-------|---------|-------------|----------|
  | loading | check running | - | per-source progress, partial results shown as they arrive |
  | empty | no sources monitored | - | prompt to add an email or phone, naming what is sent — the address itself, not a hash |
  | refused | Check now pressed with no usable address | - | states why nothing was sent (`[data-role=needs]`) and keeps the control, so the press is never silent |
  | error | a source failed | - | that row states unavailable + retry; other results stand |
  | success | results present | - | freshest first, historical collapsed |
- **Behavior notes:** the idle state names what is sent, and it is **the address itself** — Hudson Rock's Cavalier and HIBP's breached-account endpoint answer to nothing less, so a screen implying a hashed lookup would be a false privacy claim on the surface where the user decides. The password check is the k-anonymous one and is kept distinct in the copy. The network choke point permits the address only because the request declares `carries: 'address'`, and the self-audit journal records that it left.
- **Behavior notes:** the reuse answer is **on the password warning, not behind a control**. Between 2026-08-08 and 2026-08-09 there was no answer at all: a "Check reuse" control opened `options.html#reuse=`, a hash nothing read, and the index it implied was never built. A panel answering "no reuse found" from a store that does not exist tells the safest possible lie, so the control was removed rather than left lying. The index exists now (`reuse` store, DB v4) and the warning says one of three things — the other sites, "not seen on any other site on this device", or "unknown: this device has not seen it before". The third is the one the old control could not say, and it is what a fresh install has to say
- **Behavior notes (address field):** the field is moved between repaints, never rebuilt, and **its focus and caret are carried with it**. Moving a node keeps its value; removing it from the document blurs it, and native typing needs a focused element to land in — so an address typed while the page was still settling went nowhere. That was the four-day flake tracked as #29: `apps/extension/src/options/keep-focus.ts` carries the rule
- **Wireframe:** wireframes/SCR-08.md
- **Coverage:** packages/ui/src/leaks/leaks.ts:renderLeaks, packages/core-leaks/src/group.ts:groupLeaks, packages/core-leaks/src/merge.ts:mergeLeaks, e2e/scn-015.spec.ts
- **Scenarios:** SCN-014, SCN-015, SCN-016
- **Resources:** source adapters (HIBP, XposedOrNot, Hudson Rock), local hash store, **reuse index** — `reuse` store keyed by [tag, host], tag = HMAC-SHA-256 over the leak-check digest under a device-local random key ([privacy](../privacy.md))
- **Status:** built

### SCR-09: Extensions watch
- **Used by:** FLW-12
- **Purpose:** the inventory plus what changed in it — the delta is the product, not the list
- **Elements:** installed extensions with risk level and last change; deltas highlighted at the top (permissions added, publisher changed, silent update); per-item detail with static findings (obfuscation, `eval`, remote code, endpoints, **powers over the browser** — `chrome.debugger`, a native host, traffic rewriting — and bulk reads of history, bookmarks or identity); **primary action: "Отключить"**; "Это изменение нормально"; "Разобрать пакет"
- **States:**
  | State | Trigger | Figma frame | Behavior |
  |-------|---------|-------------|----------|
  | loading | inventory or package analysis running | - | list renders first, analysis fills in |
  | empty | no extensions installed | - | plain statement, no filler. **Built 2026-08-20:** the list rendered its heading with no rows under "nothing has changed since the last check" — two true sentences that together read as "we looked and there is nothing to say", when the fact is that there is nothing to look at (B-59) |
  | error | package could not be fetched | - | permission delta still shown; analysis marked unavailable |
  | success | inventory with deltas | - | deltas first, then the rest by risk |
- **Wireframe:** wireframes/SCR-09.md
- **Coverage:** packages/ui/src/extensions/extensions.ts:renderExtensions, packages/core-extensions/src/diff.ts:diffInventory, e2e/scn-017.spec.ts
- **Scenarios:** SCN-017, SCN-018
- **Resources:** management adapter, snapshot store, CRX static analyser
- **Status:** built

### SCR-10: Self-audit
- **Used by:** FLW-13, FLW-17
- **Purpose:** make "we don't collect your browsing" verifiable rather than promised
- **Elements:** outbound request log — time, destination, purpose, payload shape, what triggered it; filters by period and feature; **primary action: "Выгрузить журнал"**; per-row detail with the exact bytes sent and redaction applied; a one-line summary ("this week: N requests, none containing a URL or address")
- **States:**
  | State | Trigger | Figma frame | Behavior |
  |-------|---------|-------------|----------|
  | loading | opening the log | - | skeleton rows |
  | empty | nothing sent yet | - | "Nothing has been sent from this device" |
  | error | journal unreadable | - | states the problem and offers repair; never shows an empty list on error |
  | success | entries exist | - | newest first, grouped by purpose |
- **Behavior notes:** this log is written by the single network choke point before each request; if a request could bypass it, the guarantee is void — enforced by lint and test, not by convention
- **Wireframe:** wireframes/SCR-10.md
- **Coverage:** packages/ui/src/self-audit/panel.ts:renderSelfAudit, apps/extension/src/options/index.ts
- **Scenarios:** SCN-019
- **Resources:** net layer journal, exporter
- **Status:** built

### SCR-11: Journal and weekly diff
- **Used by:** FLW-17
- **Purpose:** what changed since last time — not an ever-growing red list
- **Elements:** a default view scoped to what changed since the last check; grouped by type; each entry with verdict, action taken, and whether it was automatic; toggle to full history; retention statement
- **States:**
  | State | Trigger | Figma frame | Behavior |
  |-------|---------|-------------|----------|
  | empty | nothing changed | - | "Nothing changed since <time>" |
  | success | changes exist | - | grouped diff, newest first |
- **Wireframe:** wireframes/SCR-11.md
- **Coverage:** packages/core-queue/src/diff.ts:diffSince, packages/ui/src/journal/journal.ts:renderJournal, e2e/scn-020.spec.ts
- **Scenarios:** SCN-021
- **Resources:** event journal, diff selector
- **Status:** built

### SCR-12: Settings
- **Used by:** FLW-05 (watchlist edit), FLW-14
- **Purpose:** the few switches that change behaviour, plus data ownership
- **Elements:** brand watchlist (add/edit/remove); quiet mode toggle; proxy on/off with a plain explanation of what each option reveals and to whom; retention period; **primary action: "Выгрузить все данные"**; "Удалить все данные" (разрушительное, подтверждается списком того, что удаляется — **по одному виду на каждое хранилище, девять**; список приходит из схемы, а не пишется рядом с ней, и рендерер отказывается рисовать подтверждение, которое не называет ничего). **The trusted domains list moved to SCR-16** on 2026-08-12: the dashboard lists one area per view, the overview names "Доверенные домены" and "Ваши данные" separately, and reviewing what you trusted is a different job from exporting and wiping
- **States:**
  | State | Trigger | Figma frame | Behavior |
  |-------|---------|-------------|----------|
  | success | default | - | grouped settings |
  | error | export or wipe failed | - | inline failure with retry; state left unchanged |
- **Wireframe:** wireframes/SCR-12.md
- **Coverage:** packages/ui/src/settings/data-controls.ts:renderDataControls, e2e/scn-024.spec.ts (data controls built; watchlist, quiet mode and the proxy toggle land with their modules)
- **Scenarios:** SCN-023, SCN-024
- **Resources:** settings store, exporter, wipe routine
- **Status:** built

### SCR-13: Recovery checklist
- **Used by:** FLW-06, FLW-07, FLW-16
- **Purpose:** turn "I already did the bad thing" into an ordered, finishable list
- **Elements:** incident type picker (ran a pasted command / entered a password / called a number or gave screen access / not sure); ordered steps, most damaging first, each with why; per-step done state; "Продолжить на другом устройстве" instructions; **primary action: the current step**
- **States:**
  | State | Trigger | Figma frame | Behavior |
  |-------|---------|-------------|----------|
  | loading | building the checklist | - | brief; steps are local |
  | empty | no incident selected | - | the picker, nothing else. **Built 2026-08-20:** every checklist opened because a detector fired, so someone who ran the pasted command and realised afterwards had no way in — `#recovery` with no kind opened the overview and reported itself unrecognised (B-59) |
  | success | checklist active | - | one current step highlighted, rest visible |
  | success (broad) | the incident name is not one we have a playbook for — including an address this product never produces | - | the "not sure" list, with the fallback stated on screen rather than implied |
- **Behavior notes:** no time estimates, no reassurance copy, no scare copy; progress survives a browser restart. **The picker offers one choice per playbook that exists, and "not sure" is last.** It listed a fifth until 2026-08-20 — a kind `core-recovery` has no steps for — and a choice whose answer is the broad list under a specific name is the screen claiming to know more than it does. Last rather than first because put at the top it is what a hurried person picks to skip the question, and the checklist they get is the broad one when a specific one existed. **A malformed address renders the broad list, it does not render nothing** — `#recovery=%E0%A4%A` (a broken escape) and `#recovery=constructor` (a name off `Object.prototype`) each left this screen completely blank until 2026-08-20, which is the worst place in the product for a blank screen
- **Wireframe:** wireframes/SCR-13.md
- **Coverage:** packages/ui/src/recovery/picker.ts:renderIncidentPicker, packages/ui/src/recovery/recovery.ts:renderRecovery, packages/core-recovery/src/checklist.ts:buildChecklist, packages/core-recovery/src/portable.ts:toPortable, e2e/scn-025.spec.ts
- **Scenarios:** SCN-025
- **Resources:** playbook definitions, incident store
- **Status:** built

### SCR-14: Public domain status
- **Used by:** FLW-04 (from the interstitial), FLW-15
- **Purpose:** let an affected site owner see and dispute a verdict without an account — the gap that generated the loudest complaint about the incumbent
- **Elements:** domain lookup field; current verdict with feed source and entry date; upstream appeal link when the verdict came from a third-party feed; appeal form (domain, contact, note) with reference id; **primary action: "Проверить"**
- **States:**
  | State | Trigger | Figma frame | Behavior |
  |-------|---------|-------------|----------|
  | loading | lookup running | - | none of its own — the page is served whole, so the browser's own loading is the only progress there is |
  | empty | domain not in any list | - | "Nothing is recorded for this domain" |
  | error | service unavailable | - | states it plainly and offers retry; never implies "clean" |
  | success | verdict found | - | verdict, source, date, appeal path |
- **Behavior notes:** a public web page, not an extension surface; no account, no tracking, no analytics. **Served whole, with no script:** the verdict and the appeal form are both in the markup, because the owner arrives from an interstitial on a site that is down and has no reason to run another page's JavaScript. The appeal form appears only for listings this service can lift — a form against a third-party feed collects a plea nobody reads
- **Wireframe:** wireframes/SCR-14.md
- **Coverage:** apps/proxy/src/router.ts:statusPage (verdict and appeal form in the markup), apps/proxy/src/router.ts:appeal + appealPage (accepts the form, answers as a page), apps/proxy/src/router.test.ts
- **Scenarios:** SCN-026
- **Resources:** worker status endpoint, feed metadata
- **Web surface:**
  - **Route:** `/status`, and `/status?domain=<domain>` for a named domain
  - **Answers:** is this one domain listed, by which list, and how the owner disputes it
  - **Indexable:** yes — `canonical` → `/status?domain=<domain>` per lookup, built in `apps/proxy/src/router.ts:statusPage`, so a shared link and the page agree
  - **Without JS:** wholly — the verdict and the appeal form are both in the markup, because the owner arrives from an interstitial on a site that is down
  - **Entity:** none. The page is a lookup result about someone else's domain, not a thing this product offers; a `SoftwareApplication` block here would describe the wrong subject
- **Status:** built

### SCR-15: Dashboard overview
- **Used by:** FLW-17
- **Purpose:** answer "what needs me, and where do I go" before any area is opened — the question the eight-panel stack made the user assemble by scrolling
- **Elements:** attention band `"Требует внимания (N)"`, at most three rows, the rest counted as `"…ещё N"`, each row severity-by-icon-plus-text with what, where and when, linking into its area; area list of eight real links, each with a one-line state. **Primary action: the first row of the attention band**; with an empty band, `"Что делать дальше"`
- **States:**
  | State | Trigger | Figma frame | Behavior |
  |-------|---------|-------------|----------|
  | loading | page opened | - | shell and all eight rows paint at once, each row's state reads `"считаем…"` and the band `"Считаем…"`; the shell never waits on data. The record said `"…"` for the row state until 2026-08-20: a bare ellipsis is not a state a screen reader can read out, on the one screen whose axe sweep is a gate — and it must not be `null`, which on this screen means "looked and could not read it" |
  | empty | nothing outstanding anywhere | - | `"Сейчас ничего не требует внимания"` plus when this was last checked; the area list still carries its states |
  | error | the store is unreadable | - | names the failure, offers repair, and **no area row claims a state** |
  | success | outstanding items exist | - | up to three ranked rows, then the eight areas |
- **Behavior notes:** one ranking rule for the whole product — `packages/core-queue/src/rank.ts` orders the band, with each area's outstanding item mapped into the shape it already ranks; a second ranker would be a second definition of "worst". **A row whose count could not be read says `"состояние не прочитано"`, never `"пусто"`** — absence of data must never read as a pass, and eight cheap reads that can each fail all render into one reassuring word. Areas are addressed by hash, one view at a time; **an unknown hash opens the overview and names the hash**, because a silent fallback is how `options.html#journal` went nowhere for a release. Navigation is real links plus `hashchange`, so browser back and forward work without a router. The overview reads counts only, never a section's full data. **The recovery row is the one whose address depends on what is open:** `#recovery` alone names no incident, so with exactly one open checklist the row opens that checklist, and with none or several it opens the overview — where the band lists them. It was given the overview's address outright until 2026-08-20, so a row reading «Восстановление» landed somewhere else (B-59); the rule is `recoveryHref` in `options/views.ts` and the state beside the label says which case it is
- **Wireframe:** wireframes/SCR-15.md
- **Coverage:** packages/ui/src/dashboard/overview.ts:renderOverview, apps/extension/src/options/views.ts:routeFor, apps/extension/src/options/views.ts:recoveryHref, apps/extension/src/options/keep-focus.ts:keepingFocus, e2e/scn-027.spec.ts
- **Scenarios:** SCN-027, SCN-028, SCN-029, SCN-030
- **Resources:** `packages/core-queue/src/rank.ts` (ranking), the counts each area can answer cheaply
- **Status:** built

### SCR-16: Trusted domains
- **Used by:** FLW-05, FLW-14
- **Purpose:** review and take back the "this is legitimate" decisions made on other screens
- **Elements:** the trusted list, each entry with when and why it was trusted; per-entry `"Убрать из доверенных"`. **Primary action: none** — this is a review surface whose only action is a reversal
- **States:**
  | State | Trigger | Figma frame | Behavior |
  |-------|---------|-------------|----------|
  | empty | nothing trusted yet | - | says nothing is trusted **and why the list would fill** — an empty state that only states emptiness leaves the user with nothing to do |
  | success | entries exist | - | each with when and why, each reversible |
  | error | store unreadable | - | names the read failure; never an empty list in its place. The sentence was built by the options page rather than by this renderer until 2026-08-20, so this record named a file the state did not live in and no renderer test nor the axe sweep could reach it (B-59) |
- **Behavior notes:** split out of SCR-12 on 2026-08-12 — the dashboard renders one area per view, and the overview names `"Доверенные домены"` and `"Ваши данные"` as separate rows. The renderer and its e2e already existed; only the address changes
- **Wireframe:** wireframes/SCR-16.md
- **Coverage:** packages/ui/src/trusted/trusted.ts:renderTrusted (states `ready` and `error`), e2e/scn-024.spec.ts
- **Scenarios:** SCN-024
- **Resources:** trusted-domain store
- **Status:** built

### SCR-17: Product landing page
- **Used by:** FLW-18 (deciding whether to install). **The gap recorded here on 2026-08-12 is closed 2026-08-20 (B-22)** — and the way it was recorded is why closing it was easy: the entry said a flow traced to no story would be a diagram rather than a design, and named the missing piece instead of inventing one. ST-021 is that story, FLW-18 the flow, SCN-033 the scenario
- **Purpose:** let someone who has never heard of this decide whether to install it — including by reading what it refuses to do
- **Elements:** what the product is in one sentence; what it does; **what it does not do** (half the page); how to install; links to `/privacy` and `/status`. **Primary action: install**
- **States:**
  | State | Trigger | Figma frame | Behavior |
  |-------|---------|-------------|----------|
  | success | any request to `/` | - | the whole page, served as markup |
- **Behavior notes:** a security tool that lists only its own powers describes a product nobody can check — so half the page is what it does not do. **No executable scripts at all**, and eleven rules in `apps/proxy/src/landing.test.ts` hold that, four of them verified by planted defects (a script appeared, the word "полностью" appeared, the does-not-do list was gutted, the structured block became invalid JSON)
- **Web surface:**
  - **Route:** `/`
  - **Answers:** what Okolos is, what it does, and what it will not do
  - **Indexable:** yes — `canonical` → the origin's `/`, emitted by `apps/proxy/src/router.ts:landingPage`
  - **Without JS:** wholly — there is not one script on the page, by gate
  - **Entity:** `schema.org/SoftwareApplication` in `application/ld+json`, repeating the page's own claims in machine form, built in `apps/proxy/src/router.ts:landingPage`
- **Coverage:** apps/proxy/src/router.ts:landingPage, apps/proxy/src/landing.test.ts
- **Scenarios:** none — a scenario needs a flow node to cover, and this screen has no flow (see `Used by`). The eleven rules in `landing.test.ts` are what hold it meanwhile, and they are gates rather than scenarios
- **Resources:** worker root route
- **Status:** built

### SCR-18: Privacy page
- **Used by:** FLW-18 (deciding whether to install), as the second step. It is also linked from the store listing and from the extension, and it is the document SCR-10 (self-audit) must agree with. **The gap recorded here on 2026-08-12 closed 2026-08-20 (B-22):** the pre-install journey is in the chain now — JRN-01 stages 2 and 3 always carried it, and what was missing was ST-021 between the journey and these pages
- **Purpose:** state what leaves the device, where to, why, and what is never stored — the document the store requires and the one the self-audit screen must agree with
- **Elements:** the five outbound destinations with what each carries; what is stored on the device and for how long; the reuse-index paragraph; what does not exist (no analytics, no account, no ads); why the extension asks for every site
- **States:**
  | State | Trigger | Figma frame | Behavior |
  |-------|---------|-------------|----------|
  | success | any request to `/privacy` | - | the whole page, served as markup |
- **Behavior notes:** generated from `docs/privacy.md` by `tools/privacy-page.mjs` into `apps/proxy/src/privacy.generated.ts`, so the served page and the repository document cannot disagree; `tools/docs.test.ts` checks the destination list, the retention period and the recipients against the sources. It must also agree with SCR-10 (self-audit), which shows the same outbound log from the device side
- **Web surface:**
  - **Route:** `/privacy`
  - **Answers:** what this extension sends, to whom, when, and what it keeps
  - **Indexable:** yes — **but the page carries no `canonical`** — `apps/proxy/src/router.ts:privacyPage` serves it without one, unlike `/` and `/status`. Harmless on a single host; the moment a custom domain is added, two hosts serve this page with nothing pointing at the preferred one. Fix belongs with the domain change
  - **Without JS:** wholly — generated HTML, no scripts
  - **Entity:** none yet. The natural one is `schema.org/PrivacyPolicy`; recorded here as a gap rather than claimed
- **Coverage:** apps/proxy/src/router.ts:privacyPage, tools/privacy-page.mjs, tools/docs.test.ts
- **Scenarios:** none — same reason as SCR-17. `tools/docs.test.ts` holds the page against its sources meanwhile
- **Resources:** `docs/privacy.md` (the source), the outbound-log contract
- **Status:** built

### SCR-19: Lookalike comparison
- **Used by:** FLW-05 (from the lookalike banner)
- **Purpose:** show the visited address beside the one it imitates, so the user sees the difference instead of being told about it
- **Elements:** the address as the bar holds it (`[data-role=visited]`); its decoded spelling when the two differ (`[data-role=decoded]`); the name it resembles (`[data-role=resembles]`); one sentence naming the technique (`[data-role=why]`); **primary action "Уйти"**, "Это настоящий сайт", "Закрыть"; a note saying the decision is reversible in settings (`[data-role=trust-note]`)
- **States:**
  | State | Trigger | Figma frame | Behavior |
  |-------|---------|-------------|----------|
  | success | opened from the banner | - | both spellings side by side, the address at full size |
  | no decoding | the address is plain ASCII | - | the decoded row is absent rather than repeating the visited one |
- **Recorded here on 2026-08-20, having been built long before.** It was the fourth in-page surface and the only one outside [ADR-0001](../adr/0001-closed-shadow-root.md): a bare `<section>` appended to the page's own `body`, with no shadow root and **no stylesheet at all** — not one line of CSS in its module. The page it warns about could read it, restyle it and delete it, and it did not need to try: on the hostile fixture the accessibility suite already ships, a `*` rule rendered it as six-pixel grey on grey. The suite audited the three surfaces the ADR names, so nothing looked. A screen with no record is a screen nobody compares against anything
- **Design system:** the shared overlay tokens, like the other three. It carries no palette of its own, and a test asserts there are no hex literals in its stylesheet — three surfaces once accumulated twenty-two hexes between them
- **Coverage:** packages/ui/src/comparison/comparison.ts:mountComparison, packages/ui/src/comparison/comparison.test.ts, e2e/scn-006.spec.ts, e2e/a11y-overlays.spec.ts
- **Scenarios:** SCN-006, SCN-024
- **Status:** built

### SCR-20: Local store unavailable
- **Used by:** FLW-14 (in place of every area, when the store cannot be opened)
- **Purpose:** say which of two different things happened, and offer the two things a person can do about it
- **Elements:** heading; `[data-role=storage-why]` — one sentence per problem, and the sentences differ because the remedies do; `[data-role=storage-versions]` — the profile's version and this build's, absent rather than invented when the profile could not be read at all; `[data-role=storage-detail]` — the underlying message verbatim, last, because it is what a bug report needs and not what a user should read first; **primary action "Попробовать снова"**, "Очистить локальные данные", and `[data-role=storage-reset-note]` listing everything clearing destroys
- **States:**
  | State | Trigger | Figma frame | Behavior |
  |-------|---------|-------------|----------|
  | from a newer version | the profile's schema version is higher than this build's | - | says the data is intact and reinstalling the newer build opens it |
  | shape incomplete | the store opened and lacks a store or an index | - | says updating will not fix it, because a browser changes a schema only on a version change |
  | blocked | another copy of Okolos holds the store | - | says to close the other window; trying again then works |
  | unknown | anything else | - | says the reason is below, and shows it |
- **Replaces six errors with one panel.** Every section of the options page reads the store and catches its own failure, so a profile written by a newer build rendered the browser's sentence about requested and existing versions once per panel, in a page that was otherwise empty. The check runs before any area is built
- **There is no confirmation behind "Clear the local data" — this panel is the confirmation.** The note carries what the wipe dialog's list carries, because a user agreeing to a word is not a user who agreed
- **Coverage:** packages/ui/src/storage/storage-problem.ts:renderStorageProblem, packages/ui/src/storage/storage-problem.test.ts, apps/extension/src/options/index.ts:storageProblem
- **Scenarios:** SCN-032
- **Status:** built
