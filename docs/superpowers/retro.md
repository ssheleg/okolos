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
   broken one. A green nobody has watched fail is not evidence. And **confirm the plant actually landed,
   on the rule you meant to test** — two wrong citation formats survived a plant
   that never applied, and three plants against the page watcher all turned a
   gate red by breaking the build instead of the rule.
2. **Check the artefact, not only the source.** ESLint reads the files it is
   pointed at, and flat config *replaces* rule options rather than merging them.
   Every runtime promise gets a second check against the built bundle. **A gate
   that reads the filesystem is checked with the filesystem in the state a
   person's tools leave it**, not the state a fresh clone has: three gates read
   the entries of a directory and used each as a path, so all three were one
   Finder visit from a wrong verdict — and the one guarding the pre-push hook was
   red on every developer machine and green on CI, where nobody had ever
   clicked. Plant the mess before believing the green.
3. **Absence of data must never read as a pass.** Assert that the measurement
   exists before comparing it to a ceiling; assert that the list was read before
   showing it as empty.
4. **Say what was not covered, in the same breath as what was.** Every audit
   carries a Scope and limits section, and the carry-over count is printed
   beside the verdict.
5. **A new user-facing surface joins the accessibility sweep in the same
   change.** Four had accumulated outside it, and the one carrying an
   unlabelled control was the newest.
6. **A test comment that defers an assertion to a later release names the
   release and the requirement**, so the ledger carries the obligation. A
   promise living only in a comment is tracked by nothing — the HIBP
   attribution waited three releases in one.
7. **A number produced by a tool is a claim about the tool** until it has been
   checked against the artefact. Report it as "the diagnostic says X", or
   verify it — never as "X". Reported as fact, a diagnostic's 225 dangling
   edges turned out to be zero.
8. **A test that agrees with the code proves they agree, and nothing else.**
   Four tests in one audit were holding wrong answers steady — two of them the
   same false privacy sentence, at two layers, and one misnamed so that even a
   reader who checked would look at the wrong case. Read what a test asserts
   against what the product *should* do.
9. **A rate limit, a retry budget or a quota must defer, never drop.** Work
   discarded when the budget is full is work nobody re-arms, and the last item
   of a burst is the one an attacker chooses.
10. **A detector that reads wording reads a language, and the language is a
   coverage claim.** Every text-matching detector in this codebase was written
   in English: nine injection signals, the ClickFix page pattern, the
   tech-support pattern. All of them shipped marked DONE, and for the audience
   this product's own watchlist, interstitial copy and documentation are
   written for, they found nothing at all. Name the languages a detector
   matches in its scenario's Known limit, and name the parts that have no
   language — an invisible-character class, a DOM difference, a fact about the
   connection — so nobody re-derives which is which.

**Прорежено 2026-08-09, до потолка в десять.** Каждое удаление — строкой:

- «Кросс-браузерные утверждения стоят на тестах, а не на сборках» — **стала
  проверкой**: Firefox-харнесс делает 11 проверок и гоняется в CI.
- «Читай вывод гейта перед пушем» — **стала проверкой**: `.githooks/pre-push`
  отказывается пушить и печатает вывод упавшего гейта.
- «Убедись, что плант приземлился» — **слита с первой**: это одна дисциплина, и
  вторая была написана потому, что первую делали небрежно.

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

- **2026-08-20 (второй)** — B-34, второй заход; стадии 0–10. Первый заход был закрыт
  преждевременно: реле работало при удачном порядке загрузки и молча теряло отчёт
  иначе. Нашёл CI. Обязательство отчитаться перенесено во фрейм, который жив; сдача
  записывается в журнал. 1665 юнит-тестов в 112 файлах, три полных прогона e2e по 96
  из 96, плант воспроизводит гонку. Постоянных инструкций десять, снятий нет.
  Вердикт REFINE.
- **2026-08-20** — `a1bb30c`, B-34; стадии 0–10. Находка в подфрейме впервые доходит
  до страницы, которая его встраивает; реле идёт через фон, потому что прямой прыжок
  через окно страницы подделывается. В абстракцию добавлены отправитель и адресация
  фрейма. 1653 юнит-теста в 111 файлах, семь плантов, `e2e/scn-031.spec.ts` — три
  проверки, локально не гонялся. SCN-031 заведён. Постоянных инструкций десять,
  снятий нет. Вердикт REFINE.
- **2026-08-19 (восьмой)** — `B-33`; стадии 0–10. У абстракции появился канал из
  фона в контент-скрипт, которого в ней не было, — и вердикт по загрузке впервые
  доходит до страницы. Гейт теперь решает канал по месту обработчика, а не по
  наличию отправителя. 1638 юнит-тестов в 110 файлах, шесть плантов. Три ошибки в
  работе этого часа нашли механизмы, ни одной — чтение. Постоянных инструкций
  десять, снятий нет. Вердикт REFINE.
- **2026-08-19 (седьмой)** — `9a58e66`, B-30; стадии 0–10. Подметалось три
  хранилища из девяти; `settings` не подметалось ни разу, из-за чего продукт
  накопил историю браузинга, от разрешения на которую отказался. Утверждение
  бренд-пака про девяносто дней заменено на проверяемое. 1611 юнит-тестов в 110
  файлах, пять плантов, один переделан. Постоянных инструкций десять, снятий нет.
  Вердикт REFINE.
- **2026-08-19 (шестой)** — `261dd7a`, B-62; стадии 0–10. Подтверждение стирания
  называет девять видов данных из девяти вместо пяти; полнота переехала в тип рядом
  с хранилищами, где она факт. 1605 юнит-тестов в 110 файлах, четыре планта.
  356 ключей в каждом каталоге. Постоянных инструкций десять, снятий нет.
  Вердикт REFINE.
- **2026-08-19 (пятый)** — `4326dcf`, B-29; стадии 0–10. Выгрузка данных
  перестала отдавать ключ, которым обратимо всё остальное в том же файле, и
  перестала выдавать `{}` за двадцать мегабайт весов. 1598 юнит-тестов в 109
  файлах, восемь плантов. Три дыры в работе этого же часа нашли планты и метагейт
  репозитория, ни одной — чтение кода. Заведён B-62 лестничным обходом.
  Постоянных инструкций десять, снятий нет. Вердикт REFINE.
- **2026-08-19 (четвёртый)** — `e363710`, B-28; стадии 0–10. Первая задача этой
  серии, меняющая поведение продукта, а не его учёт: на Chrome 116–136 и Firefox
  128 расширение не блокировало ни одной страницы и сообщало об этом как о
  неверной подписи издателя. Пороги подняты до примитива, отсутствие примитива
  названо своим именем, связь держит гейт. ADR-0011. 1588 юнит-тестов в 108
  файлах, шесть плантов. Два дефекта в свежем коде нашли его же тесты до первого
  коммита. Один пуш на итерацию с этого раза — три предыдущих вердикта отменила
  конкуренция. Постоянных инструкций десять, снятий нет. Вердикт REFINE.
- **2026-08-19 (третий)** — `b675b40`, B-61; стадии 0–10. Архив магазина
  перестал нести файл, которого никто не писал, и появилась обратная проверка,
  которой у релизного гейта не было по построению. Релизных проверок 10 вместо 8,
  1580 юнит-тестов в 108 файлах. Два планта, оба по настоящему пути отказа —
  первый вариант планта (в `dist`) не доказывал ничего, потому что гейт
  пересобирает. Постоянных инструкций десять, снятий нет. Вердикт REFINE.
