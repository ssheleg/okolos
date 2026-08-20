/**
 * The store listing says only what the product can be shown to do.
 *
 * A listing is read by more people than any screen, by a reviewer who can
 * reject the upload, and by someone deciding whether to grant access to every
 * page they visit. It is also the easiest place in a project to write a
 * sentence nobody checks.
 */

import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { filesIn } from './tree.mjs'

import { statSync } from 'node:fs'

import { artefactStaleness } from './build-age.mjs'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const listing = readFileSync(path.join(root, 'docs/store/listing.md'), 'utf8')
const messages = JSON.parse(
  readFileSync(path.join(root, 'apps/extension/_locales/ru/messages.json'), 'utf8'),
) as Record<string, { message: string }>

/** Chrome Web Store rejects anything over these, at upload. */
const LIMITS = { name: 75, summary: 132, description: 16_000 }

describe('the listing fits where it has to go', () => {
  it('keeps the name inside the store limit', () => {
    expect(messages.appName?.message.length ?? 0).toBeLessThanOrEqual(LIMITS.name)
  })

  it('keeps both summaries inside the store limit, with room to edit one word', () => {
    // The first version was 131 of 132 characters — inside the limit and one
    // edit from being outside it, which is a limit met by accident.
    const summaries = [...listing.matchAll(/\*\*(?:ru|en):\*\* `([^`]{40,200})`/g)].map(
      (m) => m[1] as string,
    )
    expect(summaries.length, 'no summaries found — the extraction broke').toBeGreaterThanOrEqual(2)
    for (const summary of summaries) {
      expect(summary.length, `"${summary}"`).toBeLessThanOrEqual(LIMITS.summary - 10)
    }
  })

  it('keeps each full description inside the store limit', () => {
    const blocks = [...listing.matchAll(/```\n([\s\S]{200,}?)```/g)].map((m) => m[1] as string)
    expect(blocks.length, 'no description blocks found').toBeGreaterThanOrEqual(2)
    for (const block of blocks) expect(block.length).toBeLessThanOrEqual(LIMITS.description)
  })
})

/**
 * Only what ships: the fenced description blocks and the quoted summaries.
 *
 * The document around them names the words this listing must not use, which is
 * the right place for that note and the wrong text to search — the first
 * version of these checks read the whole file and failed on its own warnings.
 */
const shipped = [
  ...[...listing.matchAll(/```\n([\s\S]{200,}?)```/g)].map((m) => m[1] as string),
  ...[...listing.matchAll(/\*\*(?:ru|en):\*\* `([^`]+)`/g)].map((m) => m[1] as string),
].join('\n')

describe('the listing claims nothing the product cannot show', () => {
  it('uses none of the words the voice forbids', () => {
    // Not style. "Guaranteed" is a claim this product's own download verdict is
    // built to refuse: it never reports more than the checks that ran.
    for (const word of ['гарантирован', 'полностью защищ', '100%', 'guaranteed', 'fully protect']) {
      expect(shipped.toLowerCase(), `the copy says "${word}"`).not.toContain(word)
    }
  })

  it('does not use the sentence the product detects as a scam', () => {
    expect(shipped.toLowerCase()).not.toContain('ваш компьютер под угрозой')
  })

  it('points at the privacy policy that is actually served', () => {
    expect(listing).toContain('/privacy')
  })

  it('names the retention the schema enforces', () => {
    const schema = readFileSync(path.join(root, 'packages/storage/src/schema.ts'), 'utf8')
    const days = /journal:\s*(\d+)/.exec(schema)?.[1]
    expect(shipped).toContain(`${days} дней`)
  })

  it('does not advertise the stage that is not shipped', () => {
    // The third detection stage was closed by measurement, not built.
    for (const claim of ['нейросет', 'машинное обучение', 'AI-модель', 'machine learning']) {
      expect(shipped.toLowerCase()).not.toContain(claim.toLowerCase())
    }
  })
})

describe('the screenshots are of this product', () => {
  const dir = path.join(root, 'docs/store/screenshots')

  it('exist, and are the size the store requires', () => {
    expect(existsSync(dir), 'no screenshots directory').toBe(true)
    const shots = filesIn(dir, '.png')
    expect(shots.length, 'the store wants at least one').toBeGreaterThanOrEqual(1)
    for (const shot of shots) {
      const png = readFileSync(path.join(dir, shot))
      expect(png.subarray(1, 4).toString('latin1'), `${shot} is not a PNG`).toBe('PNG')
      expect({ w: png.readUInt32BE(16), h: png.readUInt32BE(20) }, shot).toEqual({ w: 1280, h: 800 })
    }
  })

  it('says they come from the built product rather than from a drawing', () => {
    /**
     * This assertion used to demand the listing admit the screenshots were not
     * submittable — the product had no visual layer and images of an unreadable
     * screen would have been the misleading part. That was fixed, so the
     * assertion would now pass on any sentence containing the word; it guards
     * what is worth guarding instead.
     *
     * A listing image showing a screen the extension does not draw is the same
     * defect as a document claiming a capability nobody built, and it is the
     * version a reviewer sees first.
     */
    expect(listing).toMatch(/pnpm screenshots/)
    expect(listing).toMatch(/настоящие\s+\n?экраны продукта, а не макеты/)
  })

  /**
   * Present is not current, and this is the third place that lesson has been learned.
   *
   * The images were twelve days old on 2026-08-21 — taken before the dashboard existed as a
   * screen, before the frame surfaces, before the copy moved to the catalogue. Two of the
   * four changed the moment they were retaken, and one of those showed a screen with **no
   * styling at all** and a raw ISO timestamp on it: the picture a store reviewer sees first.
   * "From the built product" was asserted; "from *this* build" was not.
   *
   * Compared against the surfaces they depict rather than against the whole tree: a change
   * to the feed pipeline does not restage a screenshot, and a gate that says it does is a
   * gate people learn to re-run without reading.
   */
  it('is not older than the surfaces it shows', () => {
    const shot = path.join(dir, '03-self-audit.png')
    const answer = artefactStaleness(shot, [
      path.join(root, 'packages/ui/src'),
      path.join(root, 'apps/extension/src/options'),
    ])
    // Narrowed rather than optional-chained: `Staleness` is a union on `known`, and
    // "could not tell" is a third answer this gate must not fold into "current".
    if (!answer.known) throw new Error(`could not tell: ${answer.reason}`)
    expect(
      answer.stale,
      `the surfaces moved after the screenshots were taken (newest: ${answer.newest.file}) — run \`pnpm screenshots\``,
    ).toBe(false)

    /**
     * The stylesheet, compared on its own rather than by widening the walk.
     *
     * `artefactStaleness` walks directories, and `pages.css` is one file inside the app's
     * source — passing it as a directory throws, which is how this assertion first failed.
     * Widening the walk to `apps/extension/src` would restage a screenshot whenever the
     * content script changed, and a gate that fires for unrelated reasons is one people
     * re-run without reading. The stylesheet earns its own line because this iteration
     * proved it decides what the picture looks like: the dashboard had no rule at all.
     */
    const css = statSync(path.join(root, 'apps/extension/src/pages.css')).mtimeMs
    expect(
      css <= statSync(shot).mtimeMs,
      'pages.css changed after the screenshots were taken — run `pnpm screenshots`',
    ).toBe(true)
  })
})
