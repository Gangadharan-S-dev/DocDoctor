import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import * as XLSX from 'xlsx'
import type { OutputFile } from './download'
import { stem } from './download'
import { extractTextPages, pdfToImages, renderPageJpeg } from './pdf'
import { DOCX_TYPE, XLSX_TYPE, wordExtractText, wordToHtml } from './office'

const pdfBlob = (bytes: Uint8Array) => new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' })

export interface StructuredBlock {
  kind: 'h1' | 'h2' | 'h3' | 'p' | 'li' | 'table'
  text?: string
  bold?: boolean
  italic?: boolean
  rows?: string[][]
}

/** Parse HTML (from mammoth or EPUB XHTML) into structured blocks for rich PDF layout. */
export function htmlToStructuredBlocks(html: string): StructuredBlock[] {
  if (typeof DOMParser === 'undefined') return []
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script,style,noscript').forEach((el) => el.remove())
  const blocks: StructuredBlock[] = []

  const walk = (root: Element | DocumentFragment) => {
    for (const child of Array.from(root.children)) {
      const tag = child.tagName.toLowerCase()
      if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
        const t = (child.textContent ?? '').replace(/\s+/g, ' ').trim()
        if (t) blocks.push({ kind: tag as 'h1' | 'h2' | 'h3', text: t, bold: true })
      } else if (tag === 'li') {
        const t = (child.textContent ?? '').replace(/\s+/g, ' ').trim()
        if (t) blocks.push({ kind: 'li', text: t })
      } else if (tag === 'table') {
        const rows: string[][] = []
        child.querySelectorAll('tr').forEach((tr) => {
          const cells = Array.from(tr.querySelectorAll('th,td')).map((c) => (c.textContent ?? '').replace(/\s+/g, ' ').trim())
          if (cells.some(Boolean)) rows.push(cells)
        })
        if (rows.length) blocks.push({ kind: 'table', rows })
      } else if (tag === 'p' || tag === 'blockquote' || tag === 'pre') {
        const t = (child.textContent ?? '').replace(/\s+/g, ' ').trim()
        if (t) {
          const onlyStrong = child.children.length === 1 && /^(STRONG|B)$/i.test(child.children[0].tagName)
          const onlyEm = child.children.length === 1 && /^(EM|I)$/i.test(child.children[0].tagName)
          blocks.push({ kind: 'p', text: t, bold: onlyStrong, italic: onlyEm })
        }
      } else if (child.children.length > 0) {
        walk(child)
      } else {
        const t = (child.textContent ?? '').replace(/\s+/g, ' ').trim()
        if (t) blocks.push({ kind: 'p', text: t })
      }
    }
  }
  if (doc.body) walk(doc.body)
  return blocks
}

/** Strip characters outside WinAnsi (StandardFonts) so pdf-lib never throws on smart quotes/emojis. */
function safePdfText(input: string): string {
  return input
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u2022/g, '*')
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '')
}

export interface DocLayoutOpts {
  pageSize?: 'a4' | 'letter'
  orientation?: 'portrait' | 'landscape'
  fontFamily?: 'Helvetica' | 'TimesRoman' | 'Courier'
  fontSize?: number
  margin?: 'compact' | 'standard' | 'wide'
  includePageNumbers?: boolean
}

