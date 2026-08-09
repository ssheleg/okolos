/**
 * Every route this backend has, and what each one is allowed to know.
 *
 * The rules are the same everywhere: no cookies are set, no identifiers are
 * read, nothing about a request is stored except what an appeal explicitly
 * contains. A domain lookup is answered and forgotten.
 */
import { displayFeedNameEn, isOurFeed, OUR_FEEDS } from '@okolos/core-feeds'

import { PRIVACY_HTML } from './privacy.generated.js'

export interface Env {
  readonly DB: D1Like
  /** Base URL where signed feed files are published. */
  readonly FEEDS_BASE?: string
}

export interface D1Like {
  prepare(sql: string): {
    bind(...values: unknown[]): {
      run(): Promise<unknown>
      first<T = unknown>(): Promise<T | null>
      all<T = unknown>(): Promise<{ results: T[] }>
    }
  }
}

const HTML_HEADERS = {
  'content-type': 'text/html; charset=utf-8',
  'cache-control': 'public, max-age=300',
}

const JSON_HEADERS = {
  'content-type': 'application/json; charset=utf-8',
  // Nothing here is cacheable per-user because nothing here is per-user.
  'cache-control': 'public, max-age=300',
  'access-control-allow-origin': '*',
}

export async function handle(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url)

  if (request.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: { ...JSON_HEADERS, 'access-control-allow-headers': 'content-type' },
    })
  }

  // HEAD is a GET without a body, and the platform strips the body itself.
  // Testing for GET alone sent every crawler, link checker and monitor to the
  // 404 — on the surface whose whole purpose is being found and quoted.
  const readOnly = request.method === 'GET' || request.method === 'HEAD'

  if (url.pathname === '/status/domain' && readOnly) {
    return domainStatus(url.searchParams.get('domain'), env)
  }

  if (url.pathname === '/appeal' && request.method === 'POST') {
    return appeal(request, env)
  }

  if (url.pathname.startsWith('/feeds/') && readOnly) {
    return servePublishedFeed(url.pathname.slice('/feeds/'.length), env)
  }

  if (url.pathname === '/status' && readOnly) {
    return statusPage(url, env)
  }

  // A stable address, because a store listing links to it and a person
  // deciding about the permissions has not installed anything yet.
  if (url.pathname === '/' && readOnly) {
    return landingPage(url)
  }

  if (url.pathname === '/privacy' && readOnly) {
    return privacyPage()
  }

  if (url.pathname === '/healthz') {
    return json({ ok: true })
  }

  return json({ error: 'not found' }, 404)
}

/** Escapes text for HTML. The domain arrives in a query string. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

/**
 * The public status page, rendered here with the answer already in it.
 *
 * A page assembled by a script says nothing to the second reader every public
 * page has — a crawler, or anything quoting it — and the answer to "is this
 * domain listed" is exactly the kind of thing that gets quoted. So it is
 * served whole, and needs no JavaScript to be read.
 *
 * One question, one address: `/status?domain=x`, with a canonical link to the
 * normalised form so `Evil.TEST.` and `evil.test` do not become two pages.
 */
/** Names this service publishes. Anything else is a 404, not a database query. */
/**
 * The feeds this service publishes and can therefore lift a listing from.
 *
 * Used for two decisions that must not disagree: which feed name `/feeds/:name`
 * will serve, and whether an appeal is ours to act on. Ownership used to be
 * `feed.startsWith('okolos')` — a naming convention standing in for a
 * permission check, and one that was already wrong: the only feed actually
 * published is called `phishing`, so every listing we can lift was being sent
 * to a third party that has never heard of it.
 */
const PUBLISHED_FEEDS = new Set(Object.keys(OUR_FEEDS))

/**
 * Serves a published feed exactly as it was published.
 *
 * The extension verifies it against a key compiled into its build, so anything
 * this worker changed on the way out would fail verification — which is the
 * point. It never signs and never assembles: the private half of the key is
 * not here.
 *
 * A feed that has not been published is a 404, not an empty snapshot. An empty
 * one would be a signed claim that nothing is dangerous, and the extension
 * would install zero rules believing that was the answer.
 */
