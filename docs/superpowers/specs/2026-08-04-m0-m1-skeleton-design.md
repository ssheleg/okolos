# Spec — Walking skeleton: M0 (frame & contracts) + M1 (net & self-audit)

- **Дата:** 2026-08-04
- **Стадия:** 3 (spec), модули M0 и M1 + сквозной срез M3/M4
- **Бриф:** [../briefs/2026-08-04-okolos-p0-p5.md](../briefs/2026-08-04-okolos-p0-p5.md)
- **Карта модулей:** [../module-map.md](../module-map.md)

## 1. Что закрывает эта спека

| REQ | Требование | Гейт |
|---|---|---|
| REQ-01 | `core-*` не импортирует браузерные API | eslint + статический тест по исходникам |
| REQ-02 | Контракты и схема хранилища v1 | unit на сериализацию + миграция на чистом профиле |
| REQ-08 | Единая точка выхода в сеть + журнал самоаудита | e2e с перехватом CDP: запрос без записи роняет билд |
| REQ-27 | Один код под Chrome/Edge и Firefox | e2e-прогон обоих билдов |
| REQ-28 | Ноль исходящих с URL или содержимым; экспорт и стирание | тот же сетевой гейт + unit на экспорт/стирание |
| REQ-30 | AGPL-3.0 и атрибуция HIBP | тест наличия LICENSE и строки атрибуции в UI |
| REQ-31 | UX-цепочка не дрейфует | `python3 docs/ux/lint.py` в CI |

Сквозной срез для скелета (полные версии — в спеках M3/M4): детектор-заглушка
ступени 1, баннер, первый запуск. Сценарии, которые скелет должен провести
end-to-end: **SCN-003** (баннер по находке) и **SCN-019** (панель самоаудита).

## 2. Раскладка репозитория

```
okolos/
├── package.json                  # pnpm workspace root, скрипты
├── pnpm-workspace.yaml
├── tsconfig.base.json            # strict: true, noUncheckedIndexedAccess: true
├── eslint.config.js              # flat config, правила границ
├── vitest.config.ts              # workspace-проект
├── playwright.config.ts
├── packages/
│   ├── contracts/                # типы, без рантайм-зависимостей
│   ├── core-injection/           # M3 (в скелете — только ступень 1)
│   ├── storage/                  # схема, миграции, экспорт/стирание
│   ├── net/                      # ЕДИНСТВЕННАЯ точка выхода + журнал
│   ├── ui/                       # компоненты поверхностей
│   └── platform/                 # адаптеры браузеров
│       ├── src/types.ts          # интерфейс Platform
│       ├── src/chrome.ts
│       └── src/firefox.ts
├── apps/
│   └── extension/
│       ├── manifest.chrome.json
│       ├── manifest.firefox.json
│       └── src/{background,content,offscreen,popup,options}/
├── corpora/                      # тестовые корпуса
└── tools/                        # скрипты сборки и гейтов
```

**Инструменты (зафиксировано):** pnpm workspaces · TypeScript strict ·
Vite (library mode на каждую точку входа) · рукописные манифесты обоих
браузеров (без фреймворка-обёртки — расширению безопасности нужен полный
контроль над MV3-деталями) · `web-ext` для запуска и упаковки Firefox ·
Vitest + fast-check + happy-dom · Playwright для e2e · ESLint 9 flat ·
`idb` для IndexedDB · `@noble/ed25519` для проверки подписи (M7).

## 3. Контракты — `packages/contracts`

Файл `src/verdict.ts`:

```ts
export type Confidence = 'certain' | 'high' | 'medium' | 'low'
export type Severity   = 'critical' | 'major' | 'minor' | 'info'
export type Stage      = 'diff' | 'rules' | 'model' | 'feed' | 'inventory' | 'corpus'
export type Action     = 'silent' | 'inform' | 'warn' | 'block' | 'sanitize' | 'gate'

export type EvidenceKind =
  | 'hidden-text' | 'clipboard-write' | 'domain-lookalike' | 'feed-match'
  | 'permission-delta' | 'publisher-change' | 'hash-match' | 'form-context'
  | 'fullscreen-trap' | 'type-mismatch' | 'corpus-hit'

export interface Evidence {
  readonly kind: EvidenceKind
  readonly stage: Stage
  /** DOM-путь, downloadId, extensionId — то, что позволяет показать место */
  readonly locator?: string
  /** ≤200 символов, после редактора секретов; никогда не полный документ */
  readonly snippet?: string
  readonly detail: Readonly<Record<string, string | number | boolean>>
}

export type SubjectKind = 'page' | 'url' | 'download' | 'extension' | 'credential' | 'domain'

export interface Verdict {
  readonly id: string                    // uuid, генерируется вызывающим
  readonly subject: { readonly kind: SubjectKind; readonly ref: string }
  readonly category: VerdictCategory
  readonly severity: Severity
  readonly confidence: Confidence
  readonly evidence: readonly Evidence[]
  readonly action: Action
  readonly sources: readonly SourceRef[]
  readonly createdAt: string             // ISO-8601, ПЕРЕДАЁТСЯ снаружи
}

export interface SourceRef {
  readonly name: string                  // 'openphish' | 'stage:diff' | 'hibp' …
  readonly version: string
  readonly updatedAt: string
}

export type VerdictCategory =
  | 'injection' | 'phishing' | 'lookalike' | 'clickfix' | 'techsupport'
  | 'download' | 'credential' | 'password' | 'extension' | 'leak'
```

