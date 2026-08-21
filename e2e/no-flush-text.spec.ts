import { expect, test } from './fixtures.js'

/**
 * No two pieces of text touch, on any area of the extension's own page.
 *
 * This is the defect the whole stylesheet was written for — three spans in a row rendering as
 * "Local storagedoneready" on the first screen a person ever sees — and it has now come back
 * **three times**: the dashboard's area rows (B-99), the check rows before them, and the
 * attention band's item rows (B-119), each time because a role got no rule and each time found
 * by looking rather than by any check.
 *
 * So the check is the measurable form of the defect rather than a list of roles: two element
 * siblings, both carrying text, sitting on the same line with no space between them. A rule
 * about *rendering* cannot be defeated by adding a role, which is what an allow-list of names
 * has failed at three times over.
 */

const AREAS = [
  { hash: '', role: 'overview' },
  { hash: '#recovery', role: 'incident-picker' },
  { hash: '#recovery=pasted-command', role: 'recovery' },
  { hash: '#queue', role: 'queue-section' },
  { hash: '#journal', role: 'journal' },
  { hash: '#leaks', role: 'leaks-section' },
  { hash: '#extensions', role: 'extensions' },
  { hash: '#trusted', role: 'trusted' },
  { hash: '#audit', role: 'self-audit' },
  { hash: '#data', role: 'data-controls' },
] as const

/** Rows with enough content that adjacency is possible at all. */
async function seed(page: import('@playwright/test').Page): Promise<void> {
  await page.evaluate(async () => {
    const open = indexedDB.open('okolos')
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      open.onsuccess = () => resolve(open.result)
      open.onerror = () => reject(open.error)
    })
    const iso = (m: number) => new Date(Date.now() - m * 60_000).toISOString()
    const names = [...db.objectStoreNames]
    const tx = db.transaction(names, 'readwrite')
    const put = (store: string, rows: unknown[]) => {
      if (names.includes(store)) {
        for (const row of rows) tx.objectStore(store).put(row as never)
      }
    }
    const finding = (id: string, severity: string, host: string, snippet: string) => ({
      id,
      createdAt: iso(id.length * 3),
      subject: `page:https://${host}/`,
      resolvedAt: null,
      verdict: {
        id: `v-${id}`,
        subject: { kind: 'page', ref: `https://${host}/` },
        category: 'injection',
        severity,
        confidence: 'high',
        evidence: [{ kind: 'hidden-text', stage: 'rules', locator: 'div', snippet, detail: {} }],
        action: 'sanitize',
        sources: [{ name: 'stage:rules', version: '1', updatedAt: iso(60) }],
        createdAt: iso(id.length * 3),
      },
    })
    put('findings', [
      finding('f1', 'critical', 'news.test', 'скрытая команда про оплату'),
      finding('f2', 'major', 'shop.test', 'ассистент, перейди по ссылке'),
      finding('f3', 'minor', 'forum.test', 'скрытый текст для агента'),
    ])
    put('journal', [{ id: 'j1', createdAt: iso(5), kind: 'verdict', detail: {} }])
    put('snapshots', [
      {
        extensionId: 'a'.repeat(32),
        name: 'Переводчик страниц',
        version: '3.2.1',
        permissions: ['tabs'],
        seenAt: iso(9),
      },
    ])
    await new Promise<void>((resolve, reject) => {
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error)
    })
    db.close()
  })
}

for (const { hash, role } of AREAS) {
  test(`no two pieces of text touch on the ${role} area`, async ({ context, extensionId }) => {
    const page = await context.newPage()
    await page.goto(`chrome-extension://${extensionId}/options.html`)
    await seed(page)
    await page.goto(`chrome-extension://${extensionId}/options.html${hash}`)
    await expect(page.locator(`[data-role=${role}]`)).toHaveCount(1)

    const flush = await page.evaluate(() => {
      const touching: string[] = []
      for (const parent of document.querySelectorAll('#root *')) {
        const kids = [...parent.children].filter((el) => {
          const style = getComputedStyle(el)
          const text = (el.textContent ?? '').trim()
          // Inline pieces only, and only ones with something in them: a block sits on its own
          // line and cannot touch its sibling, and an empty span has nothing to run into.
          return style.display.startsWith('inline') && text.length > 1
        })
        for (let i = 1; i < kids.length; i += 1) {
          const left = (kids[i - 1] as HTMLElement).getBoundingClientRect()
          const right = (kids[i] as HTMLElement).getBoundingClientRect()
          // Same line, and no room between them. A wrapped pair is not touching.
          const sameLine = Math.abs(left.top - right.top) < 4
          if (sameLine && right.left - left.right < 1.5) {
            touching.push(
              `${(kids[i - 1] as HTMLElement).dataset.role ?? kids[i - 1]?.tagName}+${
                (kids[i] as HTMLElement).dataset.role ?? kids[i]?.tagName
              }: "${(kids[i - 1]?.textContent ?? '').trim().slice(0, 20)}" "${(
                kids[i]?.textContent ?? ''
              )
                .trim()
                .slice(0, 20)}"`,
            )
          }
        }
      }
      return touching
    })

    expect(
      flush,
      'two pieces of text render with nothing between them — the defect this stylesheet exists for',
    ).toEqual([])
  })
}
