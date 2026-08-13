<!-- Managed with super-ux (ux-contract v4). Improve pass on the options page. -->

# UX Plan — options page → dashboard — 2026-08-12

- **Sources:** `ux-flows` Improve pass 2026-08-12 (findings F1–F8 below); FLW-17;
  SCR-07..SCR-13. No prior audit report — this Improve pass is the first
  evidence-backed read of this surface, and its findings are recorded here
  rather than in `audits/` because they were produced by design review, not by
  an audit run.
- **Goal:** a returning user opens the extension's own page and, without
  scrolling or guessing, sees what needs them across every area, reaches the
  one they want in a single click, and acts there without losing their place or
  their keyboard focus.
- **Shape:** list-and-drill-down (chosen 2026-08-12 over rail-and-overview-band;
  see [Two shapes](#two-shapes-and-why-this-one) — the losing option and the two
  mitigations that the winning one required).

## Findings this plan answers

Severity on the NN/g scale: 4 catastrophic, 3 major, 2 minor, 1 cosmetic.

| ID | Principle | Node | What breaks | Sev |
|---|---|---|---|---|
| F1 | PRN-01, PRN-06 | popup → journal | `apps/extension/src/popup/index.ts:90,92` open `options.html#journal` from two call sites; `SECTION_FOR_HASH` (`apps/extension/src/options/index.ts:540-542`) holds only `#queue`. The user who clicks "what changed" lands at the top of the page, on the self-audit panel, four sections above the journal. The comment at `:529-539` explains this exact defect — for the one hash that *is* mapped. Nothing tests `#journal` | 3 |
| F2 | PRN-03, BP-136..138 | all 14 `reload()` sites | `apps/extension/src/options/keep-focus.ts:28` restores focus to **one** node, the address field, and says so by design. The recovery checkbox (`options/index.ts:415`), queue "Готово"/"Не сейчас" (`:193`, `:199`) destroy their own button, so a keyboard user is returned to the top of the document after every action | 3 |
| F3 | PRN-01, PRN-08 | `reload()` | One action = two full repaints (`paint({loading})` then `paint(await load())`), each awaiting five section reads plus `load()`'s own. Ten `openDb()` sites, 14 `reload()` sites. Ticking one recovery step re-reads journal, queue, extensions and trusted list | 3 |
| F4 | PRN-11, PRN-13 | `renderPanel` `:484-510` | Eight panels built unconditionally, always all of them. Nothing deferred, nothing collapsed; the first run's primary action ("see what to do") opens a settings page | 3 |
| F5 | PRN-06 | the page as a whole | "What needs attention now" exists nowhere. The queue caps at three, the journal shows a diff, the extensions panel shows changes — and nothing ranks across them. The user assembles the answer by scrolling | 3 |
| F6 | PRN-01 | every action | No feedback: `onResolve` sends and awaits `reload()`; the row stands untouched meanwhile. The tree is swapped only at the end, so the screen holds stale content with no sign that a repaint is in flight | 3 |
| F7 | PRN-04 | hashes | `#recovery=<kind>` is parsed inside the section (`:400`) and decides whether it exists; `#queue` is handled by `revealSection()` (`:544`) and only scrolls. One URL surface, two unrelated mechanisms, and an unknown value is ignored in silence | 2 |
| F8 | — | `docs/ux/foundation.md:326`, `options/index.ts:41` | Both state things that are no longer true: "Figma is switched on before any interface code is written" (fourteen screens are written) and "this page's own strings are still literals" (`pnpm i18n:sweep` reads 0) | 1 |

**F1 and F5 are drift, not taste.** FLW-17 already draws the journal, the queue
and the self-audit as **separate screens with transitions between them**
(`flows.md:485-497`); the code assembles them into one stack. The dashboard is
not a new idea — it is the flow's own shape, finally built.

## What the reference sweep changed

Read in Refero (215 hits for security dashboards, three read in full) and looked
at in Mobbin (Discord, Coinbase, Revolut Business). Each entry names what it
changed, and the two rejected ones name why.

| Reference | Read | Effect on this plan |
|---|---|---|
| Coinbase → Security (Mobbin) | The prioritised item is a card at the **top of the section**, carrying its own action ("Upgrade 2FA"), not a separate dashboard page | The attention band is part of the overview view, and each row carries its own way in — it does not become a ninth destination |
| Revolut Business → Security (Mobbin) | Section is a **list of destinations**; drilling in replaces the view and a back arrow returns. Empty state states emptiness | Confirms the chosen shape's skeleton. Its empty state is a **counter-example**: "Your trusted merchants will appear here" states emptiness without selling the next action |
| Refero 12323 — Lovable, Security Issue Review | The finding **expands in place** ("Issue Details Expanded") rather than navigating to a detail page; the consequential action takes a dialog with a required reason | The queue view expands a finding in place; no detail route is added |
| Refero 6692 — Linear, API key revocation | Item action → confirm modal → item removed with a notice | Matches what the product already does for wipe; nothing to change |
| Discord → My Account → Standing (Mobbin) | **Rejected.** A five-step account scale, "All good → Suspended" | This is the protection score banned by this product's own cross-screen rules in `screens.md`. Not adopted |
| Coinbase recommendation carousel (Mobbin) | **Rejected.** A dot-pager rotating two recommendation cards | A rotating card hides the second item. The attention band lists its items and counts the remainder |

## Two shapes, and why this one

- **A — rail and overview band.** Left rail of eight destinations in three
  groups; the attention band pinned above the content, visible while acting.
- **B — list and drill-down (chosen).** The page opens on the overview as its
  own view: the attention band plus eight areas with a one-line state each.
  Choosing an area replaces the view; back returns.

A was recommended, because FLW-17 is a *daily check-in* and the band stays in
sight while the user acts. B was chosen. Its two costs were named at the time
and both are answered in this plan rather than left standing:

1. **An extra hop before a deep-linked area.** Answered: the hash addresses the
   **view directly**, so `options.html#journal` opens the journal with no
   intermediate stop. The hop exists only for an entry that carries no hash —
   the plain "open the page" case, where an overview is what was wanted anyway.
2. **The overview is invisible from inside an area.** Answered: the back
   affordance carries the count — `"← Обзор · 3 требуют внимания"` — so the
   number stays in sight and the overview is one click away, without
   introducing a rail.

## Target interface

### Screen: SCR-15 Дашборд — обзор (FLW-17, new)

- **Purpose:** answer "what needs me, and where do I go" before any area is
  opened — the question the eight-panel stack made the user assemble by
  scrolling (F5).
- **Elements:**
  - **Attention band** `"Требует внимания (N)"` — at most **three** rows, the
    rest counted as `"…ещё N"`. One ranking rule for the whole product: the
    existing ranker in `packages/core-queue/src/rank.ts` orders these rows, with
    each area's outstanding item mapped into the shape it already ranks. A
    second ranking rule would be a second definition of "worst".
    Each row: severity as **icon plus text** (never colour alone), what it is,
    where it came from, when, and a link into its area.
  - **Area list** — eight rows, each a real link (`<a href="#queue">` …), each
    with a one-line state: `"2 из 6"`, `"с 10 авг"`, `"проверено 8 авг"`,
    `"1 изменение"`, `"пусто"`, `"нет инцидентов"`, `"5 отправок"`,
    `"хранятся 90 дней"`. **Primary action: the first row of the attention
    band.** With an empty band, the primary action is `"Что делать дальше"`.
- **States:**
  - loading → the shell and all eight rows paint at once, each state read shown
    as `"…"`; the band shows `"считаем"`. The shell never waits on data.
  - empty → band reads `"Сейчас ничего не требует внимания"` **plus when this
    was last checked**; the area list still carries its states.
  - error → the store is unreadable: the failure is named, repair is offered,
    and **no area row claims a state**.
  - success → band with up to three rows, then the eight areas.
- **Behavior notes:**
  - **A row whose count could not be read says so** — `"состояние не
    прочитано"` — and never `"пусто"`. This is the product's own rule (absence
    of data must never read as a pass) carried onto the new surface, and it is
    the single easiest thing to get wrong here: eight cheap reads, any one of
    which can fail, all rendering into a word that reassures.
  - Areas are addressed by hash and rendered one at a time. **An unknown hash
    opens the overview and says which address was not understood** — a silent
    fallback is how `#journal` died quietly (F1).
  - Navigation is real links plus `hashchange`, so browser back and forward work
    without a router (PRN-03).
  - The overview reads **counts only**, never a section's full data (F3).