**Инвариант чистоты:** ни одна функция `core-*` не читает часы, не генерирует
случайные числа и не обращается к сети или DOM. `createdAt` и `id` приходят
параметром. Это то, что делает детекторы тестируемыми на корпусе и
воспроизводимыми.

Файл `src/snapshot.ts` — вход детектора инъекций:

```ts
/** Кандидат: узел, чей текст есть в DOM, но человеку не виден. */
export interface HiddenTextCandidate {
  readonly locator: string               // CSS-путь до узла
  readonly text: string                  // ≤2000 символов, обрезается коллектором
  readonly concealment: readonly ConcealmentTechnique[]
  readonly carrier: CarrierKind
  readonly charClasses: readonly CharClass[]   // 'zero-width' | 'unicode-tag' | 'rtl-override'
}

export type ConcealmentTechnique =
  | 'color-on-color' | 'display-none' | 'visibility-hidden' | 'opacity-zero'
  | 'clip' | 'offscreen' | 'font-size-zero' | 'aria-hidden' | 'non-rendered'

export type CarrierKind =
  | 'text-node' | 'html-comment' | 'meta' | 'alt' | 'title' | 'aria-label'
  | 'data-attr' | 'json-ld' | 'template'

export interface PageCandidates {
  readonly url: string                   // origin + path, БЕЗ query и fragment
  readonly frameId: number
  readonly nodeCount: number             // размер обхода, для бюджета
  readonly candidates: readonly HiddenTextCandidate[]
  readonly truncated: boolean            // обход упёрся в бюджет
}
```

`url` в снимке усечён до origin+path **в коллекторе**, до пересечения границы
процесса: query и fragment часто содержат токены, и им нечего делать даже в
локальном журнале.

Файл `src/policy.ts` — политика уверенность → действие:

```ts
export function decideAction(v: Pick<Verdict,'confidence'|'category'|'severity'>): Action
```

| Уверенность | Основание | Действие |
|---|---|---|
| `certain` | точное совпадение с подписанным фидом, хэш, дельта разрешений | `block` / `gate` |
| `high` | детерминированные ступени (diff, clipboard-write, punycode) | `sanitize` + `warn` |
| `medium` | правила и сигнатуры | `inform` |
| `low` | только классификатор | `silent` |

Тест фиксирует: **`model` в одиночку никогда не даёт `block` или `sanitize`.**

Файл `src/rpc.ts` — версионированная шина:

```ts
export interface Envelope<T = unknown> { readonly v: 1; readonly type: string; readonly payload: T }
export type RpcMap = {
  'page/candidates': { req: PageCandidates; res: { verdicts: Verdict[] } }
  'page/rescan':     { req: { frameId: number }; res: { ok: true } }
  'audit/list':      { req: { since?: string; limit?: number }; res: { entries: AuditEntry[] } }
  'data/export':     { req: Record<string, never>; res: { json: string } }
  'data/wipe':       { req: { confirm: true }; res: { ok: true } }
}
```

Неизвестный `type` или `v !== 1` → отправитель получает
`{ error: 'unsupported', v: 1 }`, приёмник пишет в журнал и **не падает**.

## 4. Хранилище — `packages/storage`

IndexedDB `okolos`, версия 1. Объектные хранилища:

| Store | keyPath | Индексы | Ретеншн |
|---|---|---|---|
| `findings` | `id` | `by-subject`, `by-created` | до разрешения + 30 дней |
| `journal` | `id` | `by-created`, `by-kind` | 90 дней |
| `outbound_log` | `id` | `by-created`, `by-purpose` | 90 дней |
| `exceptions` | `[scope,ref]` | `by-created` | бессрочно, пока не снято |
| `settings` | `key` | — | бессрочно |
| `snapshots` | `extensionId` | — | последний + предыдущий |

