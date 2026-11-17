import { describe, expect, it } from 'vitest'
import { parseRanges } from '../../src/processing/pdf'
import { joinOcrPages } from '../../src/processing/ocr'
import { validateFiles } from '../../src/lib/files'
import { toolById } from '../../src/data/tools'
import { computePerspectiveDimensions, computeUnitSquareToQuadHomography } from '../../src/processing/image'

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

describe('perspective crop homography', () => {
  it('maps unit square corners (0,0), (1,0), (1,1), (0,1) to exact quad vertices', () => {
    const p0 = { x: 120, y: 80 }
    const p1 = { x: 680, y: 110 }
    const p2 = { x: 740, y: 550 }
    const p3 = { x: 90, y: 520 }
    const H = computeUnitSquareToQuadHomography(p0, p1, p2, p3)!
    expect(H).not.toBeNull()

    const project = (u: number, v: number) => {
      const denom = H.g * u + H.h * v + 1
      return {
        x: (H.a * u + H.b * v + H.c) / denom,
        y: (H.d * u + H.e * v + H.f) / denom,
      }
    }

    expect(project(0, 0).x).toBeCloseTo(p0.x, 5)
    expect(project(0, 0).y).toBeCloseTo(p0.y, 5)
    expect(project(1, 0).x).toBeCloseTo(p1.x, 5)
    expect(project(1, 0).y).toBeCloseTo(p1.y, 5)
    expect(project(1, 1).x).toBeCloseTo(p2.x, 5)
    expect(project(1, 1).y).toBeCloseTo(p2.y, 5)
    expect(project(0, 1).x).toBeCloseTo(p3.x, 5)
    expect(project(0, 1).y).toBeCloseTo(p3.y, 5)
  })

  it('computes natural and aspect-locked output dimensions from perspective quad', () => {
    const quad = {
      tl: { x: 10, y: 20 },
      tr: { x: 90, y: 20 },
      br: { x: 90, y: 70 },
      bl: { x: 10, y: 70 },
    }
    const natural = computePerspectiveDimensions(1000, 800, quad, null)
    expect(natural.width).toBe(800)
    expect(natural.height).toBe(400)

    const square = computePerspectiveDimensions(1000, 800, quad, 1)
    expect(square.width).toBe(800)
    expect(square.height).toBe(800)
  })
})
