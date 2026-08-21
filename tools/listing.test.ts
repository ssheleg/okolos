/**
 * The store listing says only what the product can be shown to do.
 *
 * A listing is read by more people than any screen, by a reviewer who can
 * reject the upload, and by someone deciding whether to grant access to every
 * page they visit. It is also the easiest place in a project to write a
 * sentence nobody checks.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { filesIn } from './tree.mjs'
import { SURFACES, surfacesDigest } from './surfaces.mjs'

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
   * Present is not current — and **mtime cannot answer it for a committed artefact.**
   *
   * The images were twelve days old on 2026-08-21: taken before the dashboard existed as a
   * screen, before the frame surfaces, before the copy moved to the catalogue. Two of the
   * four changed the moment they were retaken, and one showed a screen with no styling at
   * all and a raw ISO timestamp on it — the picture a store reviewer sees first. "From the
   * built product" was asserted; "from *this* build" was not.
   *
   * The first version of this check compared file mtimes and **went red on CI within the
   * hour**, naming a file edited in the same commit. A fresh checkout writes every file at
   * once, so which one is "newest" there is arbitrary. `buildTooOld` gets away with mtimes
   * because a build is produced during the run; a screenshot is committed, and the only
   * durable record of when it was retaken is the history.
   *
   * So: the last commit touching the screenshots must not be older than the last commit
   * touching the surfaces they show. Equal is the healthy case — retaken in the same change.
   * Compared against those surfaces rather than the whole tree, because a change to the feed
   * pipeline does not restage a picture, and a gate that fires for unrelated reasons is one
   * people re-run without reading.
   */
  /**
   * Content, not commit dates.
   *
   * The first version of this compared the last commit touching the screenshots against
   * the last touching the surfaces. On the first commit that actually exercised it, the
   * rule turned out to be able to demand the impossible: a surface change that alters no
   * pixel leaves the four images byte-identical, git records nothing, and no commit can
   * satisfy the comparison — the only way out is to fake a change to an image, which is
   * exactly the dishonesty this file exists to prevent.
   *
   * `pnpm screenshots` now writes `taken-at.json` beside the images, carrying a digest of
   * the surfaces it rendered. The claim checked here is the true one — these images were
   * taken from this code — and it needs no repository history, so it also survives the
   * shallow clone CI makes by default.
   */
  const receiptPath = path.join(root, 'docs/store/screenshots/taken-at.json')

  it('was taken from the code that is here now', () => {
    expect(existsSync(receiptPath), 'no taken-at.json — run `pnpm screenshots`').toBe(true)
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8')) as {
      surfaces: string[]
      surfacesDigest: string
      images: Record<string, string>
    }
    expect(receipt.surfaces, 'the receipt names other surfaces than the tool does').toEqual(SURFACES)
    expect(
      receipt.surfacesDigest,
      'a surface changed since the screenshots were taken — run `pnpm screenshots` and commit them',
    ).toBe(surfacesDigest(root))
  })

  it('is named for the screen it shows', () => {
    /**
     * The name is a claim, and it was false for two weeks: `03-self-audit.png` showed the
     * **overview** — the shot opened `options.html` with no hash — while the listing's own
     * table said the file shows SCR-10, "журнал отправок целиком", and its prose sold that
     * screen above the table. A reviewer comparing caption to image sees that first (B-109).
     *
     * `pnpm screenshots` records the `data-role` each page turned out to render, and refuses
     * to write a file whose named screen is not on it. This is the committed half of the same
     * rule: the file name has to say what the receipt says was there.
     */
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8')) as {
      shown?: Record<string, string>
    }
    const shown = receipt.shown ?? {}
    expect(Object.keys(shown).length, 'the receipt records no screen for any image').toBeGreaterThan(
      0,
    )
    const wrong = Object.entries(shown).filter(([file, role]) => !file.includes(role))
    expect(
      wrong,
      'rename the file or point the shot at the screen its name promises — a caption a reviewer can check against the image is the first thing they check',
    ).toEqual([])
  })

  it('names every image that is there, with the bytes it wrote', () => {
    const receipt = JSON.parse(readFileSync(receiptPath, 'utf8')) as {
      images: Record<string, string>
    }
    const onDisk = filesIn(path.join(root, 'docs/store/screenshots'), '.png')
    expect(Object.keys(receipt.images), 'the receipt and the directory disagree').toEqual(onDisk)
    const hashed = Object.fromEntries(
      onDisk.map((name) => [
        name,
        createHash('sha256')
          .update(readFileSync(path.join(root, 'docs/store/screenshots', name)))
          .digest('hex')
          .slice(0, 16),
      ]),
    )
    // A hand-edited image is the one way a listing can show something the product does not
    // draw while every other check in this file passes.
    expect(hashed, 'an image on disk is not the one the run wrote').toEqual(receipt.images)
  })
})