/** Render structured blocks (headings, paragraphs, lists, and bordered tables) into a multi-page PDF. */
export async function blocksToPdf(blocks: StructuredBlock[], title: string, opts?: DocLayoutOpts): Promise<Blob> {
  const doc = await PDFDocument.create()
  const fam = opts?.fontFamily ?? 'Helvetica'
  const font = await doc.embedFont(
    fam === 'TimesRoman' ? StandardFonts.TimesRoman : fam === 'Courier' ? StandardFonts.Courier : StandardFonts.Helvetica
  )
  const bold = await doc.embedFont(
    fam === 'TimesRoman' ? StandardFonts.TimesRomanBold : fam === 'Courier' ? StandardFonts.CourierBold : StandardFonts.HelveticaBold
  )
  const italic = await doc.embedFont(
    fam === 'TimesRoman' ? StandardFonts.TimesRomanItalic : fam === 'Courier' ? StandardFonts.CourierOblique : StandardFonts.HelveticaOblique
  )

  const baseW = opts?.pageSize === 'letter' ? 612 : 595.28
  const baseH = opts?.pageSize === 'letter' ? 792 : 841.89
  const W = opts?.orientation === 'landscape' ? baseH : baseW
  const H = opts?.orientation === 'landscape' ? baseW : baseH
  const M = opts?.margin === 'compact' ? 36 : opts?.margin === 'wide' ? 68 : 50
  const bodySize = opts?.fontSize ?? 11
  const contentW = W - M * 2

  const wrap = (line: string, f: PDFFont, size: number, maxW = contentW): string[] => {
    const clean = safePdfText(line)
    const out: string[] = []
    let cur = ''
    for (const word of clean.split(/\s+/)) {
      const next = cur ? cur + ' ' + word : word
      if (f.widthOfTextAtSize(next, size) > maxW && cur) { out.push(cur); cur = word }
      else cur = next
    }
    if (cur) out.push(cur)
    return out.length ? out : ['']
  }

  let page = doc.addPage([W, H])
  let y = H - M
  const newPage = () => { page = doc.addPage([W, H]); y = H - M }
  const ensureSpace = (needed: number) => { if (y - needed < M) newPage() }

  if (title && (!blocks.length || blocks[0].kind !== 'h1')) {
    const cleanTitle = safePdfText(title)
    if (cleanTitle) {
      page.drawText(cleanTitle.slice(0, 70), { x: M, y, size: bodySize + 7, font: bold, color: rgb(0.08, 0.1, 0.18) })
      y -= 28
    }
  }

  for (const b of blocks) {
    if (b.kind === 'table' && b.rows && b.rows.length > 0) {
      const colCount = Math.max(1, ...b.rows.map((r) => r.length))
      const colW = contentW / colCount
      const rowH = 20
      y -= 4
      for (let ri = 0; ri < b.rows.length; ri++) {
        ensureSpace(rowH + 6)
        const isHeader = ri === 0
        if (isHeader) {
          page.drawRectangle({ x: M, y: y - rowH + 5, width: contentW, height: rowH, color: rgb(0.93, 0.95, 0.98) })
        }
        for (let ci = 0; ci < colCount; ci++) {
          const cx = M + ci * colW
          page.drawRectangle({
            x: cx,
            y: y - rowH + 5,
            width: colW,
            height: rowH,
            borderColor: rgb(0.78, 0.82, 0.88),
            borderWidth: 0.6,
          })
          const cellText = safePdfText(b.rows[ri][ci] ?? '')
          const f = isHeader ? bold : font
          const maxChars = Math.max(4, Math.floor((colW - 10) / 5.2))
          const clipped = cellText.length > maxChars ? cellText.slice(0, maxChars - 1) + '...' : cellText
          if (clipped) {
            page.drawText(clipped, { x: cx + 5, y: y - 9, size: 9.5, font: f, color: rgb(0.12, 0.15, 0.22) })
          }
        }
        y -= rowH
      }
      y -= 10
      continue
    }

    const rawText = b.text ?? ''
    const isH1 = b.kind === 'h1'
    const isH2 = b.kind === 'h2'
    const isH3 = b.kind === 'h3'
    const isList = b.kind === 'li'
    const size = isH1 ? bodySize + 6 : isH2 ? bodySize + 3 : isH3 ? bodySize + 1.5 : bodySize
    const f = isH1 || isH2 || isH3 || b.bold ? bold : b.italic ? italic : font
    const indent = isList ? 16 : 0
    const lineStep = isH1 ? size + 7 : isH2 ? size + 6 : size + 5

    if (isH1 || isH2) y -= 6
    const wrapped = wrap(rawText, f, size, contentW - indent)
    wrapped.forEach((ln, li) => {
      ensureSpace(lineStep)
      if (isList && li === 0) {
        page.drawText('-', { x: M + 4, y, size, font: bold, color: rgb(0.15, 0.35, 0.75) })
      }
      if (ln) {
        page.drawText(ln, { x: M + indent, y, size, font: f, color: rgb(0.1, 0.12, 0.18) })
      }
      y -= lineStep
    })
    y -= isH1 || isH2 ? 4 : 3
  }

  if (opts?.includePageNumbers) {
    const pages = doc.getPages()
    const total = pages.length
    pages.forEach((p, idx) => {
      const label = `Page ${idx + 1} of ${total}`
      const lw = font.widthOfTextAtSize(label, 9)
      p.drawText(label, { x: (W - lw) / 2, y: Math.max(14, M / 2 - 4), size: 9, font, color: rgb(0.45, 0.5, 0.58) })
    })
  }

  return pdfBlob(await doc.save())
}

