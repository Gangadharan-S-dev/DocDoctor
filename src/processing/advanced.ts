import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont } from 'pdf-lib'
import * as XLSX from 'xlsx'
import type { OutputFile } from './download'
import { stem } from './download'
import { extractTextPages, pdfToImages } from './pdf'
import { DOCX_TYPE, XLSX_TYPE, wordExtractText } from './office'

const pdfBlob = (bytes: Uint8Array) => new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' })

// ── Shared: flow plain text into a clean multi-page PDF ──────────
export async function textToPdf(text: string, title: string): Promise<Blob> {
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const W = 595.28, H = 841.89, M = 54
  const wrap = (line: string, f: PDFFont, size: number): string[] => {
    const max = W - M * 2
    const out: string[] = []
    let cur = ''
    for (const word of line.split(/\s+/)) {
      const next = cur ? cur + ' ' + word : word
      if (f.widthOfTextAtSize(next, size) > max && cur) { out.push(cur); cur = word }
      else cur = next
    }
    if (cur) out.push(cur)
    return out.length ? out : ['']
  }
  let page = doc.addPage([W, H])
  let y = H - M
  const newPage = () => { page = doc.addPage([W, H]); y = H - M }
  const lines = text.split(/\n/)
  lines.forEach((raw, idx) => {
    const isHeading = idx === 0 && title.length > 0
    const f = isHeading ? bold : font
    const size = isHeading ? 18 : 11
    const wrapped = wrap(raw.replace(/^#{1,3}\s/, ''), f, size)
    for (const ln of wrapped) {
      if (y < M + 14) newPage()
      if (ln) page.drawText(ln, { x: M, y, size, font: f, color: rgb(0.1, 0.12, 0.18) })
      y -= isHeading ? 26 : 16
    }
    if (raw.trim() === '') y -= 8
  })
  return pdfBlob(await doc.save())
}

// ── Edit PDF: stamp text at a chosen position on a chosen page ───
export async function editPdfAddText(
  file: File, text: string, pageNum: number, xPct: number, yPct: number, size: number, colorHex: string,
): Promise<OutputFile> {
  if (!text.trim()) throw new Error('Enter the text to add first.')
  const doc = await PDFDocument.load(await file.arrayBuffer())
  if (pageNum < 1 || pageNum > doc.getPageCount()) throw new Error(`Page ${pageNum} does not exist (document has ${doc.getPageCount()} pages).`)
  const page = doc.getPage(pageNum - 1)
  const { width, height } = page.getSize()
  const font = await doc.embedFont(StandardFonts.HelveticaBold)
  const hex = colorHex.replace('#', '')
  const col = rgb(parseInt(hex.slice(0, 2), 16) / 255, parseInt(hex.slice(2, 4), 16) / 255, parseInt(hex.slice(4, 6), 16) / 255)
  // UI coordinates are % from the top-left; PDF origin is bottom-left.
  page.drawText(text, { x: (xPct / 100) * width, y: height - (yPct / 100) * height, size, font, color: col })
  return { name: `${stem(file.name)}-edited.pdf`, blob: pdfBlob(await doc.save()) }
}

// ── Sign PDF: embed a drawn signature PNG ────────────────────────
export type SignPosition = 'bottom-right' | 'bottom-left' | 'center' | 'custom' | { xPct: number; yPct: number; width?: number }

export async function signPdf(
  file: File, signaturePng: Uint8Array, pageNum: number, position: SignPosition,
): Promise<OutputFile> {
  const doc = await PDFDocument.load(await file.arrayBuffer())
  if (pageNum < 1 || pageNum > doc.getPageCount()) throw new Error(`Page ${pageNum} does not exist (document has ${doc.getPageCount()} pages).`)
  const page = doc.getPage(pageNum - 1)
  const { width, height } = page.getSize()
  const img = await doc.embedPng(signaturePng)
  const sigW = (typeof position === 'object' && position.width) ? position.width : 170
  const sigH = (img.height / img.width) * sigW
  let x: number
  let y: number
  if (typeof position === 'object') {
    x = Math.max(0, Math.min(width - sigW, (position.xPct / 100) * width - sigW / 2))
    y = Math.max(0, Math.min(height - sigH, height - (position.yPct / 100) * height - sigH / 2))
  } else {
    x = position === 'bottom-left' ? 40 : position === 'center' ? (width - sigW) / 2 : width - sigW - 40
    y = position === 'center' ? (height - sigH) / 2 : 40
  }
  page.drawImage(img, { x, y, width: sigW, height: sigH })
  return { name: `${stem(file.name)}-signed.pdf`, blob: pdfBlob(await doc.save()) }
}

// ── Repair PDF: tolerant load + clean rebuild ────────────────────
export async function repairPdf(file: File): Promise<OutputFile> {
  const bytes = await file.arrayBuffer()
  let src: PDFDocument
  try {
    src = await PDFDocument.load(bytes, { ignoreEncryption: false, updateMetadata: false })
  } catch {
    throw new Error('This PDF could not be opened at all — the damage is beyond rebuild repair (truncated or heavily corrupted files usually cannot be recovered).')
  }
  const doc = await PDFDocument.create()
  ;(await doc.copyPages(src, src.getPageIndices())).forEach((p) => doc.addPage(p))
  doc.setProducer('DocDoctor (repaired)')
  const out = await doc.save({ useObjectStreams: true })
  return { name: `${stem(file.name)}-repaired.pdf`, blob: pdfBlob(out) }
}

// ── PDF → Word (text-based rebuild; disclosed in UI) ─────────────
export async function pdfToDocx(file: File): Promise<OutputFile> {
  const pages = await extractTextPages(await file.arrayBuffer())
  if (!pages.some((p) => p.lines.length)) throw new Error('No selectable text found. Scanned or image-only PDFs need OCR — please use the "OCR PDF to Text" tool to extract text or convert to a searchable document.')
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, PageBreak } = await import('docx')
  const children: InstanceType<typeof Paragraph>[] = []
  pages.forEach((p, pi) => {
    if (pi > 0) children.push(new Paragraph({ children: [new PageBreak()] }))
    p.lines.forEach((line, li) => {
      children.push(li === 0 && pi === 0
        ? new Paragraph({ text: line, heading: HeadingLevel.HEADING_1 })
        : new Paragraph({ children: [new TextRun(line)] }))
    })
  })
  const docFile = new Document({ sections: [{ children: children.length ? children : [new Paragraph('')] }] })
  const blob = await Packer.toBlob(docFile)
  return { name: `${stem(file.name)}.docx`, blob: new Blob([blob], { type: DOCX_TYPE }) }
}

// ── PDF → Excel (line/cell text extraction heuristic) ────────────
export async function pdfToExcel(file: File): Promise<OutputFile> {
  const pages = await extractTextPages(await file.arrayBuffer())
  if (!pages.some((p) => p.rows.length)) throw new Error('No selectable text found. Scanned or image-only PDFs need OCR — please use the "OCR PDF to Text" tool to extract text or tables.')
  const wb = XLSX.utils.book_new()
  pages.forEach((p, i) => {
    const ws = XLSX.utils.aoa_to_sheet(p.rows.length ? p.rows : [['(no text on this page)']])
    XLSX.utils.book_append_sheet(wb, ws, `Page ${i + 1}`)
  })
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  return { name: `${stem(file.name)}.xlsx`, blob: new Blob([out], { type: XLSX_TYPE }) }
}

// ── PDF → PowerPoint (each page a full-slide image) ──────────────
export async function pdfToPowerpoint(file: File, scale: number): Promise<OutputFile> {
  const images = await pdfToImages(file, 'image/jpeg', scale)
  const { default: PptxGenJS } = await import('pptxgenjs')
  const deck = new PptxGenJS()
  deck.defineLayout({ name: 'PDFPAGE', width: 13.33, height: 7.5 })
  deck.layout = 'PDFPAGE'
  for (const img of images) {
    const data = await new Promise<string>((res, rej) => {
      const r = new FileReader()
      r.onload = () => res(r.result as string)
      r.onerror = () => rej(new Error('Could not read rendered page.'))
      r.readAsDataURL(img.blob)
    })
    const slide = deck.addSlide()
    slide.background = { color: 'FFFFFF' }
    slide.addImage({ data, x: 0, y: 0, w: 13.33, h: 7.5, sizing: { type: 'contain', w: 13.33, h: 7.5 } })
  }
  const blob = await deck.write({ outputType: 'blob' }) as Blob
  return {
    name: `${stem(file.name)}.pptx`,
    blob: new Blob([blob], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }),
  }
}