async function servePublishedFeed(name: string, env: Env): Promise<Response> {
  if (!PUBLISHED_FEEDS.has(name)) return json({ error: 'not found' }, 404)

  let row: { body: string; updated_at: string } | null
  try {
    row = await env.DB.prepare('SELECT body, updated_at FROM feeds WHERE name = ?')
      .bind(name)
      .first<{ body: string; updated_at: string }>()
  } catch {
    return json({ error: 'the feed could not be read' }, 503)
  }

  if (!row) return json({ error: 'no feed has been published under that name' }, 404)

  return new Response(row.body, {
    status: 200,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      // Short: a blocking feed that is an hour stale is a phishing site that
      // stayed up an hour longer.
      'cache-control': 'public, max-age=900',
      'last-modified': new Date(row.updated_at).toUTCString(),
    },
  })
}

/**
 * The privacy policy, served whole and without a script.
 *
 * Generated from `docs/privacy.md` so the document a reader sees and the one the
 * repository keeps cannot drift; a test compares the committed markup with what
 * the generator produces.
 */
function privacyPage(): Response {
  return new Response(
    `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Приватность — Okolos</title>
<meta name="description" content="Что Okolos отправляет с устройства, что не отправляет, и сколько хранит.">
</head>
<body>
<main>
${PRIVACY_HTML}
</main>
</body>
</html>`,
    { status: 200, headers: HTML_HEADERS },
  )
}

/**
 * The page a stranger lands on, written for two readers at once.
 *
 * A person arrives asking what this is and whether it can be trusted. A crawler
 * or an assistant arrives to quote it, and can only quote what is in the markup
 * — so every claim is a sentence in the HTML rather than something a script
 * fills in, there is no script at all, and the structured block below says the
 * same things in the form a machine reads.
 *
 * Every claim here is one this project can prove: they come from
 * `docs/brand/facts.md`, where each row carries the file, command or measured
 * number behind it. Two of the four sections are about what the product does
 * **not** do, which is not modesty — a security tool that lists only its
 * powers is describing a product nobody can check.
 */
function landingPage(url: URL): Response {
  const origin = url.origin
  const structured = {
    '@context': 'https://schema.org',
    '@type': 'SoftwareApplication',
    name: 'Okolos',
    applicationCategory: 'BrowserApplication',
    operatingSystem: 'Chrome, Edge, Firefox',
    description:
      'Расширение против инструкций, спрятанных на странице для ИИ-ассистента, а не для человека. Работает на устройстве.',
    license: 'https://www.gnu.org/licenses/agpl-3.0.html',
    isAccessibleForFree: true,
    url: origin,
  }

  return new Response(
    `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Okolos — защита от скрытых инструкций для ассистента</title>
<meta name="description" content="Находит на странице текст, спрятанный от человека, но видимый ИИ-ассистенту, и обезвреживает его до того, как ассистент прочтёт. Работает на устройстве, история браузинга никуда не уходит.">
<link rel="canonical" href="${escapeHtml(origin)}/">
<script type="application/ld+json">${JSON.stringify(structured)}</script>
</head>
<body>
<main>
<h1>Okolos — защита от скрытых инструкций</h1>

<p data-role="lede">На странице бывает текст, который человек не видит, а
ассистент читает и исполняет. Okolos находит такой текст, обезвреживает его до
того, как ассистент до него доберётся, и умеет вернуть страницу как было.</p>

<h2 id="what">Что он делает</h2>
<ul data-role="does">
<li>Находит текст, скрытый от человека и видимый ассистенту.</li>
<li>Обезвреживает найденное, не ломая страницу, и возвращает как было.</li>
<li>Держит действие агента до решения человека — переходы и отправку форм.</li>
<li>Блокирует страницы по подписанному списку <strong>до</strong> их загрузки.</li>
<li>Предупреждает о доменах-двойниках, включая кириллические подмены.</li>
<li>Судит о загрузках и не выдаёт непроверенное за проверенное.</li>
<li>Следит за изменениями в установленных расширениях.</li>
<li>Проверяет утечки по адресу почты и пароли по префиксу хеша.</li>
<li>Ведёт восстановление после инцидента по шагам.</li>
</ul>

<h2 id="does-not">Чего он не делает</h2>
<p>Это не оговорки мелким шрифтом, а часть обещания.</p>
<ul data-role="does-not">
<li>Не отправляет историю браузинга. Страницы проверяются на устройстве по
списку, скачанному целиком.</li>
<li>Не считает «заблокированные угрозы» и не рисует уровень защиты.</li>
<li>Не хранит события дольше 90 дней.</li>
<li>Не удерживает действие, у которого нет формы и навигации — но
<strong>записывает</strong> такие запросы, пока находка на странице не разобрана.</li>
<li>Не опознаёт агента, который снял флаг автоматизации.</li>
<li>Не выпускает третью ступень на модели: она принимает подписи для
скринридеров за инструкции.</li>
</ul>

<h2 id="trust">Почему этому можно верить</h2>
<p>Не потому, что мы так говорим. Каждый запрос наружу
<strong>записывается в журнал до того, как уйти</strong>, и если запись не
удалась — запрос отменяется. Журнал целиком виден на экране «Что ушло с этого
устройства», выгружается одним файлом и стирается целиком.</p>
<p>Исходный код открыт под AGPL-3.0, включая код сервиса: у размещённой копии
нет способа отличаться от опубликованной.</p>

<h2 id="pages">Что ещё здесь есть</h2>
<ul data-role="pages">
<li><a href="/privacy">Приватность</a> — что уходит с устройства, что не уходит и
сколько хранится. Полный список назначений, без исключений.</li>
<li><a href="/status">Статус домена</a> — для владельца сайта: числится ли домен
в списке, в каком именно и с какой даты. Там же подаётся апелляция.</li>
</ul>
</main>
</body>
</html>`,
    { status: 200, headers: HTML_HEADERS },
  )
}