Шифрования нет и не заявляется: ключ, лежащий рядом в `storage.local`, не
защищает ни от чего, кроме случайного взгляда. Граница доверия — профиль
браузера; это написано в UI настроек, а не спрятано.

Ретеншн исполняется `chrome.alarms` раз в 24 часа. `data/export` отдаёт **все**
хранилища одним JSON; `data/wipe` удаляет базу целиком и возвращает расширение
в состояние первого запуска. Частичный сбой стирания → отчёт о том, что не
удалилось, и повтор; успех при частичном стирании не рапортуется никогда.

## 5. Сеть и самоаудит — `packages/net`

Единственный разрешённый способ выйти в сеть:

```ts
export interface RequestSpec {
  readonly url: string
  readonly method: 'GET' | 'POST'
  readonly purpose: Purpose              // зачем — попадает в журнал
  readonly body?: string
  readonly headers?: Readonly<Record<string, string>>
  /** Как показать отправленное человеку: 'hash-prefix:5BAA6' и т.п. */
  readonly payloadShape: string
}
export type Purpose =
  | 'feed-update' | 'model-update' | 'password-range'
  | 'leak-lookup' | 'file-hash' | 'domain-status'

export async function request(spec: RequestSpec): Promise<Response>
```

Порядок строгий: **сначала запись в `outbound_log`, потом `fetch`.** Если
запись не удалась — запрос не выполняется. Обратный порядок сделал бы журнал
описательным, а не обязывающим.

Редактор проверяет `url` и `body` на запрещённые формы (email-подобные строки,
полные URL страниц, содержимое DOM) и **бросает** при попадании — это ловит
регресс в момент разработки, а не после релиза.

Запись журнала:

```ts
export interface AuditEntry {
  readonly id: string
  readonly createdAt: string
  readonly destination: string           // хост, без пути с параметрами
  readonly purpose: Purpose
  readonly payloadShape: string
  readonly triggeredBy: string           // 'alarm:feeds' | 'user:password-check'
  readonly outcome: 'sent' | 'blocked-by-redactor' | 'failed'
}
```

### Как REQ-08 становится машинной проверкой

Три уровня, каждый падает сам по себе:

1. **ESLint:** `fetch`, `XMLHttpRequest`, `navigator.sendBeacon`, `WebSocket`
   запрещены во всех пакетах, кроме `packages/net/src/transport.ts`.
2. **Статический тест:** сканирует собранные бандлы на те же идентификаторы вне
   разрешённого модуля.
3. **E2E-гейт:** Playwright с CDP-перехватом гоняет сценарии; каждый
   наблюдённый запрос обязан иметь запись в `outbound_log` с совпадающим
   хостом и назначением в пределах 500 мс. Лишний запрос или отсутствие записи
   — красный билд.

## 6. Платформа — `packages/platform`

```ts
export interface Platform {
  readonly kind: 'chrome' | 'firefox'
  storage: { local: KeyValue }
  alarms: { create(name: string, periodInMinutes: number): Promise<void>
            onFired(cb: (name: string) => void): void }
  runtime: { send<K extends keyof RpcMap>(t: K, p: RpcMap[K]['req']): Promise<RpcMap[K]['res']>
             onMessage(h: RpcHandler): void }
  tabs:    { activeUrl(): Promise<string | null> }
  /** Chrome — offscreen-документ; Firefox — фоновая страница */
  inference: { ensureHost(): Promise<InferenceHost> }
}
```

Различия, которые поглощает адаптер и о которых ядро не знает: у Chrome
service worker без DOM и инференс в offscreen-документе, блокировка через
`declarativeNetRequest`; у Firefox фоновая страница с DOM, доступен блокирующий
`webRequest`, DNR урезан, Gemini Nano отсутствует.

## 7. Композиция расширения

| Точка входа | Chrome | Firefox |
|---|---|---|
| фон | `background.service_worker` | `background.scripts` (event page) |
| контент | `content_scripts`, `all_frames: true`, `document_start` | то же |
| инференс | `offscreen` | фоновая страница |
| поверхности | `action.default_popup`, `options_page` | то же |

Разрешения скелета: `storage`, `alarms`, `scripting`, `activeTab`. Широкие
host-permissions **не запрашиваются на этом этапе** — они появляются вместе с
функциями, которым нужны, и каждая объясняется в листинге стора.

Контент-скрипт: обход DOM с бюджетом (§8), MutationObserver с батчингом
250 мс и потолком 2 пересканирования в секунду, UI в **closed Shadow DOM**,
чтобы CSS страницы не мог перекрасить или спрятать предупреждение.