- **Wireframe:** generated by `tools/wireframes.mjs` after implementation —
  wireframes in this project are derived from the renderers and gated by
  `tools/wireframes.test.ts`, not drawn ahead of them.

### Hash → view map (replaces both mechanisms in F7)

| Hash | View | Screen |
|---|---|---|
| none / `#` | Обзор | SCR-15 |
| `#queue` | Что делать дальше | SCR-07 |
| `#journal` | Что изменилось | SCR-11 |
| `#leaks` | Утечки | SCR-08 |
| `#extensions` | Расширения | SCR-09 |
| `#trusted` | Доверенные домены | SCR-16 |
| `#recovery=<kind>` | Восстановление | SCR-13 |
| `#audit` | Самоаудит | SCR-10 |
| `#data` | Ваши данные | SCR-12 |
| anything else | Обзор + `"адрес не распознан: <hash>"` | SCR-15 |

### Screen: SCR-16 Доверенные домены (FLW-05, FLW-14 — split from SCR-12)

- **Purpose:** review and take back the "this is legitimate" decisions made on
  other screens.
- **Why split:** the chosen shape is one area, one view, and the overview lists
  `"Доверенные домены"` and `"Ваши данные"` as separate rows. Two rows landing
  on one view breaks the shape. SCR-12 also bundles four elements that are not
  built (`brand watchlist`, `quiet mode`, `proxy toggle`, `retention period`);
  the trusted list is built, has its own renderer and its own e2e, and reads as
  a different job from export-and-wipe.