async function statusPage(url: URL, env: Env): Promise<Response> {
  const raw = url.searchParams.get('domain')
  const domain = normaliseDomain(raw)

  const shell = (title: string, body: string, canonical?: string): Response =>
    new Response(
      `<!doctype html>
<html lang="ru">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<meta name="description" content="${escapeHtml(title)}">
${canonical ? `<link rel="canonical" href="${escapeHtml(canonical)}">` : ''}
</head>
<body>
<main>
<h1 data-role="title">Статус домена</h1>
${body}
<form method="get" action="/status" data-role="lookup">
<label for="domain">Домен для проверки</label>
<input id="domain" name="domain" data-role="domain" type="text" placeholder="example.com" value="${escapeHtml(domain ?? '')}">
<button type="submit" data-role="check">Проверить</button>
</form>
</main>
</body>
</html>`,
      { status: 200, headers: HTML_HEADERS },
    )

  if (!domain) {
    return shell(
      'Статус домена — введите домен',
      '<p data-role="hint">Введите домен, чтобы узнать, числится ли он в списке и в каком именно.</p>',
    )
  }

  const canonical = `${url.origin}/status?domain=${encodeURIComponent(domain)}`

  let row: { feed: string; entry_date: string } | null
  try {
    row = await env.DB.prepare('SELECT feed, entry_date FROM listings WHERE domain = ?')
      .bind(domain)
      .first<{ feed: string; entry_date: string }>()
  } catch {
    // Never "clean" when the answer could not be looked up — the same rule the
    // JSON endpoint holds, and for the same reason.
    return shell(
      `Статус домена — ${domain}`,
      `<p data-role="error">Статус <strong>${escapeHtml(domain)}</strong> сейчас не удалось выяснить. Это не утверждение, что домен чист.</p>`,
      canonical,
    )
  }

  if (!row) {
    return shell(
      `${domain} — не числится`,
      `<p data-role="verdict"><strong>${escapeHtml(domain)}</strong> <strong>не числится</strong> ни в одном списке, который несёт этот сервис.</p>`,
      canonical,
    )
  }

  const ours = isOurFeed(row.feed)
  // The list's name, never its identifier. This page is the one a site owner
  // reads when their domain has been blocked, and `phishing` is a database key
  // dressed up as a reason.
  const named = escapeHtml(displayFeedNameEn(row.feed) ?? row.feed)
  return shell(
    `${domain} — числится`,
    `<p data-role="verdict"><strong>${escapeHtml(domain)}</strong> <strong>числится</strong> в списке <strong>${named}</strong>, запись от ${escapeHtml(row.entry_date)}.</p>` +
      (ours
        ? appealForm(domain)
        : `<p data-role="upstream">Эта запись принадлежит списку ${named}, а не нам. Снять её может только их процедура апелляции; мы следуем их данным.</p>`),
    canonical,
  )
}