// ── Word → PDF (text-flow; disclosed in UI) ──────────────────────
export async function docxToPdf(file: File): Promise<OutputFile> {
  const text = await wordExtractText(file)
  if (!text.trim()) throw new Error('No text could be extracted from this document.')
  return { name: `${stem(file.name)}.pdf`, blob: await textToPdf(text, stem(file.name)) }
}

// ── EPUB → PDF (spine text → flowed PDF) ─────────────────────────
export async function epubToPdf(file: File): Promise<OutputFile> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  // Find the OPF to learn spine order; fall back to sorted XHTML files.
  let docs: string[] = []
  const container = zip.file('META-INF/container.xml')
  if (container) {
    const cxml = await container.async('string')
    const rootfile = cxml.match(/full-path="([^"]+\.opf)"/)?.[1]
    if (rootfile) {
      const base = rootfile.includes('/') ? rootfile.slice(0, rootfile.lastIndexOf('/') + 1) : ''
      const opf = await zip.file(rootfile)?.async('string')
      if (opf) {
        const manifest = new Map<string, string>()
        for (const m of opf.matchAll(/<item[^>]+id="([^"]+)"[^>]+href="([^"]+)"/g)) manifest.set(m[1], m[2])
        for (const m of opf.matchAll(/<itemref[^>]+idref="([^"]+)"/g)) {
          const href = manifest.get(m[1])
          if (href && /\.x?html$/.test(href)) docs.push(base + href)
        }
      }
    }
  }
  if (!docs.length) docs = Object.keys(zip.files).filter((p) => /\.x?html$/.test(p)).sort()
  if (!docs.length) throw new Error('No readable chapters (XHTML) found in this EPUB.')
  const parts: string[] = []
  for (const path of docs.slice(0, 200)) {
    const entry = zip.file(path)
    if (!entry) continue
    const doc = new DOMParser().parseFromString(await entry.async('string'), 'text/html')
    doc.querySelectorAll('script,style').forEach((el) => el.remove())
    const t = (doc.body?.innerText ?? doc.body?.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim()
    if (t) parts.push(t)
  }
  if (!parts.length) throw new Error('Chapters contained no extractable text.')
  return { name: `${stem(file.name)}.pdf`, blob: await textToPdf(parts.join('\n\n'), stem(file.name)) }
}

export { degrees }
