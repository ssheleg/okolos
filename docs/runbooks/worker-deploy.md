# Деплой прокси-воркера — раннбук

Один скрипт делает всё, что раньше было списком «сделай руками»:

```bash
node tools/deploy-worker.mjs             # рендер конфига → схема → деплой → смоук
node tools/deploy-worker.mjs --dry-run   # всё, кроме трёх изменяющих шагов
```

Идемпотентен: схема — `CREATE TABLE IF NOT EXISTS`, деплой перезаписывает
скрипт, смоук ничего не пишет. Повторный запуск безопасен и это проверено тем,
что каждый шаг так устроен, а не тем, что так решили.

## Что нужно в окружении

Скрипт читает `~/.okolos/cloudflare.env` (режим `0600`, вне репозиториев) или
переменные окружения — что найдёт первым:

| Переменная | Что это |
|---|---|
| `CLOUDFLARE_API_TOKEN` | account-scoped токен с Workers Scripts:Edit и D1:Edit |
| `CLOUDFLARE_ACCOUNT_ID` | id аккаунта, 32 hex-символа |
| `OKOLOS_D1_ID` | uuid базы D1 `okolos` |
| `OKOLOS_WORKER_URL` | необязательно; если не задана, URL берётся из `wrangler deployments list` |

Env-файл **читается парсером, а не `source`** — команда, случайно попавшая в
файл с кредами, не выполнится.

**Про account-scoped токены:** `cfat_…` не проходит `GET /user/tokens/verify`
— это user-level эндпоинт, и токену аккаунта туда нельзя. Проверять токен надо
через `GET /accounts/{id}`. Первая проверка этого проекта дала «Invalid API
Token» на рабочем токене именно по этой причине.

## Почему конфиг генерируется

`apps/proxy/wrangler.toml` в репозитории намеренно держит
`database_id = "set-at-deploy"`. Id принадлежит одному аккаунту; репозиторий,
который его зашивает, деплоит в этот аккаунт из любого клона.
`tools/deploy-config.mjs` подставляет id в сгенерированный
`wrangler.generated.toml` — он в `.gitignore`, и `tools/deploy-config.test.ts`
следит, что в шаблоне не появился настоящий uuid.

## Что проверяет смоук

- `/healthz` отвечает 200;
- `/status/domain?domain=…` для неперечисленного домена отвечает
  `listed: false`, а не 404, который вызывающему пришлось бы истолковывать;
- ответ не содержит `no such table` / `D1_ERROR` — то есть биндинг живой и
  схема действительно накатана. Без этой третьей проверки первые две прошли бы
  на воркере с пустой базой.

## Создать D1 с нуля (один раз на аккаунт)

```bash
cd apps/proxy && npx wrangler d1 create okolos
```

Напечатанный `database_id` — в `~/.okolos/cloudflare.env` как `OKOLOS_D1_ID`.

## Гейт песочницы

Harness Claude Code блокирует изменяющие прод команды (`wrangler deploy`,
`d1 execute --remote`, POST в API Cloudflare) — и это правильно. Чтобы агент
доводил деплой автономно, нужно либо точечное Bash-permission-правило на
`node tools/deploy-worker.mjs`, либо запуск этой команды человеком через `!`.