- **2026-08-19 (второй)** — `2464b0e`, B-27; стадии 0–10. Из пяти незакрытых
  гейтом чисел бренд-пака неверны оказались три, а не четыре: два обвинения
  выставил сам аудит, и оба — его ошибка измерения. Волатильные числа теперь
  называют команду, структурные пересчитаны, и все одиннадцать строк таблицы
  читаются гейтом вместо шести. 1579 юнит-тестов в 108 файлах. Четыре планта,
  два из которых пришлось сначала доказать приземлившимися. Постоянных
  инструкций десять, снятий нет; 1 и 7 получили по свежей ссылке. Вердикт REFINE.
- **2026-08-19** — `4d77846`, B-26; стадии 0–10. Доковый гейт считал записи
  каталога вместо каталогов, и класс оказался шире одного гейта: три экземпляра,
  два латентных. Закрыто одним определением — `tools/tree.mjs` плюс собственный
  тест. 1576 юнит-тестов в 108 файлах, 1 skipped; зелено и с `.DS_Store`,
  подсаженным в пять читаемых каталогов, и без них. **CI зелёный целиком —
  третий раз в истории репозитория**, все три джоба. Доска выросла на 35 рядов
  (B-27…B-60) из аудита восемнадцати модулей. Постоянных инструкций по-прежнему
  десять: ни одна не сработала на триггер снятия, новый урок дописан к второй, а
  не занял одиннадцатую. Вердикт REFINE.
- **2026-08-13 (второй)** — инфраструктура: настоящий фид, матрица к правде,
  B-20. 1568 юнит-тестов, 93 e2e в 24 файлах, 11 проверок Firefox. Фид в проде —
  v5, 248 живых фишинг-хостов вместо четырёх `.test`. ADR-0010. **CI полностью
  зелёный впервые в истории репозитория** — все три джоба. Пять рядов леджера
  верификации закрыты прогоном, две новых заведены, B-19 закрыта решением не
  делать. Вердикт REFINE.
- **2026-08-13** — `docs/ux/plans/2026-08-12-options-dashboard.md`; стадии 0–10.
  Дашборд: один адрес — одна область, обзор с полосой внимания, восстановление
  фокуса для любого элемента, состояния ожидания. 1535 юнит-тестов, 88 e2e,
  11 проверок Firefox, девять поверхностей в axe-свипе. Четыре новых гейта, три
  из них с подтверждённым плантом. **CI впервые в истории репозитория дошёл до
  ворот** — и нашёл три дефекта окружения. Пять рядов леджера верификации стоят
  `never`, пять строк заведено на доску. Вердикт REFINE.
- **Пропуск в штампах, 2026-08-05 … 2026-08-09.** Пять прогонов записаны ниже
  как Entries и не проштампованы здесь. Восстанавливать их задним числом
  нечестно — счётчики тех прогонов уже не измеришь, — но пропуск назван, чтобы
  следующий читатель не принял этот раздел за полный список.
- **2026-08-04** — P0–P5 brief; stages 0–10 (stage 8 blocked on a human step).
  Delivered the walking skeleton and its gates: 151 unit tests, 10 e2e specs,
  two loadable builds, 8 REQ DONE / 5 PARTIAL / 21 PLANNED, 3 new REQ rows from
  the acceptance walk. Verdict REFINE.

## Entries

### 2026-08-20 — I closed it, CI reopened it, and the spec I could not run is why

- **Symptom:** the previous run shipped a feature and an end-to-end spec it stated
  plainly it had not executed. CI executed it: two of three assertions failed. The
  banner never reached the embedding page.
- **Surfaced at:** the first thing the next iteration did, because the previous one had
  promised to read that verdict rather than assume it. Had it not been read, a closed
  row would have claimed a working relay for as long as nobody opened an iframe.
- **Owned by:** the shape of the fix, not the timing. The report went out once, inside
  the answer to the frame's own scan. An embedded document can reach `document_idle` and
  finish its whole cycle *before the embedding page's content script has started*, so
  the report lands on a frame zero with no listener and `sendMessage` rejects into
  silence. The receiver was not slow. It did not exist.
- **The measurement that decided the fix, rather than a guess about it:** 135 ms when it
  lands. With a 30-second ceiling the whole suite went green — which is precisely what
  made a bigger timeout the wrong answer, and B-18 had already written that sentence
  into this file: do not mask it with a retry. A retry that waits for something to be
  *created* is a different thing from one that waits for something to *stop failing*,
  and the distinction is the whole justification here.
- **Fix, by grade:** structural, and it moved the obligation rather than adding patience.
  The frame is alive and can wait, so the frame owns telling its parent: `frame/report`
  answers whether anyone heard, and the frame asks again, bounded, and **gives up out
  loud**. A silent give-up would have been the original defect by another road — found
  something, told nobody.
- **What made the diagnosis possible, and it was not reasoning:** the spec passed in
  isolation and failed in the full suite. Running it alone proved nothing and would have
  supported "flake". Running the whole suite reproduced it in one run out of one. The
  reproduction condition was the finding.
- **Evidence in both directions, because one is not enough for a race:** three
  consecutive full runs at 96 of 96, and a plant setting the budget back to one attempt
  fails the same assertion CI failed. A green run after a race fix is a coin landing
  heads; the plant is what says the coin is weighted.
- **A note on closing things.** The row was marked done in good faith with the untested
  half named in the commit. That naming is what made this cheap to find and is worth
  keeping. But a row closed with its verification outstanding is a row closed early, and
  the honest form is the one now in the board: closed on the second attempt, with the
  first attempt's failure written into it rather than tidied away.

### 2026-08-20 — the comment described the design, and the design was half built

- **Symptom:** a clean page embedding a poisoned advert produced no warning. The
  injection inside the frame was found, neutralised and gated; nobody was told.
- **Owned by:** a comment that outlived the plan it described. Three screens above
  the code it said "subframes still collect and report; the top frame is the one that
  speaks", and the code returned on `if (!isTopFrame)` immediately after neutralising.
  Nothing was wrong with either half on its own. A reader checking whether frames were
  handled would find the comment and stop.
- **Why no test caught it:** the frame's *handling* is what the tests assert —
  neutralised, gated, journalled — and all of it was true. The missing thing was a
  report to a surface, and the surface was in a different frame from anything the unit
  tests could see. This is the third seam in this series to hide in exactly that shape:
  each side correct, the connection absent.
- **Fix, by grade:** structural. The relay goes frame → background → top frame, and
  through the background for a security reason rather than a convenience: a subframe
  can reach the top with `window.top.postMessage`, and that message travels through
  the page's own window — where the page can forge it, and the top frame cannot tell
  an extension's report from a claim by the thing being reported.
- **What the abstraction was missing, and what its absence had been costing:** the
  adapter discarded the sender. That is *why* there was nowhere to send a frame's
  finding — the background answered whoever asked without being able to tell a frame
  from a page. A capability nobody could reach for is indistinguishable from a
  capability nobody wanted, and the comment is what made it look like the latter.