// ── Shared: flow plain text (with Markdown headings/lists/tables) into a clean multi-page PDF ──
export async function textToPdf(text: string, title: string, opts?: DocLayoutOpts): Promise<Blob> {
  const lines = text.split(/\n/)
  const blocks: StructuredBlock[] = []
  let tableBuf: string[][] = []

  const flushTable = () => {
    if (tableBuf.length) {
      blocks.push({ kind: 'table', rows: tableBuf })
      tableBuf = []
    }
  }

  lines.forEach((raw, idx) => {
    const trimmed = raw.trim()
    if (/^\|.+\|$/.test(trimmed)) {
      const cells = trimmed.slice(1, -1).split('|').map((c) => c.trim())
      if (!cells.every((c) => /^[-:]+$/.test(c))) tableBuf.push(cells)
      return
    }
    flushTable()
    if (!trimmed) return
    if (idx === 0 && title.length > 0 && !/^#{1,3}\s/.test(trimmed)) {
      blocks.push({ kind: 'h1', text: trimmed, bold: true })
    } else if (trimmed.startsWith('### ')) {
      blocks.push({ kind: 'h3', text: trimmed.slice(4) })
    } else if (trimmed.startsWith('## ')) {
      blocks.push({ kind: 'h2', text: trimmed.slice(3) })
    } else if (trimmed.startsWith('# ')) {
      blocks.push({ kind: 'h1', text: trimmed.slice(2) })
    } else if (/^[-*•]\s+/.test(trimmed)) {
      blocks.push({ kind: 'li', text: trimmed.replace(/^[-*•]\s+/, '') })
    } else {
      blocks.push({ kind: 'p', text: trimmed })
    }
  })
  flushTable()

  return blocksToPdf(blocks.length ? blocks : [{ kind: 'p', text: '' }], '', opts)
}

// ── Edit PDF: stamp multi-annotation queue (text, highlight, redaction, shapes, stamps) + optional destructive redaction ───
export type PdfEditAnnotationMode = 'text' | 'redact' | 'highlight' | 'rect' | 'circle' | 'line' | 'check' | 'cross'

export interface PdfAnnotation {
  id?: string
  mode: PdfEditAnnotationMode
  text?: string
  pageNum: number
  xPct: number
  yPct: number
  size?: number
  colorHex: string
  fontFamily?: 'Helvetica' | 'TimesRoman' | 'Courier'
  width?: number
  height?: number
}

export interface EditPdfOptions {
  fontFamily?: 'Helvetica' | 'TimesRoman' | 'Courier'
  isRedact?: boolean
  isHighlight?: boolean
  mode?: PdfEditAnnotationMode
  redactWidth?: number
  redactHeight?: number
  annotations?: PdfAnnotation[]
  destructiveRedact?: boolean
}

