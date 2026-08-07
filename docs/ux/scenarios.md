<!-- Managed with super-ux (ux-contract v4). Update in the same change as any user-facing behavior change. -->

# Scenarios — source of truth for user-facing behavior

Scope: P0–P5. Every scenario traces to a story in
[foundation.md](foundation.md) and a flow in [flows.md](flows.md); screens
are specified once in [screens.md](screens.md).

## Index

| ID | Title | Feature | Persona | Traces | Status | Last audit |
|----|-------|---------|---------|--------|--------|------------|
| SCN-001 | First run — clean result | onboarding | P-01 | ST-018, FLW-01 | implemented | 2026-08-04 PARTIAL |
| SCN-002 | First run — findings found | onboarding | P-01 | ST-018, ST-015, FLW-01 | implemented | 2026-08-05 PASS |
| SCN-003 | Hidden instruction detected on a page | ai-shield | P-01 | ST-001, FLW-02 | implemented | 2026-08-04 PASS |
| SCN-004 | Inspect what was hidden | ai-shield | P-01 | ST-002, FLW-02 | implemented | 2026-08-04 PASS |
| SCN-005 | Neutralise and restore | ai-shield | P-01 | ST-003, FLW-02 | implemented | 2026-08-04 PASS |
| SCN-006 | Lookalike domain warning | web-guard | P-01 | ST-006, FLW-05 | implemented | 2026-08-05 PASS |
| SCN-007 | Known-malicious page blocked | web-guard | P-02 | ST-005, ST-016, FLW-04 | implemented | 2026-08-05 PASS |
| SCN-008 | ClickFix — page copies a command | web-guard | P-02 | ST-007, FLW-06 | implemented | 2026-08-05 PASS |
| SCN-009 | Browser-lock trap escape | web-guard | P-02 | ST-008, FLW-07 | implemented | 2026-08-05 PASS |
| SCN-010 | Agent blocked from acting on a poisoned page | ai-shield | P-01 | ST-004, FLW-03 | implemented | 2026-08-05 PASS |
| SCN-011 | Credential-entry guard on a new domain | web-guard | P-02 | ST-010, FLW-09 | implemented | 2026-08-05 PASS |
| SCN-012 | Download stopped by feed or hash | web-guard | P-01 | ST-009, FLW-08 | implemented | 2026-08-05 unit |
| SCN-013 | Download partially checked — hash unavailable | web-guard | P-01 | ST-009, FLW-08 | implemented | 2026-08-05 unit |
| SCN-014 | Submitted password is compromised | credentials | P-01 | ST-011, FLW-10 | implemented | 2026-08-05 unit |
| SCN-015 | Leak inventory with one source unavailable | credentials | P-01 | ST-012, FLW-11 | implemented | 2026-08-05 PASS |
| SCN-016 | Repair a leak and mark it resolved | credentials | P-01 | ST-015, ST-012, FLW-11 | implemented | 2026-08-05 unit |
| SCN-017 | Extension gained permissions — disable it | extensions | P-01 | ST-013, ST-014, FLW-12 | implemented | 2026-08-05 PASS |
| SCN-018 | Extension changed publisher, package unavailable | extensions | P-01 | ST-013, FLW-12 | implemented | 2026-08-05 PASS |
| SCN-019 | Verify what left the device | privacy | P-01 | ST-017, FLW-13 | implemented | 2026-08-04 PASS |
| SCN-020 | Popup — verdict for the current page | daily-use | P-01 | ST-015, FLW-17 | implemented | 2026-08-05 PASS |
| SCN-021 | What changed since last time | daily-use | P-01 | ST-015, FLW-17 | implemented | 2026-08-05 PASS |
| SCN-022 | Queue never exceeds three actions | daily-use | P-01 | ST-015, FLW-01 | implemented | 2026-08-05 PASS |
| SCN-023 | Wipe all local data | privacy | P-01 | ST-019, FLW-14 | implemented | 2026-08-04 PARTIAL |
| SCN-024 | Export all local data | privacy | P-01 | ST-019, FLW-14 | implemented | 2026-08-04 PARTIAL |
| SCN-025 | Recovery after running a pasted command | recovery | P-02 | ST-015, FLW-16 | implemented | 2026-08-05 PASS |
| SCN-026 | Site owner checks and appeals a verdict | site-owner | P-03 | ST-016, FLW-15 | implemented | 2026-08-05 unit |

## Personas

See [foundation.md](foundation.md) → Personas.

## onboarding

