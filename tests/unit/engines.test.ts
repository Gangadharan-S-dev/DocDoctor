import { describe, expect, it } from 'vitest'
import { parseRanges } from '../../src/processing/pdf'
import { joinOcrPages } from '../../src/processing/ocr'
import { validateFiles } from '../../src/lib/files'
import { toolById } from '../../src/data/tools'

describe('parseRanges', () => {
  it('parses single pages and ranges, sorted and deduped', () => {
    expect(parseRanges('3, 1-2, 2', 5)).toEqual([0, 1, 2])
  })
  it('clamps out-of-range pages', () => {
    expect(parseRanges('1-99', 3)).toEqual([0, 1, 2])
  })
  it('rejects garbage and empty selections', () => {
    expect(() => parseRanges('x', 3)).toThrow(/Invalid page range/)
    expect(() => parseRanges('9', 3)).toThrow(/No valid pages/)
  })
})

describe('joinOcrPages', () => {
  it('joins trimmed pages with blank lines and drops empties', () => {
    expect(joinOcrPages(['  hello ', '', 'world '])).toBe('hello\n\nworld')
  })
})

describe('validateFiles', () => {
  const tool = toolById('merge-pdf')!
  it('accepts matching files within limits', () => {
    const f = new File(['%PDF'], 'a.pdf', { type: 'application/pdf' })
    expect(validateFiles([f], tool, 0)).toEqual({ ok: [f], errors: [] })
  })
  it('rejects wrong extensions and empty files', () => {
    const bad = new File(['x'], 'a.txt', { type: 'text/plain' })
    const empty = new File([], 'b.pdf', { type: 'application/pdf' })
    const { ok, errors } = validateFiles([bad, empty], tool, 0)
    expect(ok).toEqual([])
    expect(errors).toHaveLength(2)
  })
  it('single-file tools ignore extra files with an error', () => {
    const single = toolById('compress-pdf')!
    const a = new File(['%PDF'], 'a.pdf', { type: 'application/pdf' })
    const b = new File(['%PDF'], 'b.pdf', { type: 'application/pdf' })
    const { ok, errors } = validateFiles([a, b], single, 0)
    expect(ok).toEqual([a])
    expect(errors.some((e) => /one file at a time/.test(e))).toBe(true)
  })
})