function parseHexColor(colorHex: string) {
  const hex = (colorHex || '#122036').replace('#', '').padEnd(6, '0')
  return rgb(
    parseInt(hex.slice(0, 2), 16) / 255,
    parseInt(hex.slice(2, 4), 16) / 255,
    parseInt(hex.slice(4, 6), 16) / 255,
  )
}

async function applyAnnotationToPage(doc: PDFDocument, page: PDFPage, ann: PdfAnnotation) {
  const { width, height } = page.getSize()
  const col = parseHexColor(ann.colorHex)
  const x = (ann.xPct / 100) * width
  const y = height - (ann.yPct / 100) * height
  const rw = ann.width ?? 120
  const rh = ann.height ?? 24

  if (ann.mode === 'redact' || ann.mode === 'highlight') {
    page.drawRectangle({
      x: Math.max(0, x - rw / 2),
      y: Math.max(0, y - rh / 2),
      width: rw,
      height: rh,
      color: col,
      opacity: ann.mode === 'highlight' ? 0.38 : 1,
    })
  } else if (ann.mode === 'rect') {
    page.drawRectangle({
      x: Math.max(0, x - rw / 2),
      y: Math.max(0, y - rh / 2),
      width: rw,
      height: rh,
      borderColor: col,
      borderWidth: 2.5,
      color: col,
      opacity: 0.08,
    })
  } else if (ann.mode === 'circle') {
    page.drawEllipse({
      x,
      y,
      xScale: Math.max(6, rw / 2),
      yScale: Math.max(6, rh / 2),
      borderColor: col,
      borderWidth: 2.5,
      color: col,
      opacity: 0.08,
    })
  } else if (ann.mode === 'line') {
    page.drawLine({
      start: { x: Math.max(0, x - rw / 2), y },
      end: { x: Math.min(width, x + rw / 2), y },
      thickness: 2.5,
      color: col,
    })
  } else if (ann.mode === 'check') {
    const s = (ann.size ?? 18) * 0.65
    page.drawLine({
      start: { x: x - s * 0.6, y: y + s * 0.1 },
      end: { x: x - s * 0.1, y: y - s * 0.45 },
      thickness: 2.8,
      color: col,
    })
    page.drawLine({
      start: { x: x - s * 0.1, y: y - s * 0.45 },
      end: { x: x + s * 0.85, y: y + s * 0.65 },
      thickness: 2.8,
      color: col,
    })
  } else if (ann.mode === 'cross') {
    const s = (ann.size ?? 18) * 0.55
    page.drawLine({
      start: { x: x - s, y: y - s },
      end: { x: x + s, y: y + s },
      thickness: 2.8,
      color: col,
    })
    page.drawLine({
      start: { x: x - s, y: y + s },
      end: { x: x + s, y: y - s },
      thickness: 2.8,
      color: col,
    })
  } else {
    const txt = safePdfText(ann.text ?? '')
    if (!txt.trim()) return
    const fontName = ann.fontFamily === 'TimesRoman'
      ? StandardFonts.TimesRomanBold
      : ann.fontFamily === 'Courier'
        ? StandardFonts.CourierBold
        : StandardFonts.HelveticaBold
    const font = await doc.embedFont(fontName)
    page.drawText(txt, { x, y, size: ann.size ?? 16, font, color: col })
  }
}