- **Three findings from the repository's own gates, none from me.** `sendToFrame`
  first took the message type third while `sendToActive` takes it first, so the "has a
  sender" rule could not see the new type at all: **an API whose argument order
  defeats the project's own gate is the wrong argument order** — the gate was a better
  reviewer of the signature than I was. The channel rule named one correct channel
  when there were two, which is a rule that gets edited to shut up rather than to be
  right. And `coverage-shape` demanded a test beside `verdict.ts` within a minute of
  `SEVERITY_ORDER` moving there — the move itself being the B-62 lesson applied
  without being asked: the background needed the same ranking, and copying four
  numbers is how two copies come to agree with each other and nothing else.
- **The plant that stayed green, and it was the real hole.** Removing the sender
  pass-through — the single line the entire relay rests on — broke no test. Five now
  cover it, including the one separating frame zero from no frame: had `frameId: 0`
  arrived as absent, every top-frame scan would have looked like a subframe and each
  page would have been sent a report about itself. **A new capability is exactly where
  a plant is most likely to stay green, because the tests written beside it test what
  it does and not that it is wired.**
- **Said plainly rather than implied:** the end-to-end spec was written and not run
  here — it needs a headed context. CI runs it, and its verdict is read at the top of
  the next iteration rather than assumed by this one.

### 2026-08-19 — a module with nine tests that could not run, and the gate that said it was fine

- **Symptom:** no download has ever produced a banner. The verdict was computed,
  journalled and sent; the listener existed; nothing arrived.
- **Owned by:** the difference between two APIs that look interchangeable.
  `runtime.sendMessage` from a background context reaches the extension's own pages
  and never a content script. The abstraction had no way to reach one at all — `Tabs`
  held `activeUrl` and `create` — so the only send available was the wrong one, and
  nothing in the type system or the tests could say so.
- **The gate that was green throughout, and why:** `tools/test-quality.test.ts`
  required every message type to have a sender. `download/verdict` had one. Having a
  sender and having a *reachable* sender are different facts, and the check knew only
  the first. This is the second run in two days to find a check aimed one level too
  low — the retention gate verified a constant and not the claim, this one verified a
  call site and not the delivery. Both were correct. Both were green. **A check that
  confirms the existence of a mechanism has not confirmed that the mechanism connects.**
- **Fix, by grade:** structural. `tabs.sendToActive` in the platform, addressed to
  the active tab because a `DownloadItem` carries no tab id; `false` rather than a
  throw when there is nowhere to deliver; a journal line when the banner could not be
  shown, because "not shown" and "not checked" are indistinguishable in a journal that
  holds only verdicts. And the rule now derives the channel from where the handler
  lives, so the class cannot recur for a different message type.
- **Three mistakes in the hour's own work, and the pattern in them is mine, not the
  code's.** The first discriminator counted any mention of a type in the content
  script as a handler — and the content script both sends and handles, so ten types at
  once demanded the wrong channel. That is the third over-matching extractor in three
  runs: `user:password-check` read as a credential, `**/*` read as files, and now a
  sender read as a handler. The shape is the same every time — a cheap pattern
  standing in for a structural fact — and the answer that has worked every time is to
  assert the discriminator itself, which is now done here.
- **The metagate refused my `if/else` where both arms assert.** It cannot see that
  both assert, and it is right to refuse the shape rather than special-case it;
  choosing the channel first and asserting once is clearer about the claim anyway. A
  rule that only fires on real violations is a rule that has to understand the code;
  one that fires on a shape is one you can keep.
- **A test that proved nothing, found by a plant.** The guard `if (!api.tabs.sendMessage)
  return false` is unobservable without an assertion about it: remove it and the call
  reaches `sendMessage(undefined)`, the inner `catch` turns the TypeError into `false`,
  and the same result comes back. The test now asserts that no tab is even looked up on
  an engine that could not be told — the guard's actual purpose.
- **Fifth citation of standing instruction 1's second half**, and the sharpest yet: a
  plant reported as landed by my own echo of the command rather than by reading the
  file. `grep -c` on the file said otherwise. The instruction says confirm the plant
  landed; the failure mode is trusting the thing that performed it.

### 2026-08-19 — a gate confirmed the sentence and the sentence was false

- **Symptom:** `facts.md` said the product keeps nothing longer than ninety days,
  and cited `RETENTION_DAYS = { journal: 90, outbound_log: 90 }`. Both constants
  were real and enforced. The claim was still false: the sweep walked three stores
  of nine, and `settings` was walked by nothing — so `seen:<host>` had become a
  permanent, second-precision list of every site where a password or card field was
  focused.
- **Surfaced at:** the audit, and it had been true since the store existed.
- **Owned by:** the gate's aim, not its correctness. It read one field out of the
  schema and required that number to appear in the pack. Both halves passed. The
  sentence, though, was about the whole database, and nothing compared it to the
  whole database — so the check confirmed the citation while the claim above it went
  unexamined. **A gate that verifies a claim's evidence has not verified the claim.**
- **Why it is worth its own entry:** the previous entries in this file are about
  checks that were absent, or blind, or written twice. This one was present, correct,
  and pointed one level too low. That is harder to notice, because the report is
  green for a true reason.
- **Fix, by grade:** structural, and in three places rather than one. The sweep now
  walks `settings` — a year for the host note, and it stores a date rather than an
  instant, which is the call the reuse index made one screen away while this row kept
  seconds. A deferral goes when its own deadline passes. And two settings are kept on
  purpose with the reason written down, because `reuse:key` cannot expire without
  orphaning every tag it made: the index would then answer "nowhere" about passwords
  it had already seen, which is worse than answering "unknown".
- **A record with no readable date was the one thing in the database with no expiry.**
  `olderThan` read `Number.isFinite(at) && …`. Measured before the fix: after a
  sweep the corrupt row was the survivor and the valid old one was gone.
  `dueForSweep`, two functions below in the same file, had already decided the
  opposite for the same reason — "an unreadable timestamp is not permission to skip"
  — so the file disagreed with itself, in the direction of keeping data.
- **What replaced the claim, and why replaced rather than repaired:** "every store
  has a window or a written reason why it does not". Four stores legitimately have no
  expiry. What they must not have is silence — a store with neither a window nor a
  stated reason is the one nobody notices — so the privacy page now carries a line
  per store, in the same nine words the wipe confirmation uses, and a gate requires
  the line rather than the window.
- **Fourth citation of standing instruction 1's second half.** A plant written with
  `perl` scoped by line number never applied, and the gate went green for a reason
  that had nothing to do with the hole. Four times in one session the question
  "did the plant land?" has been the one that mattered, which is the argument for the
  sentence staying in the list rather than being merged into the first half.

### 2026-08-19 — the list was written twice, so both copies agreed and neither was right

- **Symptom:** the wipe confirmation named five kinds of data. `wipeAll` clears
  nine stores. The four it never mentioned included the password-reuse index, which
  `docs/privacy.md` devotes a section to.
- **Surfaced at:** the ladder walk of the previous task, not by anyone reading the
  dialog. Two screens away from where the previous fix was.
