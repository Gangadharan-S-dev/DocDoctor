import { describe, expect, it } from 'vitest'
import { PDFDocument, PDFName, PDFRawStream, PDFArray } from 'pdf-lib'
import { inflateSync } from 'node:zlib'
import { OCR_LANGUAGES, normalizeOcrLang } from '../../src/processing/ocr-languages'
import { buildSearchablePdf, flattenOcrWords } from '../../src/processing/ocr'

/** Decode a page's content stream(s) to text (pdf-lib writes may be flate-coded). */
function contentStreamText(doc: PDFDocument): string {
  const contents = doc.getPage(0).node.get(PDFName.of('Contents'))
  const streams = contents instanceof PDFArray
    ? contents.asArray().map((o) => doc.context.lookup(o))
    : [doc.context.lookup(contents as never)]
  let out = ''
  for (const s of streams) {
    if (!(s instanceof PDFRawStream)) continue
    const raw = Buffer.from(s.getContents())
    let text = raw.toString('latin1')
    try { text = inflateSync(raw).toString('latin1') } catch { /* not flate-coded */ }
    out += text
  }
  return out
}

// 1x1 transparent PNG.
const PNG_1X1 = new Uint8Array(
  Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64'),
)

describe('OCR languages', () => {
  it('offers English, Spanish and Hindi among 10+ languages', () => {
    const codes = OCR_LANGUAGES.map((l) => l.code)
    expect(codes).toContain('eng')
    expect(codes).toContain('spa')
    expect(codes).toContain('hin')
    expect(codes.length).toBeGreaterThanOrEqual(10)
  })
  it('normalizes known codes and rejects unknown ones', () => {
    expect(normalizeOcrLang('spa')).toBe('spa')
    expect(normalizeOcrLang(' ENG ')).toBe('eng')
    expect(() => normalizeOcrLang('xxx')).toThrow(/Unsupported OCR language/)
    expect(() => normalizeOcrLang('')).toThrow(/Unsupported OCR language/)
  })
})

describe('flattenOcrWords', () => {
  it('flattens blocks→paragraphs→lines→words and drops empties', () => {
    const data = {
      blocks: [{
        paragraphs: [{
          lines: [{
            words: [
              { text: 'Hello', confidence: 90, bbox: { x0: 0, y0: 0, x1: 10, y1: 5 } },
              { text: ' ', confidence: 10, bbox: { x0: 10, y0: 0, x1: 11, y1: 5 } },
              { text: 'World', confidence: 80, bbox: { x0: 12, y0: 0, x1: 22, y1: 5 } },
            ],
          }],
        }],
      }],
    }
    const words = flattenOcrWords(data as never)
    expect(words.map((w) => w.text)).toEqual(['Hello', 'World'])
    expect(words[0].bbox).toEqual({ x0: 0, y0: 0, x1: 10, y1: 5 })
  })
  it('returns [] when blocks are missing', () => {
    expect(flattenOcrWords({ blocks: null } as never)).toEqual([])
    expect(flattenOcrWords({} as never)).toEqual([])
  })
})

describe('buildSearchablePdf', () => {
  it('embeds the page image with an extractable text layer', async () => {
    const bytes = await buildSearchablePdf([{
      image: PNG_1X1, kind: 'png', pageWidth: 200, pageHeight: 100,
      text: 'Hi there',
      words: [{ text: 'Hi', confidence: 95, bbox: { x0: 0, y0: 0, x1: 0.5, y1: 0.5 } }],
    }], 'Test OCR')
    expect(new TextDecoder('latin1').decode(bytes.slice(0, 4))).toBe('%PDF')
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(1)
    // 'Hi' in the content stream (literal or hex-encoded by the font).
    const stream = contentStreamText(doc)
    expect(stream.includes('(Hi)') || stream.includes('4869')).toBe(true)
  })
  it('skips words the built-in font cannot encode instead of throwing', async () => {
    const bytes = await buildSearchablePdf([{
      image: PNG_1X1, kind: 'png', pageWidth: 200, pageHeight: 100,
      text: 'नमस्ते',
      words: [{ text: 'नमस्ते', confidence: 90, bbox: { x0: 0, y0: 0, x1: 0.5, y1: 0.5 } }],
    }], 'Hindi OCR')
    const doc = await PDFDocument.load(bytes)
    expect(doc.getPageCount()).toBe(1)
  })
})