/**
 * The appeal, as a plain form.
 *
 * Only for listings we can actually lift: a form against someone else's feed
 * collects a plea nobody reads, and costs the owner the day they should have
 * spent writing to the party that can help.
 *
 * No script, because the owner reading this arrived from an interstitial on a
 * site that is down and has no reason to trust another page's JavaScript — and
 * because a form that needs JS is a form that fails silently when it does not
 * load.
 */
function appealForm(domain: string): string {
  return `<form method="post" action="/appeal" data-role="appeal">
<h2>Оспорить запись</h2>
<input type="hidden" name="domain" value="${escapeHtml(domain)}">
<label for="contact">Как с вами связаться</label>
<input id="contact" name="contact" data-role="contact" type="text" maxlength="200" placeholder="you@${escapeHtml(domain)}">
<label for="message">Что изменилось</label>
<textarea id="message" name="message" data-role="message" maxlength="2000" rows="4"></textarea>
<button type="submit" data-role="send-appeal">Отправить апелляцию</button>
</form>`
}

async function domainStatus(domain: string | null, env: Env): Promise<Response> {
  const normalised = normaliseDomain(domain)
  if (!normalised) return json({ error: 'a domain is required' }, 400)

  let row: { feed: string; entry_date: string } | null
  try {
    row = await env.DB.prepare('SELECT feed, entry_date FROM listings WHERE domain = ?')
      .bind(normalised)
      .first<{ feed: string; entry_date: string }>()
  } catch {
    // Never "clean" when the answer could not be looked up: an owner acting on
    // that would waste a day discovering it was wrong.
    return json(
      { domain: normalised, status: 'unknown', detail: 'the status service could not be reached' },
      503,
    )
  }

  if (!row) {
    return json({ domain: normalised, status: 'not-listed', detail: 'nothing is recorded for this domain' })
  }

  return json({
    domain: normalised,
    status: 'listed',
    // The identifier stays: this is an API, and a caller keying off a display
    // name would break the first time the name is improved.
    feed: row.feed,
    /** The same list, as a person should read it. */
    feedName: displayFeedNameEn(row.feed),
    entryDate: row.entry_date,
    // Most listings are not ours, and saying so is the difference between an
    // owner fixing the problem and an owner arguing with the wrong party.
    appealTo: isOurFeed(row.feed) ? 'okolos' : row.feed,
  })
}

async function appeal(request: Request, env: Env): Promise<Response> {
  // A browser posting the form on /status and a client posting JSON are the
  // same appeal; only the wrapping differs. The owner gets a page back, because
  // a browser handed a JSON body renders it as text and the owner cannot tell
  // whether anything was recorded.
  const asForm = (request.headers.get('content-type') ?? '').includes(
    'application/x-www-form-urlencoded',
  )
  const reply = asForm ? appealPage : json

  let body: { domain?: unknown; contact?: unknown; message?: unknown }
  if (asForm) {
    const fields = new URLSearchParams(await request.text())
    body = {
      domain: fields.get('domain') ?? undefined,
      contact: fields.get('contact') ?? undefined,
      message: fields.get('message') ?? undefined,
    }
  } else {
    try {
      body = (await request.json()) as typeof body
    } catch {
      return json({ error: 'a JSON body is required' }, 400)
    }
  }

  const domain = normaliseDomain(typeof body.domain === 'string' ? body.domain : null)
  if (!domain) return reply({ error: 'a domain is required' }, 400)

  const message = typeof body.message === 'string' ? body.message.slice(0, 2000) : ''
  const contact = typeof body.contact === 'string' ? body.contact.slice(0, 200) : ''
  const reference = referenceFor(domain, message)

  try {
    await env.DB.prepare(
      'INSERT INTO appeals (reference, domain, contact, message, created_at) VALUES (?, ?, ?, ?, ?)',
    )
      .bind(reference, domain, contact, message, new Date().toISOString())
      .run()
  } catch (cause) {
    // The reference is a hash of the domain and the message, and it is the
    // primary key — so the same appeal sent twice is a key conflict, not a
    // failure. An owner who refreshed the page or clicked again was being told
    // nothing was saved, about an appeal that was already on file.
    if (isDuplicate(cause)) return reply({ reference, domain, alreadyFiled: true })
    return reply({ error: 'the appeal could not be recorded — nothing was saved' }, 503)
  }

  return reply({ reference, domain, alreadyFiled: false })
}