## 8. Бюджеты производительности (REQ-09, стенд в M2)

| Этап | Бюджет |
|---|---|
| Обход и сбор кандидатов, ≤5к узлов | ≤ 8 мс |
| То же, >5к узлов | ≤ 20 мс, чанками через `requestIdleCallback` |
| Правила | ≤ 5 мс |
| Классификатор (M3) | ≤ 250 мс, только по сигналу ступеней 1–2 |
| Память фонового контекста | ≤ 64 МБ |

**Бенчмарк сообщает, а не гейтит, и это решение, принятое позже этой спеки.** Строка
здесь раньше читалась «превышение бюджета в бенчмарке CI = красный билд», и это было
неверно дважды: `bench` не запускается в CI вообще (`.github/workflows/ci.yml` его не
упоминает), а потолок по настенным часам, поставленный гейтом, краснеет от загрузки
раннера, а не от кода. Решение и его основание — в `docs/superpowers/backlog.md`, строка
«Бенч сообщает, а не гейтит». Числа выше остаются целями, которые проверяет
`pnpm bench` осознанным прогоном.

## 9. Поведение при отказах

| Отказ | Поведение |
|---|---|
| Детектор бросил исключение | страница не ломается, `performance.mark('okolos:scan-failed')` ставится на странице, причина пишется в журнал **один раз на причину** — и попытка повторяется на следующей мутации. Предохранителя нет, см. ниже |
| Запись в `outbound_log` не удалась | запрос не отправляется |
| Редактор нашёл запрещённую форму | запрос блокируется, запись `blocked-by-redactor`, ошибка в разработке |
| Хранилище недоступно | поверхности показывают состояние ошибки с действием «починить»; пустой список никогда не показывается вместо ошибки |
| RPC-сообщение неизвестного типа/версии | ответ `unsupported`, запись, без падения |
| Обход упёрся в бюджет | `truncated: true`, вердикт помечается частичным, UI это говорит |

Fail-open везде: сбой детекта никогда не превращается в блокировку.

**Предохранителя, «гасящего детектор на сессию», нет — и это исправление спеки, а не
недоделка (2026-08-20).** Первая строка таблицы обещала именно его, и обещание было
хуже реализации: типичная причина отказа — перезапуск service worker, то есть
переходная. Погасив детектор на сессию, продукт превратил бы её в страницу, которая
до конца сессии не проверяется, **молча** — ровно то, что запрещает
[ADR-0004](../../adr/0004-verdict-never-outruns-checks.md): «не проверено» не
превращается в «чисто». Реализовано иначе: `failOpen`
(`apps/extension/src/content/fail-open.ts`) отдаёт управление странице, ставит метку
на странице, пишет причину в журнал один раз на причину (флуд от мутирующей
страницы — единственное, чего здесь надо избегать), и следующая мутация пробует
снова.

Остаток непостроенного предохранителя — вид записи журнала `detector-disabled` —
имел четыре читателя и ни одного писателя и удалён тем же заходом; возврат ловит
`tools/journal-kinds.test.ts`.

## 10. Критерии приёмки

1. `pnpm build` даёт два загружаемых расширения: Chrome (`--load-extension`) и
   Firefox (`web-ext run`).
2. **SCN-003** проходит e2e на обоих: страница со скрытым текстом → баннер с
   одной фразой и кнопкой «Show me».
3. **SCN-019** проходит: панель самоаудита показывает журнал; при пустом
   журнале — явная фраза, а не пустая таблица.
4. Сетевой гейт зелёный: каждый наблюдённый запрос имеет запись; подброшенный
   в тесте «сырой» `fetch` роняет билд (проверка на посаженном дефекте).
5. Граница `core-*` зелёная: подброшенный `document.querySelector` в
   `core-injection` роняет lint и статический тест.
6. `data/export` возвращает все хранилища; `data/wipe` возвращает расширение к
   первому запуску.
7. `python3 docs/ux/lint.py` зелёный.
8. Бенчмарк укладывается в §8 на наборе страниц из `corpora/pages/`.

Каждый гейт проверяется **на посаженном дефекте** — зелёный, который никто не
видел красным, доказательством не является.

## 11. Вне скоупа этого кирпича

Ступени 2 и 3 детекта (M3), санитайзер и гейт агента (M5), фиды и подпись
(M7), любые сетевые источники кроме заглушки обновления, попап с очередью
(M6), воркер (M13). Скелет носит один детектор ступени 1 и одну поверхность —
ровно чтобы сквозной путь существовал и был защищён гейтами.
