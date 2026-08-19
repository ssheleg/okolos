/**
 * The walker every gate shares, checked against a directory built for the
 * purpose rather than against this repository.
 *
 * Reading the real tree would make these checks agree with whatever the tree
 * happens to hold today — and the defect this module exists to close was
 * precisely a gate whose verdict depended on which folders a person had opened
 * in Finder. So the fixtures are made here: a directory with a directory, a
 * file, and a dotfile in it, which is the shape `readdirSync` cannot tell apart
 * and this module must.
 */

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'

import { directoriesIn, filesIn } from './tree.mjs'

let dir: string

beforeAll(() => {
  dir = mkdtempSync(path.join(tmpdir(), 'okolos-tree-'))
  mkdirSync(path.join(dir, 'ru'))
  mkdirSync(path.join(dir, 'en'))
  writeFileSync(path.join(dir, '.DS_Store'), 'Finder wrote this')
  writeFileSync(path.join(dir, 'notes.md'), '# not a directory')
  writeFileSync(path.join(dir, 'messages.json'), '{}')
})

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('directoriesIn', () => {
  it('names the directories and nothing else', () => {
    expect(directoriesIn(dir)).toEqual(['en', 'ru'])
  })

  it('excludes the dotfile that caused this module to exist', () => {
    // Named separately from the assertion above, because the general shape and
    // this specific entry are two different claims: a filter keyed on a leading
    // dot would satisfy one and not the other.
    expect(directoriesIn(dir)).not.toContain('.DS_Store')
  })

  it('differs from the raw read, so the filter is load-bearing', () => {
    // Without this, the two checks above would also pass against a `directoriesIn`
    // that did no filtering at all — on a fixture that happened to hold only
    // directories. The fixture holds three non-directories on purpose, and this
    // is what asserts the fixture is doing its job.
    const raw = ['.DS_Store', 'en', 'messages.json', 'notes.md', 'ru']
    expect(directoriesIn(dir)).not.toEqual(raw)
    expect(raw.length - directoriesIn(dir).length).toBe(3)
  })

  it('sorts, so a gate quoting a count cannot also depend on read order', () => {
    expect(directoriesIn(dir)).toEqual([...directoriesIn(dir)].sort())
  })
})

describe('filesIn', () => {
  it('keeps only files whose name ends with the suffix', () => {
    expect(filesIn(dir, '.json')).toEqual(['messages.json'])
  })

  it('excludes directories even when the suffix would match', () => {
    mkdirSync(path.join(dir, 'looks.json'))
    try {
      expect(filesIn(dir, '.json')).toEqual(['messages.json'])
    } finally {
      rmSync(path.join(dir, 'looks.json'), { recursive: true })
    }
  })

  it('a suffix nothing matches returns empty rather than everything', () => {
    // The failure mode worth pinning: a suffix check written as a truthiness
    // test would return the whole listing here.
    expect(filesIn(dir, '.nope')).toEqual([])
  })
})