### SCN-001: First run — clean result
- **Persona:** P-01
- **Feature:** onboarding
- **Traces:** ST-018, FLW-01 (JTBD-02, JRN-01/#4)
- **Entry point:** extension just installed, first-run screen opens automatically
- **Preconditions:** no prior local data
- **Steps:**
  1. User finishes installing -> system opens the first-run screen and starts local checks, listing each check by name with live progress
  2. User watches the checks complete -> system reports nothing found and names every check that ran and when its data was last updated
  3. User closes the screen -> system leaves the toolbar icon in a neutral state and records the run time
- **Expected result:** the user knows, within 30 seconds and without an account, that their open tabs and installed extensions were checked locally and nothing was found
- **Alt paths:** user clicks "Skip for now" mid-run -> system finishes the checks in the background and surfaces results in the popup badge only if something is found
- **UI elements:** first-run screen, per-check progress rows, "what this sends" link, "See what to do first" (disabled when nothing found), "Skip for now"
- **States covered:** loading, empty, success
- **Errors & recovery:** a check cannot run (e.g. corpus still downloading) -> that row states the reason and offers retry; the other checks continue and the result explicitly says the run was partial
- **Status:** implemented
- **Coverage:** packages/ui/src/first-run/screen.ts:renderFirstRun, apps/extension/src/first-run/index.ts — PARTIAL: the tab and extension inventories this scenario describes need permissions this version deliberately does not request, so those rows render as `unavailable` with the reason. They become `ok` with REQ-23 (extensions) and the tabs permission that justifies it

### SCN-002: First run — findings found
- **Persona:** P-01
- **Feature:** onboarding
- **Traces:** ST-018, ST-015, FLW-01 (JTBD-02, JTBD-04, JRN-01/#4)
- **Entry point:** first-run screen, checks completed with findings
- **Preconditions:** at least one open tab with a finding, or one extension with a risk signal
- **Steps:**
  1. User waits for the checks -> system shows findings grouped by category with counts
  2. User clicks "See what to do first" -> system opens the findings queue with at most three prioritised actions
  3. User opens the top item -> system shows what happened, why it matters, and one executable action
- **Expected result:** the user's first interaction ends with a concrete action available, not a list to read
- **Alt paths:** user ignores the queue and closes it -> items stay in the queue and the toolbar badge shows the count
- **UI elements:** findings summary by category, "See what to do first", queue items, per-item primary action, "not now"
- **States covered:** loading, error, success
- **Errors & recovery:** queue store unreadable -> the queue states the storage problem rather than showing an empty list
- **Status:** implemented
- **Coverage:** packages/ui/src/queue/queue.ts:renderQueue, apps/extension/src/first-run/index.ts, e2e/scn-002.spec.ts

## ai-shield

### SCN-003: Hidden instruction detected on a page
- **Persona:** P-01
- **Feature:** ai-shield
- **Traces:** ST-001, FLW-02 (JTBD-01, JRN-01/#5)
- **Entry point:** any page load or DOM mutation batch
- **Preconditions:** the page contains text present in the DOM but not perceivable by a human, phrased as an instruction
- **Steps:**
  1. User opens the page -> system runs the visibility diff, then rules, and raises a finding
  2. User sees the banner naming the finding in one sentence -> system states whether the text was already neutralised
  3. User continues reading the page -> system keeps the banner until dismissed or the tab closes
- **Expected result:** the user knows the page carries instructions addressed to an AI, and whether they are still active
- **Alt paths:** the page is on the user's trusted list for this rule -> system logs the finding to the journal without showing a banner
- **UI elements:** in-page banner (injection variant), "Show me", "This is wrong", dismiss
- **States covered:** success
- **Errors & recovery:** the classifier stage fails or times out -> the verdict falls back to the deterministic stages, the banner states that detection was partial; a detector exception disables that detector for the session and is journalled, and the page is never broken
- **Telemetry:** none — no analytics events are emitted by this product
- **Status:** implemented
- **Coverage:** apps/extension/src/content/collect.ts:collect, packages/core-injection/src/stage1.ts:detectHidden, packages/ui/src/banner/banner.ts:mountBanner, e2e/scn-003.spec.ts

### SCN-004: Inspect what was hidden
- **Persona:** P-01
- **Feature:** ai-shield
- **Traces:** ST-002, FLW-02 (JTBD-01, JTBD-05)
- **Entry point:** "Show me" on the injection banner
- **Preconditions:** an active finding on the current page
- **Steps:**
  1. User clicks "Show me" -> system opens the inspector with the concealed text verbatim
  2. User reads the evidence -> system shows the concealment technique, the DOM location, which stage fired and its confidence
  3. User decides -> system offers "Keep it neutralised", "Restore page", "This is wrong"
- **Expected result:** the user can judge the verdict from the evidence rather than trusting a score
- **Alt paths:** the page mutated and the node no longer exists -> system says the page changed and offers a re-scan
- **UI elements:** inspector panel, concealed text block, technique label, location path, stage and confidence, three actions
- **States covered:** loading, success, error
- **Errors & recovery:** evidence cannot be loaded -> inline failure with retry; the banner and the neutralisation both remain in place
- **Status:** implemented
- **Coverage:** packages/ui/src/inspector/inspector.ts:mountInspector, apps/extension/src/content/index.ts:MEASURE_COLLECT, e2e/scn-004-click.spec.ts — the click path is exercised against a build whose only difference is an open shadow root (REQ-35); a bundle gate asserts production keeps it closed

### SCN-005: Neutralise and restore
- **Persona:** P-01
- **Feature:** ai-shield
- **Traces:** ST-003, FLW-02 (JTBD-01, JRN-01/#6)
- **Entry point:** a high-confidence finding on a page the user is about to hand to an assistant
- **Preconditions:** injection confirmed by the deterministic stages
- **Steps:**
  1. User opens a page with a confirmed injection -> system neutralises the offending nodes before the page settles and states this in the banner
  2. User asks their assistant to summarise the page -> system leaves the assistant with the cleaned DOM
  3. User clicks "Restore page" -> system puts the original nodes back exactly and marks the finding unresolved
- **Expected result:** the assistant reads a page without planted instructions, and the user can always get the original page back
- **Alt paths:** confidence is below the automatic threshold -> system warns but does not modify the page; neutralisation becomes a button
- **UI elements:** banner statement "hidden instructions removed", "Restore page", "Keep it neutralised"
- **States covered:** success, error
- **Errors & recovery:** removal fails on a protected node -> system reports which nodes could not be neutralised and keeps warning; restore always returns the DOM to its pre-change state
- **Status:** implemented
- **Coverage:** packages/core-sanitizer/src/plan.ts:planSanitisation, apps/extension/src/content/sanitize.ts:Sanitiser, e2e/scn-005.spec.ts

### SCN-010: Agent blocked from acting on a poisoned page
- **Persona:** P-01
- **Feature:** ai-shield
- **Traces:** ST-004, FLW-03 (JTBD-01, JRN-01/#6)
- **Entry point:** a sensitive action is attempted from a page carrying an unresolved finding
- **Preconditions:** finding present and not resolved or dismissed
- **Steps:**
  1. User's assistant attempts a sensitive action -> system pauses it and opens the gate naming the action and the finding
  2. User clicks "Show the injection" -> system opens the inspector, then returns to the gate
  3. User clicks "Block" -> system cancels the action and journals the decision
- **Expected result:** no action proceeds from a compromised page without an explicit human decision
- **Alt paths:** user clicks "Allow once" -> the action proceeds and is journalled with the finding attached
- **UI elements:** gate modal, action description, finding line, "Block" (default), "Allow once", "Show the injection"
- **States covered:** success, error
- **Errors & recovery:** the action context cannot be identified -> system blocks and states what could not be determined; the gate timing out defaults to Block, never to Allow; the gate surface itself cannot be shown -> the action is blocked and journalled
- **Known limit:** the hold is driven by DOM events the browser marks untrusted. A page calling `form.submit()` directly fires no event at all and cannot be seen from an isolated world; a scripted click or `requestSubmit()` — what agent tooling actually does — is caught.
- **Status:** implemented
- **Coverage:** packages/core-gate/src/decide.ts:assessAction, apps/extension/src/content/agent-gate.ts:AgentGate, packages/ui/src/gate/gate.ts:mountGate, e2e/scn-010.spec.ts

## web-guard

### SCN-006: Lookalike domain warning
- **Persona:** P-01
- **Feature:** web-guard
- **Traces:** ST-006, FLW-05 (JTBD-02)
- **Entry point:** navigation to a domain within confusable or typo distance of the watchlist or the popular-domains list
- **Preconditions:** the domain is not on the user's trusted list
- **Steps:**
  1. User opens the page -> system decodes punycode, normalises confusables, and raises the lookalike finding
  2. User clicks "Show comparison" -> system shows the visited domain and the expected one side by side, with the decoded form
  3. User clicks "Leave" -> system returns to the previous page
- **Expected result:** the user sees both spellings before interacting with the page
- **Alt paths:** user clicks "This is legitimate" -> the domain is trusted, the warning stops here on, and the entry is editable in settings
- **UI elements:** banner (lookalike variant), comparison view, decoded punycode, "Leave", "This is legitimate", dismiss
- **States covered:** success
- **Errors & recovery:** the watchlist cannot be read -> comparison falls back to the popular-domains list that ships with the extension
- **Status:** implemented
- **Coverage:** packages/core-lookalike/src/check.ts:checkLookalike, apps/extension/src/content/lookalike.ts:warnIfLookalike, e2e/scn-006.spec.ts

### SCN-007: Known-malicious page blocked
- **Persona:** P-02
- **Feature:** web-guard
- **Traces:** ST-005, ST-016, FLW-04 (JTBD-02, JRN-03/#2)
- **Entry point:** navigation to a URL matching a signed feed entry
- **Preconditions:** feeds present and signature-verified
- **Steps:**
  1. User clicks a link -> system replaces the page with the interstitial before it renders
  2. User reads why -> system names the feed that produced the verdict and the entry's date
  3. User clicks "Go back" -> system returns to the previous page
- **Expected result:** the malicious page never renders and the user understands on whose authority it was blocked
- **Alt paths:** user clicks "Continue anyway" -> system states that an exception will be remembered and journalled, then loads the page; user clicks "I own this site" -> system opens the public domain status page
- **UI elements:** interstitial, verdict source line, "Go back" (primary), "Continue anyway", "I own this site", "Details"
- **States covered:** success, error
- **Errors & recovery:** feed metadata unavailable -> the block still applies, the interstitial says the source is unknown and how to check it; feeds stale beyond the freshness window -> the interstitial states the data age
- **Status:** implemented
- **Coverage:** packages/core-feeds/src/rules.ts:buildRules, packages/ui/src/interstitial/interstitial.ts:renderInterstitial, e2e/scn-007.spec.ts

### SCN-008: ClickFix — page copies a command
- **Persona:** P-02
- **Feature:** web-guard
- **Traces:** ST-007, FLW-06 (JTBD-02, JRN-03/#3)
- **Entry point:** a script writes a shell-like payload to the clipboard without a genuine user copy action
- **Preconditions:** none — the hosting site is usually a legitimate compromised one
- **Steps:**
  1. User clicks the fake "verify you are human" control -> system detects the scripted clipboard write and shows a blocking warning
  2. User reads it -> system states in one sentence that a real verification never asks you to leave the browser, and shows the copied text verbatim
  3. User clicks "Leave page" -> system returns to the previous page
- **Expected result:** the user does not paste the command into a system dialog
- **Alt paths:** user clicks "I already ran it" -> system opens the recovery checklist for pasted commands; user dismisses -> dismissal requires a deliberate action and leaves a persistent marker on the page
- **UI elements:** blocking banner (clickfix variant), copied text block, "Leave page" (primary), "I already ran it", deliberate dismiss control
- **States covered:** success
- **Errors & recovery:** clipboard content cannot be read -> the warning still appears based on the write event and the page pattern, and says the content could not be displayed
- **Status:** implemented
- **Coverage:** packages/core-traps/src/clickfix.ts:detectClickFix, apps/extension/src/content/traps.ts:watchForTraps, e2e/scn-008.spec.ts

### SCN-009: Browser-lock trap escape
- **Persona:** P-02
- **Feature:** web-guard
- **Traces:** ST-008, FLW-07 (JTBD-02, JTBD-06)
- **Entry point:** a page forces fullscreen without a user gesture, or loops modal dialogs
- **Preconditions:** none
- **Steps:**
  1. User lands on the page -> system exits the forced fullscreen and suppresses the dialog loop
  2. User sees the banner -> system states plainly that the warning on the page is fake and no company is watching their computer
  3. User clicks "Close this page" -> system closes the tab or returns to the previous page
- **Expected result:** the user regains control of the window and does not call the number on screen
- **Alt paths:** user clicks "I already called them" -> system opens the recovery checklist for that case
- **UI elements:** banner (techsupport variant), "Close this page" (primary), "I already called them", dismiss
- **States covered:** success, error
- **Errors & recovery:** dialogs cannot be fully suppressed in this context -> system says so and directs the user to close the tab
- **Status:** implemented
- **Coverage:** packages/core-traps/src/techsupport.ts:detectTechSupport, apps/extension/src/content/traps.ts:watchForTraps, e2e/scn-008.spec.ts

### SCN-011: Credential-entry guard on a new domain
- **Persona:** P-02
- **Feature:** web-guard
- **Traces:** ST-010, FLW-09 (JTBD-02, JRN-03/#4)
- **Entry point:** focus on a password or payment field on a domain that is neither trusted nor established
- **Preconditions:** the domain is not on the trusted list
- **Steps:**
  1. User focuses the password field -> system shows an inline warning beside the field, without covering it
  2. User clicks "Why" -> system states the domain's age, when it was first seen, and any brand similarity
  3. User clicks "Leave" -> system returns to the previous page
- **Expected result:** the user pauses before typing credentials into an unfamiliar domain
- **Alt paths:** user clicks "I trust this site" -> the domain is trusted and the warning is suppressed there on; user ignores it and types -> the warning stays visible but never blocks input
- **UI elements:** inline banner (credential variant), "Why", domain facts, "Leave", "I trust this site"
- **States covered:** success
- **Errors & recovery:** domain age data unavailable -> the warning states which facts are missing rather than implying the domain is new. Registration age is never looked up at all: asking a server would send the address of every login page the user visits
- **Status:** implemented
- **Coverage:** packages/core-credential/src/guard.ts:guardCredentialEntry, apps/extension/src/content/credential.ts:watchCredentialFields, e2e/scn-011.spec.ts

### SCN-012: Download stopped by feed or hash
- **Persona:** P-01
- **Feature:** web-guard
- **Traces:** ST-009, FLW-08 (JTBD-02)
- **Entry point:** a download starts from a page or a direct link
- **Preconditions:** feeds fresh; the file's source or hash matches a known-bad entry
- **Steps:**
  1. User starts the download -> system checks the final URL against the feeds before the file is saved
  2. User sees the blocking warning -> system names what matched and when that entry was published
  3. User clicks "Discard file" -> system cancels the download and journals it
- **Expected result:** the dangerous file never reaches the disk
- **Alt paths:** user clicks "Keep anyway" -> the download proceeds and the exception is journalled
- **UI elements:** blocking banner (download variant), matched-source line, "Discard file" (primary), "Keep anyway"
- **States covered:** success, error
- **Errors & recovery:** feeds unavailable or stale -> system says the checks were limited; the verdict never claims more than the checks that actually ran
- **Status:** implemented
- **Coverage:** packages/core-download/src/judge.ts:judgeDownload, apps/extension/src/background/downloads.ts:handleDownload, apps/extension/src/content/download.ts:showDownloadVerdict (unit only — driving a real download through an extension in Playwright is not stable enough to gate on; until 2026-08-05 the banner did not exist at all and the verdict was journalled in silence)

### SCN-013: Download partially checked — hash unavailable
- **Persona:** P-01
- **Feature:** web-guard
- **Traces:** ST-009, FLW-08 (JTBD-02, JTBD-05)
- **Entry point:** a download behind authentication, or one whose bytes cannot be re-fetched
- **Preconditions:** URL checks pass; the hash cannot be computed
- **Steps:**
  1. User starts the download -> system runs URL and file-type checks and cannot obtain a hash
  2. User sees an informational banner -> system states exactly which checks ran, which did not, and why
  3. User keeps the file -> system journals the partial verdict
- **Expected result:** the user is never given a clean verdict that the product did not actually earn
- **Alt paths:** file type is executable with a mismatched MIME or a double extension -> the banner escalates to a warning naming that specific reason
- **UI elements:** informational banner (download variant), "checks that ran" list, "checks that did not run" list with reasons
- **States covered:** success, error
- **Errors & recovery:** all checks fail -> the verdict says the file was not checked at all
- **Status:** implemented
- **Coverage:** packages/core-download/src/judge.ts:judgeDownload, apps/extension/src/background/downloads.test.ts (unit only, as SCN-012)

## credentials

### SCN-014: Submitted password is compromised
- **Persona:** P-01
- **Feature:** credentials
- **Traces:** ST-011, FLW-10 (JTBD-04, JTBD-05, JRN-02/#1)
- **Entry point:** a password field is submitted on any site
- **Preconditions:** local corpus loaded
- **Steps:**
  1. User submits a login form -> system hashes the password inside the page context and checks the local corpus first
  2. User sees the banner -> system states the password appears in known leaks and how the check was performed
  3. User clicks "Change password" -> system opens the site's change-password endpoint
- **Expected result:** the user learns the password is compromised, and no password or full hash ever left the device
- **Alt paths:** not found locally -> system performs a padded k-anonymity query with a 5-character prefix and shows the result; user clicks "Where else do I use it" -> system opens the local reuse list
- **UI elements:** banner (password variant), "how this was checked" line, "Change password" (primary), "Where else do I use it", "This is wrong"
- **States covered:** success, error
- **Errors & recovery:** network unavailable during the k-anonymity step -> system reports the local-only result and says the online check did not run; the journal records the prefix sent, or that nothing was sent
- **Status:** implemented
- **Coverage:** apps/extension/src/background/password.ts:checkSubmittedPassword, packages/core-credential/src/guard.ts:guardCredentialEntry, packages/net/src/request.ts:sendRequest (unit only — a real password submission in Playwright would have to carry a real credential, so the k-anonymity path is exercised against a stubbed range endpoint instead)

### SCN-015: Leak inventory with one source unavailable
- **Persona:** P-01
- **Feature:** credentials
- **Traces:** ST-012, FLW-11 (JTBD-04, JRN-02/#2-3)
- **Entry point:** the leaks screen, with at least one monitored email or phone
- **Preconditions:** at least one source configured
- **Steps:**
  1. User opens the leaks screen -> system queries each source and shows partial results as they arrive
  2. User sees results split into fresh infostealer hits and historical breaches -> system shows data classes, dates, and the source for each entry
  3. User reads the coverage line -> system names every source checked, every source that failed, and when each was last updated
- **Expected result:** the user knows what is exposed and, equally, what was not checked
- **Alt paths:** no sources configured -> the empty state prompts to add an email or phone and states exactly what will and will not be sent
- **UI elements:** monitored sources list, results grouped fresh/historical, per-entry data classes, coverage line, per-source retry
- **States covered:** loading, empty, error, success
- **Errors & recovery:** a source is unreachable or rate-limited -> that row states unavailable with a retry; results from other sources stand and the summary never implies full coverage
- **Status:** implemented
- **Coverage:** packages/core-leaks/src/merge.ts:mergeLeaks, packages/core-leaks/src/group.ts:groupLeaks, packages/ui/src/leaks/leaks.ts:renderLeaks, e2e/scn-015.spec.ts

### SCN-016: Repair a leak and mark it resolved
- **Persona:** P-01
- **Feature:** credentials
- **Traces:** ST-015, ST-012, FLW-11 (JTBD-04, JRN-02/#4-6)
- **Entry point:** a leak entry in the queue or the leaks screen
- **Preconditions:** at least one unresolved leak
- **Steps:**
  1. User opens the entry -> system shows what leaked, when, from where, and at most three next steps
  2. User clicks "Change password" -> system opens the site's change-password endpoint in a new tab
  3. User returns and clicks "Mark resolved" -> system archives the entry and removes it from the active queue
- **Expected result:** the leak leaves the active list only when the user says the repair is done
- **Alt paths:** user clicks "Check reuse" -> system lists other sites where the same password hash was seen locally; user clicks "Not now" -> the entry stays and is not re-raised as new
- **UI elements:** leak entry, data classes, next-step buttons, "Mark resolved", "Not now", archive
- **States covered:** success, error
- **Errors & recovery:** the site publishes no change-password endpoint -> system opens the site's login page and says the shortcut is unavailable for this site
- **Status:** implemented
- **Coverage:** packages/core-leaks/src/merge.ts:mergeLeaks, packages/core-recovery/src/checklist.ts:buildChecklist, packages/ui/src/leaks/leaks.ts:renderLeaks (unit only — the repair step leaves the browser, so the e2e can watch the item clear but not the repair itself)

## extensions

### SCN-017: Extension gained permissions — disable it
- **Persona:** P-01
- **Feature:** extensions
- **Traces:** ST-013, ST-014, FLW-12 (JTBD-03)
- **Entry point:** an installed extension updates and its permissions differ from the last snapshot
- **Preconditions:** a baseline snapshot exists
- **Steps:**
  1. System detects the delta -> the extensions screen surfaces it at the top and the toolbar badge increments
  2. User opens the delta -> system lists permissions added and removed, the version dates, and the publisher
  3. User clicks "Disable" -> system disables the extension and journals the action
- **Expected result:** a permission escalation is seen and handled the day it happens
- **Alt paths:** user clicks "Trust this change" -> the delta is acknowledged and the baseline updated, and it is not raised again
- **UI elements:** deltas section, permission diff list, version dates, publisher, "Disable" (primary), "Trust this change", "Inspect package"
- **States covered:** loading, success, error
- **Errors & recovery:** the extension cannot be disabled (policy-installed) -> system says why and offers the manual steps
- **Status:** implemented
- **Coverage:** packages/core-extensions/src/diff.ts:diffInventory, packages/ui/src/extensions/extensions.ts:renderExtensions, e2e/scn-017.spec.ts

### SCN-018: Extension changed publisher, package unavailable
- **Persona:** P-01
- **Feature:** extensions
- **Traces:** ST-013, FLW-12 (JTBD-03)
- **Entry point:** store metadata shows a different publisher than the last snapshot
- **Preconditions:** the extension package cannot be fetched for static analysis
- **Steps:**
  1. System detects the publisher change -> the extensions screen raises it as a high-severity delta
  2. User opens it -> system shows the old and new publisher, the change date, and states that package analysis is unavailable and why
  3. User clicks "Disable" -> system disables the extension and journals it
- **Expected result:** the ownership change is actionable even when deeper analysis is impossible
- **Alt paths:** package becomes available later -> system adds the static findings to the same entry without re-alerting
- **UI elements:** delta entry, publisher before/after, "analysis unavailable" reason, "Disable", "Trust this change"
- **States covered:** error, success
- **Errors & recovery:** store metadata itself is unreachable -> system states that the publisher could not be verified and keeps the previous baseline rather than assuming a change
- **Status:** implemented
- **Coverage:** packages/core-extensions/src/analyse.ts:analysePackage, packages/ui/src/extensions/extensions.ts:renderExtensions, e2e/scn-017.spec.ts

## privacy

### SCN-019: Verify what left the device
- **Persona:** P-01
- **Feature:** privacy
- **Traces:** ST-017, FLW-13 (JTBD-05, JRN-01/#7)
- **Entry point:** "What did you send?" from the popup, settings, or any finding
- **Preconditions:** none
- **Steps:**
  1. User opens the self-audit panel -> system shows a one-line weekly summary and the outbound log, newest first
  2. User opens a row -> system shows destination, purpose, the exact payload sent, and what was redacted
  3. User clicks "Export log" -> system produces a JSON file the user can compare against a browser network trace
- **Expected result:** the user can state what left the device this week, from the product's own records, and verify it independently
- **Alt paths:** nothing was sent -> the empty state says so explicitly rather than showing an empty table
- **UI elements:** weekly summary line, log rows (time, destination, purpose, payload shape), filters, row detail, "Export log"
- **States covered:** loading, empty, error, success
- **Errors & recovery:** the journal is unreadable -> system states the storage problem and offers repair; it never renders an empty log on error, because an empty log is a claim
- **Status:** implemented
- **Coverage:** packages/ui/src/self-audit/panel.ts:renderSelfAudit, apps/extension/src/options/index.ts, e2e/scn-019.spec.ts

### SCN-023: Wipe all local data
- **Persona:** P-01
- **Feature:** privacy
- **Traces:** ST-019, FLW-14 (JTBD-05)
- **Entry point:** settings screen
- **Preconditions:** local data exists
- **Steps:**
  1. User clicks "Wipe all data" -> system asks for confirmation and lists exactly what will be deleted
  2. User confirms -> system deletes all local data
  3. User sees the result -> system returns the extension to its first-run state
- **Expected result:** nothing of the user's remains locally, in one confirmed step
- **Alt paths:** user cancels -> nothing changes
- **UI elements:** "Wipe all data" (destructive), confirmation listing data categories, cancel
- **States covered:** success, error
- **Errors & recovery:** deletion partially fails -> system names what could not be deleted and offers retry; it never reports success on a partial wipe
- **Status:** implemented
- **Coverage:** packages/ui/src/settings/data-controls.ts:renderDataControls, apps/extension/src/options/index.ts — PARTIAL: covered by unit tests including the partial-failure path; no end-to-end run yet, since asserting a real wipe needs a profile seeded with data first

### SCN-024: Export all local data
- **Persona:** P-01
- **Feature:** privacy
- **Traces:** ST-019, FLW-14 (JTBD-05)
- **Entry point:** settings screen
- **Preconditions:** local data exists
- **Steps:**
  1. User clicks "Export all data" -> system produces a JSON file containing findings, journal, settings, and the outbound log
  2. User saves the file -> system confirms and states what the file contains
- **Expected result:** the user holds a complete, readable copy of everything the product stored
- **Alt paths:** none
- **UI elements:** "Export all data" (primary), completion confirmation with contents list
- **States covered:** success, error
- **Errors & recovery:** export fails -> inline failure with retry; no partial file is left behind
- **Status:** implemented
- **Coverage:** packages/ui/src/settings/data-controls.ts:renderDataControls, apps/extension/src/options/index.ts — PARTIAL: unit-tested; the download itself is not yet asserted end-to-end

## daily-use

### SCN-020: Popup — verdict for the current page
- **Persona:** P-01
- **Feature:** daily-use
- **Traces:** ST-015, FLW-17 (JTBD-02)
- **Entry point:** toolbar icon clicked
- **Preconditions:** a page is open
- **Steps:**
  1. User clicks the toolbar icon -> system shows the current page's verdict with the reason behind it
  2. User reads the "what changed" count -> system shows up to three queued actions beneath it
  3. User closes the popup -> system records the check time
- **Expected result:** in about three seconds the user knows whether this page is fine and whether anything needs them
- **Alt paths:** verdict still computing -> the popup shows "checking this page" rather than a blank or a premature clean verdict
- **UI elements:** verdict line with reason, "what changed" count, up to 3 actions, footer links (Self-audit, Journal, Settings)
- **States covered:** loading, empty, error, success
- **Errors & recovery:** local storage unreadable -> the popup states the failure and offers repair; it never shows a clean verdict it could not compute; the active page cannot be identified -> the verdict is `unknown`, never `clean`
- **Status:** implemented
- **Coverage:** apps/extension/src/popup/state.ts:toQueueItems, packages/ui/src/popup/popup.ts:renderPopup, e2e/scn-020.spec.ts

### SCN-021: What changed since last time
- **Persona:** P-01
- **Feature:** daily-use
- **Traces:** ST-015, FLW-17 (JTBD-04, JRN-02/#6)
- **Entry point:** "what changed" from the popup
- **Preconditions:** at least one previous check
- **Steps:**
  1. User opens the diff view -> system shows only what is new since the last check, grouped by type
  2. User opens an entry -> system shows the verdict, the action taken, and whether it was automatic
  3. User returns -> system marks this moment as the new baseline
- **Expected result:** the user sees a short list of changes, never a growing wall of old alerts
- **Alt paths:** nothing changed -> the empty state says so with the time of the last check; user switches to full history -> system shows everything within the retention period
- **UI elements:** diff list grouped by type, entry detail, full-history toggle, retention statement
- **States covered:** empty, success
- **Errors & recovery:** journal partially unreadable -> system shows what it can and states that the view is incomplete
- **Status:** implemented
- **Coverage:** packages/core-queue/src/diff.ts:diffSince, packages/ui/src/journal/journal.ts:renderJournal, e2e/scn-020.spec.ts

### SCN-022: Queue never exceeds three actions
- **Persona:** P-01
- **Feature:** daily-use
- **Traces:** ST-015, FLW-01 (JTBD-04, JTBD-06)
- **Entry point:** findings queue with many outstanding items
- **Preconditions:** more than three unresolved findings
- **Steps:**
  1. User opens the queue -> system shows exactly three items, ranked by severity, freshness, and how easily they can be fixed
  2. User resolves the top item -> system removes it and promotes the next one
  3. User clicks "Show all" -> system reveals the remaining items in a collapsed list
- **Expected result:** the user always faces a finishable list, and the product never presents 203 alerts as progress
- **Alt paths:** fewer than three items -> only those are shown, with no filler
- **UI elements:** three prioritised items, per-item action, "Show all", resolved state
- **States covered:** empty, success
- **Errors & recovery:** the ranking data is incomplete -> items are ordered by severity alone and the UI states the reduced ranking
- **Status:** implemented
- **Coverage:** packages/core-queue/src/rank.ts:buildQueue, packages/ui/src/popup/popup.ts:renderPopup, e2e/scn-020.spec.ts

## recovery

### SCN-025: Recovery after running a pasted command
- **Persona:** P-02
- **Feature:** recovery
- **Traces:** ST-015, FLW-16 (JTBD-06, JRN-03/#5)
- **Entry point:** "I already ran it" from a ClickFix warning, or the recovery entry in the popup
- **Preconditions:** none
- **Steps:**
  1. User states what happened -> system builds the checklist for pasted commands, most damaging step first
  2. User works through the steps -> system tracks progress per step and keeps it across restarts
  3. User finishes -> system archives the incident with its date
- **Expected result:** the user completes a concrete recovery sequence instead of searching for advice of unknown quality
- **Alt paths:** a step must be done on another device -> system shows what to do there and preserves progress; user is unsure what happened -> system offers the "not sure" path with the broadest safe checklist
- **UI elements:** incident type picker, ordered steps with reasons, per-step done control, "continue on another device", archive
- **States covered:** loading, empty, success
- **Errors & recovery:** playbook data missing -> system shows the broadest safe checklist and says that is what it is showing
- **Status:** implemented
- **Coverage:** packages/core-recovery/src/checklist.ts:buildChecklist, packages/ui/src/recovery/recovery.ts:renderRecovery, e2e/scn-025.spec.ts

## site-owner

### SCN-026: Site owner checks and appeals a verdict
- **Persona:** P-03
- **Feature:** site-owner
- **Traces:** ST-016, FLW-15 (JTBD-08)
- **Entry point:** the public status page, reached from an interstitial link or shared by a customer
- **Preconditions:** none — no account, no extension installed
- **Steps:**
  1. Owner enters their domain -> system returns the current verdict, the feed that produced it, and the entry date
  2. Owner reads the source -> system links to the upstream feed's own appeal process when the verdict is not ours
  3. Owner submits an appeal -> system records it and shows a reference id
- **Expected result:** an affected owner learns why their site is flagged and has a route to dispute it within two minutes, without an account
- **Alt paths:** the domain is not flagged -> system states that nothing is recorded for it
- **UI elements:** domain field, "Check domain" (primary), verdict card with source and date, upstream appeal link, appeal form, reference id
- **States covered:** loading, empty, error, success
- **Errors & recovery:** the status service is unavailable -> system says so plainly; it never implies the domain is clean when it could not check
- **Status:** implemented
- **Coverage:** apps/proxy/src/router.ts:handle, apps/status-page/src/render.ts:renderStatus (unit only — the page is not deployed, see human step 1)