- **Elements:** the trusted list, each entry with when and why it was trusted;
  per-entry `"Убрать из доверенных"`. **Primary action: none — this screen is a
  review surface**, and its only action is destructive-by-reversal.
- **States:** empty → says nothing is trusted **and why the list would fill**;
  success → entries with when and why; error → names the read failure.
- **Coverage:** `packages/ui/src/trusted/trusted.ts:renderTrusted`,
  `e2e/scn-024.spec.ts` — already built; only its address changes.

### Screens: SCR-07..SCR-13 — modified, not redesigned

Each becomes a view inside SCR-15 rather than a band in one stack. Their
elements, states and copy are unchanged. What changes for each:

- **Repaint is scoped to the open view**, not the document (F3, F6).
- **Focus and selection are restored for the active element inside the
  repainted region**, replacing the single named node in `keep-focus.ts` (F2).
  The address-field invariant of SCR-08 still holds — the live node is moved,
  not rebuilt — and now only the leaks view repaints around it.
- **An action shows a pending state on the acted-on row within the same frame**,
  before the write returns; a failure returns the row with the failure named
  (F6). Pending, not optimistic success: this product does not claim a result it
  does not have.
- **Serialised repaints are kept** — a burst still collapses to the last state
  (`paint`'s queue, `options/index.ts:465-479`).
- The back affordance reads `"← Обзор · N требуют внимания"`, or `"← Обзор"`
  when N is 0 (mitigation 2 above).

## Changes

| # | Action | Object | Details | Traces | Priority |
|---|---|---|---|---|---|
| 1 | CREATE | `packages/ui/src/dashboard/shell.ts` | the shell: attention band + area list + back affordance; renders from counts, never from section data | SCR-15, F4, F5, PRN-11 | P1 |
| 2 | CREATE | `packages/ui/src/dashboard/attention.ts` | maps each area's outstanding item into the shape `packages/core-queue/src/rank.ts` already ranks; caps at three and counts the rest | SCR-15, F5, PRN-13 | P1 |
| 3 | CREATE | view router in `apps/extension/src/options/index.ts` | hash → view per the map above; unknown hash opens the overview **and names the hash** | SCR-15, F1, F7, PRN-04 | P1 |
| 4 | MODIFY | `apps/extension/src/options/keep-focus.ts` | restore focus and selection for the active element inside the repainted region, not for one named field | F2, PRN-03, BP-136 | P1 |
| 5 | MODIFY | `apps/extension/src/options/index.ts` (`paint`/`renderPanel`) | repaint the open view only; keep the serialised queue and the moved address node | F3, F6, PRN-01 | P1 |
| 6 | MODIFY | queue, journal, extensions, trusted, recovery renderers | pending state on the acted-on row until the write returns; failure named on the row | F6, PRN-01, PRN-09, SCN-002, SCN-021, SCN-022 | P1 |
| 7 | DELETE | `SECTION_FOR_HASH` + `revealSection()` (`options/index.ts:529-554`) | superseded by change 3: scrolling to a section stops being a concept when one view renders at a time | F1, F7 | P1 |
| 8 | CREATE | gate: every hash the product produces resolves to a view | greps the extension for `options.html#…` producers and asserts each is in the map — F1 was two producers and one consumer, and no test could see it | F1, F7 | P1 |
| 9 | CREATE | gate: no area row renders a reassuring word from a failed read | plants a rejected count read and asserts the row says the state was not read, never `"пусто"` | SCR-15 behaviour note | P1 |
| 10 | MODIFY | `docs/ux/screens.md` | add SCR-15, SCR-16; split the trusted list out of SCR-12; answer `Web surfaces` | SCR-15, SCR-16 | P1 |
| 11 | MODIFY | `docs/ux/flows.md` → FLW-17 | overview node, direct deep-link edges, back edges | F1, F5 | P1 |
| 12 | MODIFY | `docs/ux/foundation.md:321-327` | Design tooling records what happened: fourteen screens were built text-first with generated wireframes, Figma never switched on | F8 | P2 |
| 13 | MODIFY | `apps/extension/src/options/index.ts:41` | drop the comment claiming the page's strings are literals; the sweep reads 0 | F8 | P2 |
| 14 | CREATE | `docs/ux/screens.md` → SCR-17 landing `/`, SCR-18 privacy `/privacy` | both shipped in B-15 with no screen record, which the project's own hard rule forbids; both need the five-field `Web surface:` block before the custom domain changes their `Route` | chain gap found 2026-08-12 | P1 |

## Execution order

P1 by Frequency × Severity × Solvability:

1. **3, 7, 8** — the hash router and its gate. Highest frequency (every entry
   into the page), major severity, and small: it deletes more than it adds.
   Change 8 goes in with 3, not after — F1 survived because producer and
   consumer were never checked against each other.
2. **1, 2** — the shell and the attention band. This is where F4 and F5 are
   answered, and everything below renders inside it.
3. **5, 4** — scoped repaint, then generalised focus restoration. In that order:
   focus restoration has nothing to scope to until the repaint is scoped.
4. **6, 9** — pending states and the gate that stops a failed read from reading
   as reassurance.
5. **10, 11, 14** — the chain, in the same change as the code that makes it
   true.

P2 (**12, 13**) are one-line truth fixes with no dependency; they can ride with
any of the above.

**Dependencies:** 4 depends on 5. 2 depends on 1. 6 depends on 5. Nothing
depends on 12–14.

## Definition of done

- Every change lands with its scenario updated in the same change; the scenario
  cascade for SCR-15 and SCR-16 is `ux-scenarios` work, run in this session.
- `python3 docs/ux/lint.py` and `python3 docs/ux/doctor.py` pass.
- `pnpm gates` green, `pnpm test:e2e` green, `pnpm wireframes` regenerated so
  `tools/wireframes.test.ts` passes against the new renderers.
- Nine axe checks still pass on the styled build, and the new shell joins the
  accessibility sweep in this same change — a new user-facing surface joining
  the sweep later is standing instruction 5 in `docs/superpowers/retro.md`.
- Every new gate is verified by a planted defect, and the plant is confirmed to
  turn **that rule** red rather than the build (standing instruction 1).
- Post-implementation `/ux-audit` verdict PASS on the traced scenarios.

## What you have now

- This UX plan (target interface + CREATE/MODIFY/DELETE change list).
- The design chain in `docs/ux/` (foundation, flows, screens, scenarios).
- No Figma frames: Figma is off by the 2026-08-04 decision, and this project's
  wireframes are generated from the renderers rather than drawn ahead of them.

## Recommended: continue autonomously with task-pipeline

`task-pipeline` is installed in this environment:

```
/task-pipeline docs/ux/plans/2026-08-12-options-dashboard.md
```

The same-change rule holds: each change updates its scenario, `screens.md` and
the generated wireframe as it lands. Re-run `/ux-audit` afterwards to confirm
PASS.