- **Owned by:** the shape, not the count. The five keys were in the renderer and the
  same five were in the renderer's own test. A test that repeats its subject's data
  proves the two agree; it cannot notice that both are wrong. This is standing
  instruction 8 — a test that agrees with the code proves they agree and nothing
  else — arriving in a form the instruction does not name: not a wrong assertion,
  a duplicated input.
- **Root cause of the duplication:** the renderer needed the list and could not
  reach the schema, because `packages/ui` does not depend on `@okolos/storage`. The
  cheap answer was to retype it, and the cheap answer is what happened. Copying
  across a layer boundary is what a boundary makes tempting.
- **Fix, by grade:** structural, and specifically by moving the guarantee to whoever
  can hold it. `Record<StoreName, string>` beside `STORES` fails `tsc` when a store
  has no words — a type is a better guard than a test because it fires before anyone
  runs anything. The renderer takes the list as an argument, since it cannot know
  whether what it was handed is all of them, and throws on an empty one: a dialog
  naming no data above a button that deletes all of it reads as "nothing will be
  deleted".
- **Where the check went, and why not beside either side:** `tools/`. Giving `ui` a
  dependency on `storage` to satisfy a test would open the production import too.
  From `tools/` the gate compares three artefacts nobody edits together by accident —
  `STORES`, both shipped catalogues, and the single line at the call site. That last
  one matters: the type cannot see a subset passed as an array literal, which is the
  only remaining way to get this wrong, and a plant proved the gate sees it.
- **A note on the word that was already there.** SCN-023 step 1 said the system
  "lists exactly what will be deleted" before the list was complete. The scenario was
  not wrong about the intent and was wrong about the product, and for a while it read
  as coverage. It now carries the correction with the count, rather than being edited
  into agreement — a scenario file that quietly starts matching the code stops being
  a source of truth and becomes a mirror.

### 2026-08-19 — three holes in one hour's work, and not one of them found by reading it

- **Symptom:** the task was clear and the fix was small — stop exporting the HMAC
  key beside the tags it reverses. What the hour actually produced was three
  defects in the new work, each caught by a mechanism rather than by review.
- **Surfaced at:** stages 5 and 6, within minutes of each piece existing.
- **The three, in the order they were caught:**
  1. The gate's first extractor took any `namespace:name` string literal and
     reported `user:password-check` as a leaked credential. That is a
     `triggeredBy` label for the audit log. A gate that calls a log label a
     leaked password is a gate somebody mutes, and a muted gate is worse than an
     absent one because it still reads as coverage. Rewritten to read the sites
     that touch the settings store.
  2. An **additive** plant — `vt:apiToken` added while leaving everything else in
     place — passed green. The word list held `token`, and the pattern wanted a
     `-`, `_` or `.` in front of it; camelCase gives neither. `apiKey` had been
     matching only because `apikey` happened to be in the list as one word, so the
     rule appeared to work for the reason it did not. This is why the plant has to
     be additive: replacing a key fired the *reverse* check and looked like proof
     of the forward one.
  3. `tools/test-quality.test.ts` refused a new test for putting an assertion
     behind an `if`. A branch not taken asserts nothing and passes, and the loop I
     wrote would have been satisfied by a filter that stopped matching.
- **What that says about the method, and it is the point of the entry:** the
  defects were not in the hard part. The redaction was ten lines and correct on the
  first try. All three were in the *checking* — the extractor, the pattern, the
  test shape — which is where confidence comes from and therefore where a mistake
  is most expensive. Reading the code found none of them; a plant, an additive
  plant, and a metagate found one each.
- **Fix, by grade:** structural for the export (policy in `schema.ts` beside
  retention, values marked rather than dropped, the file naming what it withholds),
  and structural for the gate (keys read from call sites, camel humps split before
  the word test).
- **The claim that was false and now is not:** `docs/privacy.md` promised that
  without the key a tag is an HMAC of an unknown value and no dictionary attack
  applies. True of the database, false of the file the export produced. The page
  now says so, dated, rather than being quietly corrected — a privacy page that
  edits away its own broken promise is a page that will break another one.
- **Left open, filed rather than absorbed:** B-62. The wipe confirmation names five
  kinds of data where `STORES` has nine, so the user agrees to five and nine go.
  The direction is safe and it is still a confirmation that did not ask.

### 2026-08-19 — a supported browser that blocked nothing, and said the publisher was at fault

- **Symptom:** across Chrome 116–136 and Firefox 128 — the whole range the
  manifests invited — every feed update was refused, no list was ever in force,
  and the journal read "the update was not signed by the expected key". The
  publisher had signed it correctly.
- **Surfaced at:** the audit, from the manifest and the caniuse table rather than
  from a run. Confirming it in an old browser was never done and the record says so.
- **Owned by:** the seam between a crypto choice and a manifest field, which no
  test looks at because neither side is wrong alone. `@noble/ed25519` was the
  design's answer and runs anywhere; the implementation moved to
  `crypto.subtle.verify` with Ed25519, which needs Chrome 137 and Firefox 129;
  the manifests were never touched. Three artefacts, two of them consistent with
  each other, and the third silently deciding the product does nothing.
- **Root cause of the invisibility:** the tests generate an Ed25519 pair in Node,
  where the algorithm exists. They measured the developer's machine and reported
  it as the supported range — the same shape as a gate that reads a fresh clone
  and calls it every machine.
- **The worse half, and the one ADR-0004 already forbade:** `Verifier` returns a
  boolean, so "this engine does not know the algorithm" and "this signature is
  forged" arrive as the same value. `applyUpdate` maps that to `bad-signature`.
  A check that never ran was reported as a check that failed, and the sentence
  accused the one party that had done its job. `canVerify()` is now asked before
  the request, so the product declines to download a list it cannot check and the
  journal names the browser.
- **Fix, by grade:** structural. Floors raised to the primitive;
  `tools/manifest.test.ts` reads `SIGNATURE_ALGORITHM` from the source and refuses
  a manifest that invites a browser without it; ADR-0011 records that
  `@noble/ed25519` was weighed and refused, and why that refusal is reversible in
  one direction only.
- **Two defects in code written the same hour, both caught by its own tests before
  the first commit.** `bytesOf` calls `atob`, which throws synchronously, so
  `canVerify` threw at its caller rather than answering "no" — and the caller is a
  background alarm, so the throw would have become a `console.warn` while the
  honest journal entry, the whole reason for asking, was never written. And the
  probe cached one boolean while accepting a key as an argument, answering the
  second caller's question with the first caller's result. Neither was found by
  reading the code; both were found by writing the assertion that says what it
  should do. The second one was found *while composing the test*, before it ran,
  which is the cheapest place a defect can be found and an argument for writing the
  assertion first rather than after.
- **A loop-level fix, applied rather than only recorded.** The previous entry noted
  that two pushes per iteration let CI's `cancel-in-progress` discard the first
  commit's verdict. Three consecutive verdicts were cancelled that way. From this
  run the work and the retrospective are two commits and **one** push, so both
  land in a single CI run against the final tree and both stay bisectable.

### 2026-08-19 — a new gate went red for a reason that had nothing to do with what it guards

- **Symptom:** the gate written to catch foreign files in the shipped build fired
  on its first run, naming six of them. `find` over the same directories found
  none.