export async function editPdfAddText(
  file: File, text: string, pageNum: number, xPct: number, yPct: number, size: number, colorHex: string,
  opts?: EditPdfOptions,
): Promise<OutputFile> {
  const fallbackMode: PdfEditAnnotationMode = opts?.mode
    ? opts.mode
    : opts?.isRedact
      ? 'redact'
      : opts?.isHighlight
        ? 'highlight'
        : 'text'
  const queue: PdfAnnotation[] = opts?.annotations?.length
    ? opts.annotations
    : [{
      mode: fallbackMode,
      text,
      pageNum,
      xPct,
      yPct,
      size,
      colorHex,
      fontFamily: opts?.fontFamily,
      width: opts?.redactWidth,
      height: opts?.redactHeight,
    }]

  for (const item of queue) {
    if (item.mode === 'text' && !(item.text ?? '').trim()) {
      throw new Error('Enter the text to add first.')
    }
  }

  const doc = await PDFDocument.load(await file.arrayBuffer())
  const totalPages = doc.getPageCount()
  for (const item of queue) {
    if (item.pageNum < 1 || item.pageNum > totalPages) {
      throw new Error(`Page ${item.pageNum} does not exist (document has ${totalPages} pages).`)
    }
  }

  for (const item of queue) {
    const page = doc.getPage(item.pageNum - 1)
    await applyAnnotationToPage(doc, page, item)
  }

  let savedBytes = await doc.save()

  // True destructive redaction: rasterize redacted pages so underlying text streams are permanently removed
  const hasRedactions = queue.some((a) => a.mode === 'redact')
  if (hasRedactions && opts?.destructiveRedact && typeof document !== 'undefined') {
    try {
      const redactedPages = new Set(queue.filter((a) => a.mode === 'redact').map((a) => a.pageNum))
      const cleanDoc = await PDFDocument.create()
      const currentDoc = await PDFDocument.load(savedBytes)
      const buf = savedBytes.slice().buffer as ArrayBuffer
      for (let p = 1; p <= totalPages; p++) {
        if (redactedPages.has(p)) {
          const rendered = await renderPageJpeg(buf, p, 2)
          const jpg = await cleanDoc.embedJpg(rendered.jpeg)
          const newPage = cleanDoc.addPage([rendered.pageWidth, rendered.pageHeight])
          newPage.drawImage(jpg, { x: 0, y: 0, width: rendered.pageWidth, height: rendered.pageHeight })
        } else {
          const [copied] = await cleanDoc.copyPages(currentDoc, [p - 1])
          cleanDoc.addPage(copied)
        }
      }
      savedBytes = await cleanDoc.save({ useObjectStreams: true })
    } catch {
      // Fallback to overlay redaction if canvas rasterization is unavailable
    }
  }

  return { name: `${stem(file.name)}-edited.pdf`, blob: pdfBlob(savedBytes) }
}

// ── Sign PDF: embed a drawn/typed/uploaded signature PNG (supports multi-page & date stamp) ────
export type SignPosition = 'bottom-right' | 'bottom-left' | 'center' | 'custom' | { xPct: number; yPct: number; width?: number }

export interface SignPlacement {
  pageNum: number
  xPct: number
  yPct: number
  width?: number
}

export interface SignPdfOptions {
  allPages?: boolean
  dateStamp?: string
  placements?: SignPlacement[]
}

export async function signPdf(
  file: File, signaturePng: Uint8Array, pageNum: number, position: SignPosition, opts?: SignPdfOptions,
): Promise<OutputFile> {
  const doc = await PDFDocument.load(await file.arrayBuffer())
  const totalPages = doc.getPageCount()
  if (pageNum < 1 || pageNum > totalPages) throw new Error(`Page ${pageNum} does not exist (document has ${totalPages} pages).`)
  const img = await doc.embedPng(signaturePng)
  const font = opts?.dateStamp ? await doc.embedFont(StandardFonts.Helvetica) : null

  const drawAt = (page: PDFPage, pos: SignPosition) => {
    const { width, height } = page.getSize()
    const sigW = (typeof pos === 'object' && pos.width) ? pos.width : 170
    const sigH = (img.height / img.width) * sigW
    let x: number
    let y: number
    if (typeof pos === 'object') {
      x = Math.max(0, Math.min(width - sigW, (pos.xPct / 100) * width - sigW / 2))
      y = Math.max(0, Math.min(height - sigH, height - (pos.yPct / 100) * height - sigH / 2))
    } else {
      x = pos === 'bottom-left' ? 40 : pos === 'center' ? (width - sigW) / 2 : width - sigW - 40
      y = pos === 'center' ? (height - sigH) / 2 : 40
    }
    page.drawImage(img, { x, y, width: sigW, height: sigH })
    if (font && opts?.dateStamp) {
      const stamp = safePdfText(opts.dateStamp)
      page.drawText(stamp, {
        x: x + 4,
        y: Math.max(8, y - 11),
        size: 8.5,
        font,
        color: rgb(0.25, 0.3, 0.4),
      })
    }
  }

  if (opts?.placements && opts.placements.length > 0) {
    for (const pl of opts.placements) {
      if (pl.pageNum >= 1 && pl.pageNum <= totalPages) {
        drawAt(doc.getPage(pl.pageNum - 1), { xPct: pl.xPct, yPct: pl.yPct, width: pl.width })
      }
    }
  } else if (opts?.allPages) {
    for (let i = 0; i < totalPages; i++) {
      drawAt(doc.getPage(i), position)
    }
  } else {
    drawAt(doc.getPage(pageNum - 1), position)
  }

  return { name: `${stem(file.name)}-signed.pdf`, blob: pdfBlob(await doc.save()) }
}

