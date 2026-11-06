import { PDFDocument, StandardFonts } from 'pdf-lib'
import type { OutputFile } from './download'
import { stem } from './download'
import { pdfPageCount, renderPageJpeg, throwIfAborted, type ProcessOpts } from './pdf'
import { normalizeOcrLang } from './ocr-languages'

export { OCR_LANGUAGES, normalizeOcrLang } from './ocr-languages'
export type { OcrLanguage } from './ocr-languages'

/**
 * On-device OCR with Tesseract.js. The recognition engine runs in
 * Tesseract's own Web Worker. First use downloads the selected language
 * model (a few MB) from the Tesseract CDN and caches it in the browser;
 * the document itself never leaves the device.
 *
 * Outputs: plain text, a searchable PDF (page image + invisible text
 * layer), or both. The searchable layer uses the built-in Helvetica
 * font, so words in scripts it cannot encode (e.g. Devanagari, CJK)
 * are skipped in the PDF layer — their plain-text output is unaffected.
 */

export type OcrFormat = 'txt' | 'pdf' | 'both'

export interface OcrOpts extends ProcessOpts {
  /** Tesseract language code (see OCR_LANGUAGES). Default 'eng'. */
  lang?: string
  /** Which outputs to produce. Default 'txt'. */
  format?: OcrFormat
}

export interface OcrWord {
  text: string
  confidence?: number
  bbox: { x0: number; y0: number; x1: number; y1: number }
}

interface TessWord { text?: string; confidence?: number; bbox?: OcrWord['bbox'] }
interface TessData {
  blocks?: { paragraphs?: { lines?: { words?: TessWord[] }[] }[] }[] | null
}

/** Flatten Tesseract's blocks→paragraphs→lines→words into a word list. */
export function flattenOcrWords(data: TessData): OcrWord[] {
  const out: OcrWord[] = []
  for (const block of data?.blocks ?? []) {
    for (const para of block?.paragraphs ?? []) {
      for (const line of para?.lines ?? []) {
        for (const w of line?.words ?? []) {
          const text = (w.text ?? '').trim()
          if (!text || !w.bbox) continue
          out.push({ text, confidence: w.confidence, bbox: w.bbox })
        }
      }
    }
  }
  return out
}

export interface SearchablePage {
  /** Page image bytes (JPEG or PNG). */
  image: Uint8Array
  kind: 'jpg' | 'png'
  /** Page size in PDF points; the image is stretched to fill it. */
  pageWidth: number
  pageHeight: number
  /** Recognized words with bounding boxes in image pixels. */
  words: OcrWord[]
  /** Full recognized text (fallback layer when no word boxes exist). */
  text: string
}

/**
 * Build a searchable PDF: each page shows the scanned image with an
 * invisible (opacity 0) text layer positioned from the OCR word boxes,
 * so the result can be searched, selected and copied like a normal PDF.
 */
export async function buildSearchablePdf(pages: SearchablePage[], title: string): Promise<Uint8Array> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  for (const p of pages) {
    const img = p.kind === 'png' ? await doc.embedPng(p.image) : await doc.embedJpg(p.image)
    const page = doc.addPage([p.pageWidth, p.pageHeight])
    page.drawImage(img, { x: 0, y: 0, width: p.pageWidth, height: p.pageHeight })
    const sx = p.pageWidth / img.width
    const sy = p.pageHeight / img.height
    const drawWord = (text: string, x: number, y: number, size: number) => {
      try {
        page.drawText(text, { x, y, size, font, opacity: 0 })
      } catch { /* glyph outside the font's encoding: skip this word */ }
    }
    if (p.words.length) {
      for (const w of p.words) {
        const size = Math.min(100, Math.max(3, (w.bbox.y1 - w.bbox.y0) * sy * 0.9))
        const x = Math.min(Math.max(0, w.bbox.x0 * sx), p.pageWidth - 4)
        const y = Math.min(Math.max(0, p.pageHeight - w.bbox.y1 * sy), p.pageHeight - 4)
        drawWord(w.text, x, y, size)
      }
    } else if (p.text.trim()) {
      // No word boxes (older engine fallback): lay the text out invisibly
      // line by line so the page is at least searchable.
      let y = p.pageHeight - 48
      for (const line of p.text.split('\n')) {
        if (y < 36) break
        if (line.trim()) drawWord(line.trim().slice(0, 120), 36, y, 11)
        y -= 14
      }
    }
  }
  doc.setTitle(title)
  doc.setProducer('DocDoctor')
  doc.setCreator('DocDoctor')
  return doc.save({ useObjectStreams: true })
}