- **Surfaced at:** stage 6, in the minute after the gate existed.
- **Owned by:** the gate. `globSync('**/*')` matches directories as well as files,
  and a directory has no extension — so `chunks`, `assets`, `icons` and the three
  locale folders all failed a rule about file extensions. Fixed with `statSync`,
  and the reason is in the comment so the next reader does not re-derive it.
- **Why it is worth an entry rather than a line:** a red new gate is the most
  persuasive thing a run produces, and it is also the least trustworthy. Six named
  files were enough to believe the build was dirty; reading what it named took ten
  seconds and the build was clean. Standing instruction 7 is about numbers from a
  tool; this is the same sentence about a *verdict* from a tool, and the discipline
  it asks for is identical — read what it says, not that it spoke.
- **The plant had to move, and where it moved to is the finding.** Planting a
  dotfile into `dist` proved nothing: the gate's `beforeAll` runs `pnpm build`, and
  `build.mjs` starts by removing the target directory, so the plant was gone before
  the assertion ran — and the gate reported green, which reads as "the gate does
  not work" when it actually means "the plant does not". The real failure path is a
  file in the *source* that the build then copies, and a plant there turned both
  guards red by name. A plant has to travel the path the defect travels; anywhere
  else it measures the harness.
- **A division of labour, decided rather than defaulted:** `build.mjs` silently
  drops dotfiles, because a tool put them there and there is nobody to inform. It
  does *not* drop `icons/notes.txt`, so the gates can refuse that out loud — a
  build that quietly discards what a person misplaced hides the mistake instead of
  reporting it. The filter and the gates are narrow and wide on purpose, and both
  were planted with the same file to prove which catches which.
- **Two smaller ones, both found by using the thing rather than reading it:**
  `--check` measured build freshness against `dist`, which also holds `release/`
  and the two e2e builds and therefore outlives any target inside it — so it
  answered "chrome was not built" on a tree where building takes three seconds.
  And the reverse check is closed by extension rather than by a list of names,
  because the next stray file will not be called `.DS_Store`: `Thumbs.db`, a
  `.map`, a `README.md` were all caught by that shape.
- **A property of the loop this session is running, recorded once so it is not
  rediscovered:** each iteration lands the work in one commit and the
  retrospective in a second, because the stamp names the commit and therefore
  cannot precede it. CI's concurrency group has `cancel-in-progress`, so the first
  commit's verdict is cancelled by the second push. Nothing is unverified — the
  second commit's tree contains the first's — but a verdict can no longer be
  bisected to the code commit alone, and that is the trade rather than an accident.

### 2026-08-19 — the audit was wrong about two of the five numbers it accused

- **Symptom:** a task filed as "four numbers in the brand pack have drifted"
  turned out to be three. Two of the four accusations were the audit's own
  measurement error, and both would have "fixed" a document that was already
  right: a claimed 93 e2e checks reported as 85, and a claimed 11 Firefox checks
  reported as 14.
- **Surfaced at:** stage 0 of the run meant to apply the fix — the harvest
  re-measured every number instead of trusting the row that asked for the work.
- **Owned by:** the audit, and specifically the choice of instrument. Both wrong
  numbers came from `grep`, and both failed in the way `grep` fails on this
  question. `grep -cE '^\s*test\('` cannot see a test generated inside a loop,
  and `e2e/a11y.spec.ts:42` generates eight of them; `npx playwright test --list`
  answers `Total: 93 tests in 24 files`, because it is the tool that owns the
  number. `grep -cE '\bcheck\('` in `tools/firefox-e2e.mjs` counted the
  declaration on line 130 and the call on line 359 that only runs from a `catch`
  — eleven invocations sit on the passing path, which is what the document said.
- **Root cause:** standing instruction 7 already says a number produced by a tool
  is a claim about the tool until it has been checked against the artefact. It had
  been applied to diagnostics the project runs and not to the greps an audit
  writes, which is the same sentence with the auditor inside it.
- **Fix, by grade:** structural for the document, and a correction for the board.
  The three real drifts were understatements — 1309 against 1577, 26 against 30,
  14 against 18 — which is the direction nobody checks, since claiming less than
  you have reads as modest. Volatile counts now name the run; structural counts
  are gated; all eleven rows of the table are read where six were. The B-27 row
  keeps the disproof in its own text rather than being quietly rewritten, because
  a board that erases its wrong entries teaches nobody which way it errs.
- **Catches it next time:** three gates, and the shape of them matters more than
  the count. Scenarios and screens are checked together with their status,
  because "30, все реализованы" is two claims and a gate that checks one lets the
  other rot. Requirements are checked together with "exactly one closed by
  decision", because `done + byDecision === rows` is also true when a row is
  silently neither. And the volatile rows are matched per row rather than by
  forbidding digits in the file, which would have outlawed the structural counts
  the same block exists to check.
- **The plant discipline earned its second half again.** Two of the four plants
  reported the gate sound while never having applied: `sed '0,/re/'` is GNU form
  and does nothing on macOS, silently. Both were re-run through `perl` and the
  landing asserted — count before, count after — before the gate's verdict was
  read. Standing instruction 1 says exactly this and it is now the third run to
  need it, which is the argument for keeping the slot rather than pruning it.

### 2026-08-19 — the gate that graded the file manager, and the two beside it that were only lucky

- **Symptom:** `pnpm test` red on this machine and green on CI, on the same
  commit. One failure: `tools/docs.test.ts` asserting `| Пакетов | 20 |` against
  a `facts.md` that said 19. The document was right. `readdirSync('packages')`
  returned twenty entries because Finder had written a `.DS_Store`, and the gate
  read entries as directories. `.gitignore` covers the file, which is why nobody
  saw it in a diff and why CI never met it.
- **Surfaced at:** stage 0 of an audit, as the first thing measured. It had been
  red for six days.
- **Owned by:** the gate. And specifically the gate that `.githooks/pre-push`
  runs, so the only load-bearing check this project has was refusing every push
  while printing `OKOLOS_SKIP_GATES=1` in its own refusal text — a check that
  fails for a reason the reader cannot act on teaches the override, not the fix.
  `ci.yml:22-26` records that CI itself was dead for a hundred runs and that this
  hook is the reason the work was actually green; the hook was the second half of
  that arrangement, and it had just broken.
- **Root cause:** the entries of a directory are not its directories, and the
  difference is written by a program nobody invoked. The corrected helper already
  existed in the same file, on line 43, already used for this exact quantity
  twenty lines below — so this was not a missing idea, it was two ways of
  measuring one number living in one file.
- **What made it worth an entry:** fixing the instance would have left the class.
  A scan of all twenty-five gates found two more members, and both were *latent* —
  passing because of where a person had happened to click. `locales.test.ts` lost
  five of its ten checks the moment `_locales` held a dotfile, in the gate that
  guards the message catalogue. `licensing.test.ts` failed to load at all, since
  its throw happens while the module initialises, so none of its checks ran and
  the file reported as one failure rather than thirty-two missing ones. Two more
  readers are safe and for reasons worth writing down: `adr.test.ts` filters
  `^\d{4}-`, and the manifest sweep drops non-existent paths — the second by
  accident, from a filter added for packages without a `package.json`. A guard
  that works for a reason nobody chose is a guard that leaves when its reason does.
- **Fix, by grade:** structural — one definition, `tools/tree.mjs`, beside
  `imports.mjs` for the same reason. `filesIn` takes its suffix as a required
  argument, because a caller asking for "the files" without saying which will
  accept `.DS_Store` as one.