export interface PdfRepairDiagnostic {
  canOpen: boolean
  pagesRecovered: number
  objectsCount: number
  hasHeader: boolean
  hasEofMarker: boolean
  notes: string[]
}

/** Pre-inspect a PDF file to report structural health, object stream counts, and recoverability. */
export async function inspectPdfRepair(file: File): Promise<PdfRepairDiagnostic> {
  const bytes = await file.arrayBuffer()
  const raw = new Uint8Array(bytes)
  const headStr = new TextDecoder('latin1').decode(raw.slice(0, 32))
  const tailStr = new TextDecoder('latin1').decode(raw.slice(Math.max(0, raw.length - 128)))
  const hasHeader = headStr.includes('%PDF-')
  const hasEofMarker = tailStr.includes('%%EOF')
  const notes: string[] = []
  if (!hasHeader) notes.push('Missing standard %PDF- header signature.')
  if (!hasEofMarker) notes.push('Missing trailing %%EOF marker (file may have been truncated during download).')

  try {
    const doc = await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false })
    const objectsCount = doc.context.enumerateIndirectObjects().length
    const pagesRecovered = doc.getPageCount()
    notes.push(`Parsed ${objectsCount} indirect PDF objects across ${pagesRecovered} page(s).`)
    notes.push('Cross-reference table (XRef) and object streams will be rebuilt cleanly.')
    return { canOpen: true, pagesRecovered, objectsCount, hasHeader, hasEofMarker, notes }
  } catch {
    notes.push('Structure is severely damaged or truncated beyond standard XRef rebuild.')
    return { canOpen: false, pagesRecovered: 0, objectsCount: 0, hasHeader, hasEofMarker, notes }
  }
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