async function createOcrWorker(lang: string, signal?: AbortSignal) {
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker(lang, undefined, {
    logger: () => { /* progress is reported per page instead */ },
  })
  if (signal?.aborted) {
    await worker.terminate().catch(() => {})
    throw new DOMException('Processing cancelled.', 'AbortError')
  }
  return worker
}

export function joinOcrPages(pages: string[]): string {
  return pages.map((p) => p.trim()).filter(Boolean).join('\n\n')
}

const txtOut = (file: File, text: string): OutputFile =>
  ({ name: `${stem(file.name)}-ocr.txt`, blob: new Blob([text], { type: 'text/plain' }) })
const pdfOut = (file: File, bytes: Uint8Array): OutputFile =>
  ({ name: `${stem(file.name)}-searchable.pdf`, blob: new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' }) })

function pickOutputs(format: OcrFormat, file: File, text: string, pdfBytes: Uint8Array | null): OutputFile[] {
  const outs: OutputFile[] = []
  if (format === 'txt' || format === 'both') outs.push(txtOut(file, text))
  if (format === 'pdf' || format === 'both') {
    if (!pdfBytes) throw new Error('Could not build the searchable PDF for this file.')
    outs.push(pdfOut(file, pdfBytes))
  }
  return outs
}

export async function ocrPdf(file: File, opts: OcrOpts = {}): Promise<OutputFile[]> {
  const lang = normalizeOcrLang(opts.lang ?? 'eng')
  const format = opts.format ?? 'txt'
  const bytes = await file.arrayBuffer()
  const total = await pdfPageCount(bytes.slice(0))
  const worker = await createOcrWorker(lang, opts.signal)
  try {
    const texts: string[] = []
    const pages: SearchablePage[] = []
    for (let i = 1; i <= total; i++) {
      throwIfAborted(opts.signal)
      const rendered = await renderPageJpeg(bytes.slice(0), i, 2)
      const { data } = await worker.recognize(rendered.dataUrl, {}, { text: true, blocks: true })
      texts.push(data.text)
      pages.push({
        image: rendered.jpeg, kind: 'jpg',
        pageWidth: rendered.pageWidth, pageHeight: rendered.pageHeight,
        words: flattenOcrWords(data as TessData), text: data.text,
      })
      opts.onProgress?.(i, total)
    }
    const text = joinOcrPages(texts)
    if (!text) throw new Error('No text could be recognized in this PDF. It may be blank, handwritten, or too low-resolution.')
    const pdfBytes = format === 'txt' ? null : await buildSearchablePdf(pages, `${stem(file.name)} (OCR)`)
    return pickOutputs(format, file, text, pdfBytes)
  } finally {
    await worker.terminate().catch(() => {})
  }
}

export async function ocrImage(file: File, opts: OcrOpts = {}): Promise<OutputFile[]> {
  const lang = normalizeOcrLang(opts.lang ?? 'eng')
  const format = opts.format ?? 'txt'
  const worker = await createOcrWorker(lang, opts.signal)
  try {
    throwIfAborted(opts.signal)
    const { data } = await worker.recognize(file, {}, { text: true, blocks: true })
    opts.onProgress?.(1, 1)
    const text = data.text.trim()
    if (!text) throw new Error('No text could be recognized in this image. Try a sharper, higher-contrast image.')
    let pdfBytes: Uint8Array | null = null
    if (format !== 'txt') {
      // Rebuild the source image as a one-page searchable PDF.
      const bmp = await createImageBitmap(file)
      try {
        let image: Uint8Array
        let kind: 'jpg' | 'png'
        if (file.type === 'image/png' || file.type === 'image/jpeg') {
          image = new Uint8Array(await file.arrayBuffer())
          kind = file.type === 'image/png' ? 'png' : 'jpg'
        } else {
          const c = document.createElement('canvas')
          c.width = bmp.width; c.height = bmp.height
          c.getContext('2d')!.drawImage(bmp, 0, 0)
          const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Image encoding failed.'))), 'image/png'))
          image = new Uint8Array(await blob.arrayBuffer())
          kind = 'png'
        }
        pdfBytes = await buildSearchablePdf([{
          image, kind,
          pageWidth: bmp.width * 0.75, pageHeight: bmp.height * 0.75,
          words: flattenOcrWords(data as TessData), text: data.text,
        }], `${stem(file.name)} (OCR)`)
      } finally {
        bmp.close()
      }
    }
    return pickOutputs(format, file, text, pdfBytes)
  } finally {
    await worker.terminate().catch(() => {})
  }
}