- **Catches it next time:** `tools/tree.test.ts`, on a fixture built for the
  purpose rather than on this repository — reading the real tree would have made
  the checks agree with whatever the tree holds today, which is the defect. Its
  third check asserts the filter is *load-bearing* by comparing against the raw
  listing, because the first two would also pass against no filtering at all on a
  fixture that happened to hold only directories. Removing the filter fails three
  of the seven. The suite is green with `.DS_Store` planted in five of these
  directories and green without them.
- **What the repository got right, and it is worth naming:** `coverage-shape`
  refused the new module until a test sat beside it, by name, with the sentence
  "write one, or exempt it with the reason". That gate fired within a minute of
  the file existing. And the plant discipline paid twice: `facts.md` at eighteen
  packages failed the exact test being repaired, and a key removed from the
  Russian catalogue failed the parity rule — both plants landed on the rule they
  were aimed at, which standing instruction 1 asks for in its second half
  precisely because earlier plants had not.
- **Left open, deliberately:** the class is closed by a shared helper, not by a
  rule. Eight gates still read `readdirSync` directly and filter each in their own
  way. This repository already keeps boundaries as lint rules — REQ-01 does exactly
  this for `core-*` — so B-58 files that, rather than pretending a helper nobody is
  obliged to use is a guarantee.

### 2026-08-13 — the feed source that would have taken down GitHub

- **Symptom:** none, and that is the point. `docs/data-sources.md` lists URLhaus
  as a free candidate and it is a good feed. Reading its download before wiring
  it in showed the third line is a `dropbox.com` link.
- **Surfaced at:** stage 5, before a line of ingest code existed, by opening the
  source rather than the documentation about the source.
- **Owned by:** the granularity mismatch. This extension blocks by **host**;
  URLhaus lists **URLs** where malware is hosted. A malware URL on a shared host
  is a fact about the URL and says nothing about the host.
- **Root cause:** a feed's usefulness is not a property of the feed. It is a
  property of the pair (feed, what you can do with an entry).
- **Fix, by grade:** design — URLhaus is not ingested, recorded in ADR-0010 and
  as a **test**, so a future pass adding it for the entry count has to delete
  the line and read why. Measured for the record: 63,978 lines, 6,030 hosts, and
  **11 of them services that cannot be blocked whole** — github.com,
  drive.google.com, gitlab.com, raw.githubusercontent.com among them.
- **Catches it next time:** the guard list, and the number beside it. A run that
  starts refusing twenty hosts is a run where the source changed shape.

### 2026-08-13 — a heuristic measured, and thrown away, before it shipped

- **Symptom:** the guard list missed five shorteners on the first real run —
  `g5.lu`, `goo.su`, `s4w.in`, `i.gal`, `vo.la`. A fixed list cannot keep up
  with shorteners, so a signal was needed.
- **The idea:** a host appearing with several distinct paths in one feed is a
  shared host, not a campaign host. Plausible, cheap, and wrong.
- **Measured before writing it:** `wells-fargo-ac06dd.previewship.net` appears
  with **16** distinct paths and is one campaign on its own host; `g5.lu`, a
  shortener, appears **once**. The signal is not weak — it points the wrong way.
- **What shipped instead:** a two-label host under eight characters is refused.
  Five of 253 fall under it, all five shorteners, against a median host length
  of 22 — and the threshold comes from the **asymmetry of harm**, not from
  accuracy: a wrong block breaks every link on a shortener for everyone who
  installed this, a wrong pass harms one person who clicked one link.
- **Catches it next time:** standing instruction 7, doing exactly its job. The
  first heuristic was a claim about the data; twenty seconds of counting turned
  it into a measurement, and the measurement killed it.

### 2026-08-13 — I filed a human step for a trade a decision had already refused

- **Symptom:** the previous run found the signing-pair test failing on CI for
  want of a private key, wired `secrets.OKOLOS_FEED_KEY` into the workflow, and
  filed "add the secret" as a human step. It read as obviously right.
- **Surfaced at:** stage 2 of the next run, while planning the feed's refresh
  schedule — which meant reading ADR-0002, which says in as many words:
  *публикация требует машины с ключом — её нельзя запустить из CI без переноса
  приватного ключа, и это сознательно.*
- **Owned by:** the previous run's stage 7. The fix was aimed at a red gate, and
  a red gate is a symptom; the decision about where the key may live was already
  written down and was not consulted.
- **Root cause:** turning a gate green is not the goal. The gate exists to
  protect something, and here the something was the trust boundary the fix
  widened.
- **Fix, by grade:** design — the test asks a different question depending on
  where it runs and **asserts in both cases**: on the machine, the pair matches;
  on CI, the key is absent. The second is ADR-0002's invariant stated as a test
  rather than assumed. A third rule covers the case where neither holds, because
  two conditional blocks with no third would both skip and report green over an
  unchecked pair.
- **Catches it next time:** nothing mechanical, and that is worth being honest
  about. **No standing instruction was added** — the list is at its cap of ten
  and nothing in it has become a check, so adding would mean retiring something
  still doing work. The generalisable form is already instruction 2 read one
  level up: a decision record is part of the artefact, and "the gate is red" is
  a source claim about what to do next.

### 2026-08-13 — a hundred CI runs, a hundred failures, and nobody had looked

- **Symptom:** the pipeline's stage 7 says the CI verdict is *read* before
  anything is tagged. Reading it found the run red — and so was the one before
  it, and the one before that. `gh run list --limit 100` returns 100 runs and
  **100 failures**. Every job died in ten seconds at
  `pnpm/action-setup`, which refuses to run when a version is given both as
  `version: 11` in the workflow and as `packageManager: pnpm@11.10.0` in
  package.json. `packageManager` has been there since the first commit, so CI
  has never once executed a gate in this repository.
- **Surfaced at:** stage 7 of the dashboard run, on the first push.
- **Owned by:** the retrospective, of all places. A standing instruction —
  "read the gate's output before pushing" — was **retired on 2026-08-09 as
  having become a check**, and the check named was `.githooks/pre-push`. That
  hook is real and it works: it runs the gates locally and refuses the push
  when they fail. It is why the work actually was green. It is also why nobody
  ever had a reason to open the CI tab. The instruction was retired against a
  check that covered the developer's machine and not the pipeline, and the
  wording of the retirement did not notice the difference.
- **Root cause:** two sources for one version, and a local check standing in for
  a remote one without anyone deciding that it should.
- **Fix, by grade:** mechanical for the config — the workflow drops its
  `version:` and lets `packageManager` be the single source. Then the pipeline
  ran for the first time and found three more, each invisible on a machine that
  has already built or signed something:
  1. the icon gate compared **compressed** bytes, and `deflateSync` is not
     byte-identical across zlib builds — the Linux runner reported the icon as
     changed when not one pixel had moved. It compares inflated pixels now;
  2. the Firefox job never ran `pnpm build:e2e`, so the test-hook build was
     missing. Locally it was always there from an earlier run;
  3. the feed-key pair test has no private key on CI. The workflow now passes
     `secrets.OKOLOS_FEED_KEY`; until that secret exists the job stays red on
     that one test, deliberately, because a signing pair nobody can verify is a
     real problem for a product whose feed is signed. Filed as B-19.