// ── PDF → Word (style & table-aware rebuild; disclosed in UI) ─────────────
export async function pdfToDocx(file: File): Promise<OutputFile> {
  const pages = await extractTextPages(await file.arrayBuffer())
  if (!pages.some((p) => p.lines.length)) throw new Error('No selectable text found. Scanned or image-only PDFs need OCR — please use the "OCR PDF to Text" tool to extract text or convert to a searchable document.')
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, PageBreak, Table, TableRow, TableCell, WidthType } = await import('docx')
  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = []

  // Estimate body font size across document to detect headings
  const allFontSizes = pages.flatMap((p) => (p.richLines ?? []).map((l) => l.fontSize)).sort((a, b) => a - b)
  const bodySize = allFontSizes.length ? allFontSizes[Math.floor(allFontSizes.length / 2)] : 11

  pages.forEach((p, pi) => {
    if (pi > 0) children.push(new Paragraph({ children: [new PageBreak()] }))
    const rich = p.richLines?.length
      ? p.richLines
      : p.lines.map((t) => ({ text: t, fontSize: bodySize, isBold: false, x: 50, y: 0, pageWidth: 595, pageHeight: 842, cells: [t] }))

    let tableRowsBuf: string[][] = []
    const flushTable = () => {
      if (tableRowsBuf.length >= 2) {
        const colCount = Math.max(...tableRowsBuf.map((r) => r.length))
        children.push(new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: tableRowsBuf.map((r, ri) => new TableRow({
            children: Array.from({ length: colCount }, (_, ci) => new TableCell({
              children: [new Paragraph({
                children: [new TextRun({ text: r[ci] ?? '', bold: ri === 0 })],
              })],
            })),
          })),
        }))
      } else if (tableRowsBuf.length === 1) {
        children.push(new Paragraph({ children: [new TextRun(tableRowsBuf[0].join('    '))] }))
      }
      tableRowsBuf = []
    }

    rich.forEach((line, li) => {
      if (line.cells && line.cells.length >= 2) {
        tableRowsBuf.push(line.cells)
        return
      }
      flushTable()

      const isFirstTitle = pi === 0 && li === 0
      const isH1 = isFirstTitle || line.fontSize >= bodySize + 5
      const isH2 = !isH1 && line.fontSize >= bodySize + 2.5
      const isBullet = /^[•\-*▪]\s+/.test(line.text)

      if (isH1) {
        children.push(new Paragraph({ text: line.text, heading: HeadingLevel.HEADING_1 }))
      } else if (isH2) {
        children.push(new Paragraph({ text: line.text, heading: HeadingLevel.HEADING_2 }))
      } else if (isBullet) {
        children.push(new Paragraph({
          text: line.text.replace(/^[•\-*▪]\s+/, ''),
          bullet: { level: 0 },
        }))
      } else {
        children.push(new Paragraph({
          children: [new TextRun({ text: line.text, bold: line.isBold })],
        }))
      }
    })
    flushTable()
  })

  const docFile = new Document({ sections: [{ children: children.length ? children : [new Paragraph('')] }] })
  const blob = await Packer.toBlob(docFile)
  return { name: `${stem(file.name)}.docx`, blob: new Blob([blob], { type: DOCX_TYPE }) }
}

export interface PdfToExcelOpts {
  mergeSheets?: boolean
}

// ── PDF → Excel (X-coordinate column clustering + auto-sized columns + optional single-sheet merge) ────────────
export async function pdfToExcel(file: File, opts?: PdfToExcelOpts): Promise<OutputFile> {
  const pages = await extractTextPages(await file.arrayBuffer())
  if (!pages.some((p) => p.rows.length)) throw new Error('No selectable text found. Scanned or image-only PDFs need OCR — please use the "OCR PDF to Text" tool to extract text or tables.')
  const wb = XLSX.utils.book_new()

  const applyColWidths = (ws: XLSX.WorkSheet, rows: string[][]) => {
    const colCount = Math.max(1, ...rows.map((r) => r.length))
    ws['!cols'] = Array.from({ length: colCount }, (_, ci) => {
      const maxLen = Math.max(8, ...rows.slice(0, 150).map((r) => String(r[ci] ?? '').length))
      return { wch: Math.min(48, maxLen + 3) }
    })
  }

  if (opts?.mergeSheets) {
    const allRows = pages.flatMap((p) => p.rows)
    const wsAll = XLSX.utils.aoa_to_sheet(allRows.length ? allRows : [['(no text)']])
    applyColWidths(wsAll, allRows)
    XLSX.utils.book_append_sheet(wb, wsAll, 'All Pages')
  }

  pages.forEach((p, i) => {
    const rows = p.rows.length ? p.rows : [['(no text on this page)']]
    const ws = XLSX.utils.aoa_to_sheet(rows)
    applyColWidths(ws, rows)
    XLSX.utils.book_append_sheet(wb, ws, `Page ${i + 1}`)
  })
  const out = XLSX.write(wb, { bookType: 'xlsx', type: 'array' }) as ArrayBuffer
  return { name: `${stem(file.name)}.xlsx`, blob: new Blob([out], { type: XLSX_TYPE }) }
}