/**
 * The same outcome as the JSON body, rendered for the browser that submitted
 * the form. A reference appears only when a row exists to answer for it — an
 * owner quoting a reference for an appeal that was never saved is worse off
 * than one who was told plainly it failed.
 */
function appealPage(
  body: { reference?: string; domain?: string; alreadyFiled?: boolean; error?: string },
  status = 200,
): Response {
  const { reference, domain, alreadyFiled, error } = body
  const inner =
    error !== undefined
      ? `<p data-role="not-saved">${escapeHtml(error)}.</p><p>Nothing about this appeal is on file. Sending it again is safe.</p>`
      : alreadyFiled === true
        ? `<p data-role="already-filed">This appeal for <strong>${escapeHtml(domain ?? '')}</strong> was <strong>already on file</strong>. Its reference is <strong>${escapeHtml(reference ?? '')}</strong> — the same one, because it is the same appeal.</p>`
        : `<p data-role="reference">The appeal for <strong>${escapeHtml(domain ?? '')}</strong> is recorded. Its reference is <strong>${escapeHtml(reference ?? '')}</strong>.</p>`

  return new Response(
    `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Appeal — ${escapeHtml(domain ?? 'domain status')}</title>
<meta name="robots" content="noindex">
</head>
<body>
<main>
<h1 data-role="appeal-title">Appeal</h1>
${inner}
<p data-role="back"><a href="/status${domain !== undefined ? `?domain=${encodeURIComponent(domain)}` : ''}">Back to the domain status</a></p>
</main>
</body>
</html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } },
  )
}

/** A primary-key conflict, under whichever wording the driver gives it. */
function isDuplicate(cause: unknown): boolean {
  const message = String((cause as { message?: unknown } | null)?.message ?? cause)
  return /unique constraint|primary key|constraint failed/i.test(message)
}

/** Deterministic and short: an owner can quote it, and it identifies nobody. */
function referenceFor(domain: string, message: string): string {
  let hash = 0
  for (const char of `${domain}|${message}`) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  }
  return `OK-${hash.toString(36).toUpperCase().padStart(7, '0')}`
}

export function normaliseDomain(raw: string | null): string | null {
  if (!raw) return null
  const trimmed = raw.trim().toLowerCase().replace(/\.$/, '')
  if (trimmed === '') return null
  let hostname: string
  try {
    const url = new URL(trimmed.includes('://') ? trimmed : `https://${trimmed}`)
    hostname = url.hostname
  } catch {
    return null
  }
  return isPublicHost(hostname) ? hostname : null
}

/**
 * Whether this is a host the service can honestly answer about.
 *
 * `..` used to normalise to `.` and `../../etc/passwd` to `..`, and both were
 * stored as domains and answered about as domains. Parameterised SQL means it
 * was never an injection; it was nonsense in and nonsense out, and an appeal
 * filed for `.` is a row nobody can act on.
 *
 * A single label is refused for the same reason: this service is about sites
 * on the public internet, and `localhost` is not one. An address literal is
 * kept — a listing can legitimately be one.
 */
function isPublicHost(hostname: string): boolean {
  if (hostname === '') return false
  if (hostname.startsWith('[') && hostname.endsWith(']')) return true
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(hostname)) return true
  const labels = hostname.split('.')
  if (labels.length < 2) return false
  return labels.every((label) => /^[a-z0-9-]+$/.test(label))
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: JSON_HEADERS })
}