- **Catches it next time:** CI itself, now that it runs. Which is also why **no
  standing instruction is added here.** An instruction saying "check that CI is
  really running" would be retired by this list's own rule the moment the fix
  landed — the fix *is* the check. The lesson that generalises is already
  instruction 2, and it is worth reading with this in mind: *check the artefact,
  not only the source* applies to a pipeline as much as to a bundle, and "it
  passes on my machine" is a source claim.

### 2026-08-13 — three gates went blind, and their own guards caught all three

- **Symptom:** the artefact half of the new address gate reported clean three
  times while reading nothing. First it globbed `dist/*/*.js` and swept up
  `tsc`'s per-directory emit, which **keeps comments**, so it failed on
  `options.html#appeal` — an address that a file's own doc comment names as the
  dead one it stopped using. Then the producers moved onto `optionsPageFor`, and
  a whole address stopped existing as one literal anywhere in the build, so the
  rule checked every address and then checked none, still passing. Then the glob
  missed `dist/<build>/chunks/`, where the route table actually ships.
- **Surfaced at:** stage 5, three times, each time by the same companion test —
  the one that asserts the sweep can see anything at all.
- **Owned by:** the gate, each time. None of the three was a product defect.
- **Root cause:** a scan is a claim about what it read, and the thing it reads
  moves — a build layout, a bundler's inlining, a compiler's emit.
- **Fix, by grade:** mechanical each time, and the third one changed what the
  rule asserts rather than how it looks: with addresses no longer spellable by a
  producer, what the artefact can still prove is that the **vocabulary shipped**,
  so it checks that every address the table declares is present in the build.
- **Catches it next time:** it already did, three times. Standing instruction 3
  earns its place here — *absence of data must never read as a pass* — and the
  cheapest form of it is one extra assertion per sweep: prove the sweep found
  something before trusting that it found nothing wrong.

### 2026-08-13 — the gate for this defect existed, and it had already missed it

- **Symptom:** `tools/destinations.test.ts` was written for exactly this class —
  "every place a button sends someone must exist when they get there" — after
  three dead links, one of them `options.html#appeal`. It was in the suite,
  green, while `onOpen('settings')` opened the self-audit panel.
- **Surfaced at:** stage 5, when the gate's own "not blind" check failed after
  the producers were rewritten.
- **Owned by:** the gate's extraction method. It collected destinations by
  scanning `getUrl('…')` **literals**, and the broken branch built its URL in a
  conditional whose fall-through carried **no hash at all**. There was no hash
  to check, so there was nothing to report.
- **Root cause:** the gate checked "the hash a literal carries has a reader"
  when the promise is "the destination a button reaches is the one it names".
  The second is not a stricter version of the first; it is a different question.
- **Fix, by grade:** structural — the addresses come from one table now, read by
  `routeFor` and written by `hashFor`, so producer and consumer cannot disagree,
  and `tools/options-routes.test.ts` additionally forbids spelling one by hand.
  `destinations.test.ts` keeps the rule that is genuinely its own — the page
  exists in the build — and reads the table for the rest.
- **Catches it next time:** the round-trip assertion, and the ban on hand-written
  addresses. Both verified by planted defects, each reddening its own rule.

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
  the standing instruction the one about absence never reading as a pass generalises it.
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
- **the standing instruction the one about a new surface joining the accessibility sweep:** when a new user-facing surface ships, it joins
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
- **the standing instruction the one about a deferred assertion naming its release:** a test comment that defers an assertion to a
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
- **the standing instruction the one about a number being a claim about the tool that produced it:** a number produced by a tool is a claim about the
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
- **Prevention:** none new. the standing instruction the one about reading gate output before pushing — since retired into `.githooks/pre-push` already says exactly this,
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

- **The other half:** the standing instruction the one about reading gate output before pushing — since retired into `.githooks/pre-push` — read the gate output before
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
- **Prevention:** the standing instruction the one about confirming a plant landed — since merged into the planting rule already covers confirming a plant
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
client refuses every update forever. Same shape as the standing instruction the one about confirming a plant landed — since merged into the planting rule, one
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
- **Prevention:** the standing instruction the one about a detector that reads wording reading a language, and a Known limit in SCN-003,
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
  not the extension that cannot speak it. the standing instruction the one about a number being a claim about the tool that produced it earned its
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
- **Owned by:** me, and the standing instruction the one about a number being a claim about the tool that produced it applies to a number my own
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

### 2026-08-09 — the gate that kept refusing me, and was right five times

- **Symptom:** finishing the localisation meant `tools/locales.test.ts` failing
  five separate times with "translated and never shown" — five keys I had just
  written and wired.
- **Root cause, each time mine:** it finds the keys a build asks for by reading
  `t('…')`, `*_KEY` tables and `…Key:` fields, and deliberately nothing looser,
  because a looser reader keeps dead messages alive. I wrote, in order: a
  ternary, a table named `key`, a table with a type intersection
  (`Record<…> & {…} = {` is not `Record<…> = {`), a `*_KEY` **array** where it
  only read records, and three keys handed to a function as bare positional
  arguments.
- **The rule that held:** widen the gate only where the discipline survives.
  Four of the five were fixed by writing the code the way the gate reads — a
  `*_KEY` table with its fallback present as an entry. Two were fixed by
  widening: `*_KEY` arrays are as explicit as `*_KEY` records, and the type
  annotation is not what stops a dead message, the name is. Both widenings were
  then checked with plants in each direction — an unused key and a key nobody
  translated each still turn it red.
- **The defect it was standing in front of:** the service worker had started
  reaching `t()` without installing a resolver, so every download-verdict string
  would have rendered as `[downloadFeedUnread]`. A second gate,
  `tools/entry-resolver.test.ts`, named the entry point outright.
- **And the rule that came out of it:** the worker resolves what it *shows* and
  never what it *stores*. `feed-sync`'s note now hands the journal a key and its
  arguments instead of a finished sentence — a record written in whichever
  language was active that day has stopped being one record.
- **The brand pack caught a word.** My translation of the feed failure used
  «сервер»; `terminology.md` forbids it and names «сервис». Translating is
  writing, and writing goes through the brand pack.

### 2026-08-09 — the question was not which fetch, it was whether any

- **The task as written:** "decide what counts as a sensitive request with no
  form and no navigation behind it" — a criterion to pick.
- **What checking first showed:** there is nothing to pick from. A content
  script is in an isolated world and never sees the page's `fetch`; MV3 has no
  blocking `webRequest`; `declarativeNetRequest` is declarative and cannot ask a
  person anything. Holding such a request is not achievable. The only vantage
  point is a `MAIN`-world script, and one that *held* would either break other
  people's sites or, against a page that captured `fetch` first, promise a reach
  it does not have.
- **So the answer is a record, not a gate**, and the journal line says the
  request was not stopped in those words. A user whose page moved money while a
  hidden instruction sat unresolved can find that out; nothing claims it was
  prevented.
- **The strongest gate in this product half-noticed.** REQ-08 — one module
  reaches the network — passed the new file at source level because the token it
  scans for is `fetch(` and the code spells `originalFetch.apply`. It fired at
  bundle level, but on `dist/page-watch/index.js`: a `tsc` artefact that ships to
  nobody, because the glob was `dist/*/*.js` rather than the two directories a
  browser loads. So one rule passed by an accident of spelling and the other
  fired on a file nobody installs.
