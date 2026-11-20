import { beforeEach, describe, expect, it } from 'vitest'
import { suggestToolsForFiles } from '../../src/lib/smartSuggest'
import { clearToolPreset, loadToolPreset, saveToolPreset } from '../../src/lib/toolPrefs'

describe('suggestToolsForFiles (multi-file batch detection)', () => {
  it('suggests Merge PDF and Compare PDFs for 2 PDFs', () => {
    const a = new File(['a'], 'a.pdf', { type: 'application/pdf' })
    const b = new File(['b'], 'b.pdf', { type: 'application/pdf' })
    const { tools, batchLabel } = suggestToolsForFiles([a, b])
    expect(tools[0]?.id).toBe('merge-pdf')
    expect(tools.some((t) => t.id === 'compare-pdf')).toBe(true)
    expect(batchLabel).toContain('2 PDFs')
  })

  it('suggests Image to PDF and Image Collage for multiple images', () => {
    const imgs = ['1.jpg', '2.png', '3.webp'].map((n) => new File(['x'], n, { type: 'image/jpeg' }))
    const { tools, batchLabel } = suggestToolsForFiles(imgs)
    expect(tools[0]?.id).toBe('image-to-pdf')
    expect(tools.some((t) => t.id === 'image-collage')).toBe(true)
    expect(batchLabel).toContain('3 images')
  })

  it('suggests Create ZIP for mixed file types', () => {
    const mixed = [
      new File(['a'], 'report.pdf', { type: 'application/pdf' }),
      new File(['b'], 'photo.png', { type: 'image/png' }),
    ]
    const { tools, batchLabel } = suggestToolsForFiles(mixed)
    expect(tools[0]?.id).toBe('zip-files')
    expect(batchLabel).toContain('mixed')
  })
})

describe('toolPrefs (per-tool preset memory)', () => {
  beforeEach(() => localStorage.clear())

  it('saves, loads, merges, and clears per-tool presets', () => {
    expect(loadToolPreset('compress-image')).toEqual({})
    saveToolPreset('compress-image', { quality: 85, format: 'image/webp' })
    expect(loadToolPreset('compress-image')).toEqual({ quality: 85, format: 'image/webp' })
    saveToolPreset('compress-image', { quality: 60 })
    expect(loadToolPreset('compress-image')).toEqual({ quality: 60, format: 'image/webp' })
    clearToolPreset('compress-image')
    expect(loadToolPreset('compress-image')).toEqual({})
  })

  it('survives corrupt JSON in localStorage', () => {
    localStorage.setItem('docdoctor:tool-prefs:v1', '{broken')
    expect(loadToolPreset('compress-pdf')).toEqual({})
  })
})