// ── PDF → PowerPoint (supports visual slide image mode OR editable text-box slides) ──
export async function pdfToPowerpoint(
  file: File,
  scale: number,
  opts?: { mode?: 'image' | 'editable' },
): Promise<OutputFile> {
  const { default: PptxGenJS } = await import('pptxgenjs')
  const deck = new PptxGenJS()
  deck.defineLayout({ name: 'PDFPAGE', width: 13.33, height: 7.5 })
  deck.layout = 'PDFPAGE'

  if (opts?.mode === 'editable') {
    const pages = await extractTextPages(await file.arrayBuffer())
    if (pages.some((p) => p.lines.length > 0)) {
      for (const p of pages) {
        const slide = deck.addSlide()
        slide.background = { color: 'FFFFFF' }
        const rich = p.richLines ?? []
        if (!rich.length) continue
        for (const ln of rich) {
          const xIn = Math.max(0.3, Math.min(12.2, (ln.x / (ln.pageWidth || 595)) * 13.33))
          const yIn = Math.max(0.25, Math.min(7.0, (1 - ln.y / (ln.pageHeight || 842)) * 7.5))
          slide.addText(ln.text, {
            x: xIn,
            y: yIn,
            w: Math.max(2, 13.0 - xIn),
            h: 0.45,
            fontSize: Math.max(9, Math.min(28, ln.fontSize)),
            bold: ln.isBold,
            color: '1E293B',
          })
        }
      }
      const blob = await deck.write({ outputType: 'blob' }) as Blob
      return {
        name: `${stem(file.name)}.pptx`,
        blob: new Blob([blob], { type: 'application/vnd.openxmlformats-officedocument.presentationml.presentation' }),
      }
    }
  }

  const images = await pdfToImages(file, 'image/jpeg', scale)
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

// ── Word → PDF (structured HTML-to-PDF with headings, lists & tables; disclosed in UI) ──
export async function docxToPdf(file: File, opts?: DocLayoutOpts): Promise<OutputFile> {
  try {
    const htmlOut = await wordToHtml(file)
    const html = await htmlOut.blob.text()
    const blocks = htmlToStructuredBlocks(html)
    if (blocks.length > 0) {
      return { name: `${stem(file.name)}.pdf`, blob: await blocksToPdf(blocks, stem(file.name), opts) }
    }
  } catch {
    // Fall back to plain text extraction below
  }
  const text = await wordExtractText(file)
  if (!text.trim()) throw new Error('No text could be extracted from this document.')
  return { name: `${stem(file.name)}.pdf`, blob: await textToPdf(text, stem(file.name), opts) }
}

// ── EPUB → PDF (spine XHTML → structured headings, lists, tables & paragraphs in PDF) ───
export async function epubToPdf(file: File, opts?: DocLayoutOpts): Promise<OutputFile> {
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
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
  const allBlocks: StructuredBlock[] = []
  const parts: string[] = []
  for (const path of docs.slice(0, 200)) {
    const entry = zip.file(path)
    if (!entry) continue
    const rawHtml = await entry.async('string')
    const chapterBlocks = htmlToStructuredBlocks(rawHtml)
    if (chapterBlocks.length) {
      allBlocks.push(...chapterBlocks)
    } else {
      const doc = new DOMParser().parseFromString(rawHtml, 'text/html')
      doc.querySelectorAll('script,style').forEach((el) => el.remove())
      const t = (doc.body?.innerText ?? doc.body?.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim()
      if (t) parts.push(t)
    }
  }
  if (allBlocks.length) {
    return { name: `${stem(file.name)}.pdf`, blob: await blocksToPdf(allBlocks, stem(file.name), opts) }
  }
  if (!parts.length) throw new Error('Chapters contained no extractable text.')
  return { name: `${stem(file.name)}.pdf`, blob: await textToPdf(parts.join('\n\n'), stem(file.name), opts) }
}

export { degrees }