- **Fixed by naming, not by silencing:** the exemption is written into both
  rules with the reason, the glob scans what ships, and three new rules hold the
  watcher to observing — no destination of its own, the original called with the
  arguments it was given, and no `await` between reading a call and making it.
- **the standing instruction the one about confirming a plant landed — since merged into the planting rule, again, and it cost a round.** The first three
  plants all turned the gate red — on "the artefact these gates read was
  actually built", because each broke the build. A plant that fails to compile
  tests nothing. Rewritten so each compiles, each then failed its own rule by
  name.
- **The seam the unit tests found:** `watchPage(win)` took a window and then
  read the ambient `window` and `location` anyway, and `armed` was module state.
  In production these are the same objects, so nothing would have broken — which
  is exactly why it was worth fixing: a dependency that works because the global
  happens to be right is one no test can check.
- **A test premise corrected by measurement:** "an unparseable URL reports
  nothing" was wrong. Almost anything resolves against a base, and a POST to a
  relative path is a state-changing request to the page's own host — worth
  recording. The test now asserts that, and a separate one covers input that is
  not a URL at all.

### 2026-08-09 — `git checkout --` on a file whose work was not committed

- **Symptom:** reverting a planted defect deleted three tests and an import
  that had been written minutes earlier and never committed.
- **Root cause:** all session the plant-and-revert pattern had been
  `cp file /tmp/x.bak` first, then `cp /tmp/x.bak file` to undo. For one file I
  had made no backup and reached for `git checkout -- <file>` instead, which
  restores the *committed* state and discards everything since.
- **Cost:** small — the content was still in context and was rewritten in one
  step. It would not have been small an hour later.
- **Prevention:** the backup is part of the plant, not an optional first step.
  `git checkout` reverts to a commit, and a plant is not a commit.

### 2026-08-09 — an index that had to be able to say "I do not know"

- **The decision B-14 needed** was not an algorithm but what may sit on the
  disk. The check already computes SHA-1 of the password in the content script
  and sends only that; the tag is now an HMAC over *that digest*, taken in the
  worker under a device-local random key — so the password crosses no new
  boundary, and nothing new is derived where the password actually is.
- **No truncation, deliberately.** A shorter tag collides, and a collision here
  reads as "you use this password on a site you have never used it on". A
  product that refuses to lie cannot buy disk space with a false positive.
- **The third answer is the point.** The old "Check reuse" control was removed
  because a panel answering "no reuse found" out of an index that did not exist
  tells the safest possible lie. The new one distinguishes three states — the
  other sites, "not seen on any other site on this device", and "unknown: this
  device has not seen it before" — and the third is what a fresh install has to
  say. `reuseOf` returns `unknown` separately from an empty list for exactly
  this reason, and a test pins the distinction.
- **What it stores is pinned by shape, not by intention:** three keys and no
  more, and a date rather than a timestamp — storing the hour someone logs in
  would make the index a record of their evenings. Both verified by planting.
- **The privacy document is where this is really decided.** It gained a
  paragraph naming the one thing derived from a password, why it cannot be
  reversed, and that the browser's own password store is richer than it — and
  the generated page a stranger reads was regenerated in the same change,
  because a gate compares them.

### 2026-08-09 — three artefacts agreed with each other and the page was broken

- **Symptom:** the deployed privacy policy carried literal `**` in its text and
  read as a column of one-line fragments. Found by fetching the live page after
  a deploy, to confirm a paragraph had landed.
- **Root cause:** the generator transformed the document line by line. Bold
  opened on one source line and closed on the next matched nothing, so both
  markers survived; and every wrapped line became its own `<p>`.
- **Why nothing caught it:** the markdown was correct, the generator's inline
  rule was correct, and the gate compares the served page to what the generator
  produces — so all three agreed. A gate that checks two artefacts against each
  other cannot see a fault they share.
- **The cache nearly hid it too.** The first check after deploying found the
  paragraph missing and I nearly reported the deploy as failed; the page sets
  `max-age=300` and curl had a five-minute-old copy. The deploy was fine and the
  check was wrong.
- **Fix:** prose is joined before it is marked up, and four rules now read the
  generated markup rather than comparing it to its own source — no unrendered
  emphasis, emphasis actually rendered (the mirror, or stripping every asterisk
  would satisfy the first), and a paragraph count well below the source line
  count. Verified by planting both the old behaviour and the lazy fix.
- **The general shape:** when a document, a generator and a comparison gate all
  agree, the thing to look at is the artefact a stranger receives.

### 2026-08-09 — the landing page, and the page beside it that was in the wrong language

- **The decision B-15 needed** was where the page lives, not what it says. It
  went to the root of the worker that already serves `/privacy` and `/status`:
  one origin, one deploy, one set of gates, and internal links that explain the
  structure to a crawler rather than to a human alone. An ugly address changes
  with one CNAME; a second deployment target does not.
- **Designed for two readers rather than optimised for one afterwards.** The
  answer is in the markup, there is no executable script at all, and the
  structured block repeats the same claims in the form a machine reads. Eleven
  rules hold it, four verified by planting — a script appearing, a forbidden
  superlative appearing, the "what it does not do" list gutted, and the JSON-LD
  becoming invalid.
- **Half the page is what the product does not do**, and that is a rule rather
  than modesty: a security tool listing only its powers is describing something
  nobody can check. The gate counts both lists so neither can quietly shrink.
- **Found while reading the neighbouring page:** `/status` was served with
  `lang="en"` and English copy — the public surface a site owner reaches from a
  blocked page, in a product whose four screenshots, catalogue and privacy page
  are Russian. Nothing had flagged it because nothing compares one public page
  to another. Translated in the same change, with the appeal form.
- **Four test assertions were pinned to the English wording** and went red on a
  page that had become more correct — `/listed/i`, `/not listed/i`,
  `/enter a domain/i`. The same shape as the extension's own tests a few
  iterations ago, in a different app, found the same way.

### 2026-08-09 — pruning the list broke the citations, which was the point

- **The prune was overdue.** The list had grown to thirteen against a hard cap
  of ten, and stage 0 of every run reads it in full: a list nobody reads to the
  end is worse than no list, because everyone believes it is covered. Two rules
  had **become checks** and were retired for it — cross-browser claims (the
  Firefox harness runs eleven of them in CI) and reading gate output before
  pushing (`.githooks/pre-push` refuses and prints the failure). A third was
  merged rather than deleted: confirming a plant landed is the same discipline
  as planting, and was only written separately because the first was being done
  carelessly.
- **Then the gate refused the prune**, correctly: entries cited "standing
  instruction 13", and after renumbering there is no thirteen.
- **The fault was in the citations, not the prune.** A number is a position, and
  a position moves the moment the list changes; a name does not. Every citation
  in this file now names the rule it means, and two of them say the rule has
  since been retired or merged — which is more useful to a reader than a number
  pointing at whatever now sits in that slot.
- **The gate that caught it was written eight iterations earlier**, for the
  opposite fault: entries citing instructions the list had never grown to
  include. It turns out to hold both directions.
