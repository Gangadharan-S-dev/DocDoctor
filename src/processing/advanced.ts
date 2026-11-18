import { PDFDocument, StandardFonts, degrees, rgb, type PDFFont, type PDFPage } from 'pdf-lib'
import * as XLSX from 'xlsx'
import type { OutputFile } from './download'
import { stem } from './download'
import { extractTextPages, pdfToImages, renderPageJpeg } from './pdf'
import { DOCX_TYPE, XLSX_TYPE, wordExtractText, wordToHtml } from './office'

const pdfBlob = (bytes: Uint8Array) => new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' })

export interface InlineTextSpan {
  text: string
  bold?: boolean
  italic?: boolean
  underline?: boolean
  colorHex?: string
}

export interface StructuredBlock {
  kind: 'h1' | 'h2' | 'h3' | 'p' | 'li' | 'table' | 'image' | 'page-break'
  text?: string
  spans?: InlineTextSpan[]
  bold?: boolean
  italic?: boolean
  align?: 'left' | 'center' | 'right' | 'justify'
  listMarker?: string
  rows?: string[][]
  imageBytes?: Uint8Array
  imageMime?: 'image/png' | 'image/jpeg'
}

/** Parse HTML (from mammoth or EPUB XHTML) into structured blocks for rich PDF layout. */
export function htmlToStructuredBlocks(html: string): StructuredBlock[] {
  if (typeof DOMParser === 'undefined') return []
  const doc = new DOMParser().parseFromString(html, 'text/html')
  doc.querySelectorAll('script,style,noscript').forEach((el) => el.remove())
  const blocks: StructuredBlock[] = []

  const extractInlineSpans = (root: Node, state: { bold?: boolean; italic?: boolean; underline?: boolean } = {}): InlineTextSpan[] => {
    const spans: InlineTextSpan[] = []
    for (const child of Array.from(root.childNodes)) {
      if (child.nodeType === 3) {
        const txt = child.textContent ?? ''
        if (txt) spans.push({ text: txt, ...state })
      } else if (child.nodeType === 1) {
        const el = child as Element
        const tag = el.tagName.toLowerCase()
        const nextState = {
          bold: state.bold || tag === 'strong' || tag === 'b',
          italic: state.italic || tag === 'em' || tag === 'i',
          underline: state.underline || tag === 'u' || tag === 'a',
        }
        spans.push(...extractInlineSpans(el, nextState))
      }
    }
    return spans
  }

  const decodeDataUrlImage = (src: string): { bytes: Uint8Array; mime: 'image/png' | 'image/jpeg' } | null => {
    const m = src.match(/^data:(image\/(?:png|jpe?g));base64,(.+)$/i)
    if (!m) return null
    try {
      const mime = m[1].toLowerCase() === 'image/png' ? 'image/png' : 'image/jpeg'
      const b64 = m[2]
      const binStr = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary')
      const bytes = new Uint8Array(binStr.length)
      for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i)
      return { bytes, mime }
    } catch {
      return null
    }
  }

  const walk = (root: Element | DocumentFragment) => {
    for (const child of Array.from(root.children)) {
      const tag = child.tagName.toLowerCase()
      if (tag === 'img') {
        const decoded = decodeDataUrlImage(child.getAttribute('src') ?? '')
        if (decoded) blocks.push({ kind: 'image', imageBytes: decoded.bytes, imageMime: decoded.mime })
        continue
      }
      child.querySelectorAll('img').forEach((imgEl) => {
        const decoded = decodeDataUrlImage(imgEl.getAttribute('src') ?? '')
        if (decoded) blocks.push({ kind: 'image', imageBytes: decoded.bytes, imageMime: decoded.mime })
      })

      if (tag === 'h1' || tag === 'h2' || tag === 'h3') {
        const t = (child.textContent ?? '').replace(/\s+/g, ' ').trim()
        if (t) blocks.push({ kind: tag as 'h1' | 'h2' | 'h3', text: t, bold: true })
      } else if (tag === 'ol' || tag === 'ul') {
        Array.from(child.children).forEach((li, idx) => {
          const t = (li.textContent ?? '').replace(/\s+/g, ' ').trim()
          if (t) {
            blocks.push({
              kind: 'li',
              text: t,
              spans: extractInlineSpans(li),
              listMarker: tag === 'ol' ? `${idx + 1}.` : '-',
            })
          }
        })
      } else if (tag === 'li') {
        const t = (child.textContent ?? '').replace(/\s+/g, ' ').trim()
        if (t) blocks.push({ kind: 'li', text: t, spans: extractInlineSpans(child) })
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
          blocks.push({
            kind: 'p',
            text: t,
            spans: extractInlineSpans(child),
            bold: onlyStrong,
            italic: onlyEm,
          })
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
  includeHeadersFooters?: boolean
  embedImages?: boolean
  headerText?: string
  footerText?: string
}

/** Render structured blocks (headings, inline styled paragraphs, lists, embedded images, and wrapped tables) into a multi-page PDF. */
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
  const boldItalic = await doc.embedFont(
    fam === 'TimesRoman' ? StandardFonts.TimesRomanBoldItalic : fam === 'Courier' ? StandardFonts.CourierBoldOblique : StandardFonts.HelveticaBoldOblique
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
    if (b.kind === 'page-break') {
      if (y < H - M - 10) newPage()
      continue
    }

    if (b.kind === 'image' && b.imageBytes && opts?.embedImages !== false) {
      try {
        const embedded = b.imageMime === 'image/png'
          ? await doc.embedPng(b.imageBytes)
          : await doc.embedJpg(b.imageBytes)
        const maxImgW = Math.min(contentW, 420)
        const maxImgH = Math.min(H - M * 2 - 40, 260)
        const scale = Math.min(1, maxImgW / Math.max(1, embedded.width), maxImgH / Math.max(1, embedded.height))
        const dw = Math.max(16, embedded.width * scale)
        const dh = Math.max(16, embedded.height * scale)
        ensureSpace(dh + 14)
        const ix = b.align === 'center' ? M + (contentW - dw) / 2 : b.align === 'right' ? M + contentW - dw : M
        page.drawImage(embedded, { x: ix, y: y - dh + 6, width: dw, height: dh })
        y -= dh + 12
      } catch {
        // Ignore unsupported image stream
      }
      continue
    }

    if (b.kind === 'table' && b.rows && b.rows.length > 0) {
      const colCount = Math.max(1, ...b.rows.map((r) => r.length))
      // Compute proportional column widths from cell content length
      const weights = Array.from({ length: colCount }, (_, ci) => {
        const maxLen = Math.max(6, ...b.rows!.slice(0, 50).map((r) => safePdfText(r[ci] ?? '').length))
        return Math.min(45, maxLen + 2)
      })
      const totalWeight = weights.reduce((a, c) => a + c, 0) || 1
      const colWidths = weights.map((w) => (w / totalWeight) * contentW)

      y -= 4
      for (let ri = 0; ri < b.rows.length; ri++) {
        const isHeader = ri === 0
        const cellFont = isHeader ? bold : font
        const cellFontSize = 9.5
        const wrappedCells = Array.from({ length: colCount }, (_, ci) => {
          const cw = colWidths[ci]
          const rawCell = safePdfText(b.rows![ri][ci] ?? '')
          return rawCell ? wrap(rawCell, cellFont, cellFontSize, Math.max(18, cw - 10)).slice(0, 4) : ['']
        })
        const maxLines = Math.max(1, ...wrappedCells.map((lines) => lines.length))
        const rowH = Math.max(20, maxLines * 12 + 8)

        ensureSpace(rowH + 6)
        if (isHeader) {
          page.drawRectangle({ x: M, y: y - rowH + 5, width: contentW, height: rowH, color: rgb(0.93, 0.95, 0.98) })
        } else if (ri % 2 === 1) {
          page.drawRectangle({ x: M, y: y - rowH + 5, width: contentW, height: rowH, color: rgb(0.98, 0.985, 0.995) })
        }
        let cx = M
        for (let ci = 0; ci < colCount; ci++) {
          const cw = colWidths[ci]
          page.drawRectangle({
            x: cx,
            y: y - rowH + 5,
            width: cw,
            height: rowH,
            borderColor: rgb(0.78, 0.82, 0.88),
            borderWidth: 0.6,
          })
          const cellLines = wrappedCells[ci]
          cellLines.forEach((ln, li) => {
            if (ln) {
              page.drawText(ln, {
                x: cx + 5,
                y: y - 9 - li * 12,
                size: cellFontSize,
                font: cellFont,
                color: rgb(0.12, 0.15, 0.22),
              })
            }
          })
          cx += cw
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
    const indent = isList ? 18 : 0
    const lineStep = isH1 ? size + 7 : isH2 ? size + 6 : size + 5

    if (isH1 || isH2) y -= 6

    // Check if paragraph has multi-style inline spans
    const hasRichSpans = b.spans && b.spans.length > 0 && b.spans.some((s) => s.bold || s.italic || s.underline || s.colorHex)
    if (hasRichSpans && !isH1 && !isH2 && !isH3) {
      // Tokenize spans into words with style metadata and flow across lines
      const tokens: { word: string; spaceAfter: boolean; bold?: boolean; italic?: boolean; underline?: boolean; colorHex?: string }[] = []
      for (const sp of b.spans!) {
        const cleaned = safePdfText(sp.text)
        const parts = cleaned.match(/\S+|\s+/g) ?? []
        for (let pi = 0; pi < parts.length; pi++) {
          const tok = parts[pi]
          if (/^\s+$/.test(tok)) {
            if (tokens.length > 0) tokens[tokens.length - 1].spaceAfter = true
          } else {
            tokens.push({
              word: tok,
              spaceAfter: false,
              bold: sp.bold ?? b.bold,
              italic: sp.italic ?? b.italic,
              underline: sp.underline,
              colorHex: sp.colorHex,
            })
          }
        }
      }

      const pickFont = (isB?: boolean, isI?: boolean) => (isB && isI ? boldItalic : isB ? bold : isI ? italic : font)
      const availW = contentW - indent
      const linesOfTokens: (typeof tokens)[] = []
      let curLine: typeof tokens = []
      let curW = 0

      for (const tk of tokens) {
        const tf = pickFont(tk.bold, tk.italic)
        const w = tf.widthOfTextAtSize(tk.word + (tk.spaceAfter ? ' ' : ''), size)
        if (curLine.length > 0 && curW + tf.widthOfTextAtSize(tk.word, size) > availW) {
          linesOfTokens.push(curLine)
          curLine = [tk]
          curW = w
        } else {
          curLine.push(tk)
          curW += w
        }
      }
      if (curLine.length > 0) linesOfTokens.push(curLine)

      linesOfTokens.forEach((lineTokens, li) => {
        ensureSpace(lineStep)
        if (isList && li === 0) {
          page.drawText(b.listMarker || '-', { x: M + 2, y, size, font: bold, color: rgb(0.15, 0.35, 0.75) })
        }
        const totalLineW = lineTokens.reduce((sum, tk, idx) => {
          const tf = pickFont(tk.bold, tk.italic)
          return sum + tf.widthOfTextAtSize(tk.word + (tk.spaceAfter && idx < lineTokens.length - 1 ? ' ' : ''), size)
        }, 0)
        let tx = M + indent
        if (b.align === 'center') tx = M + indent + Math.max(0, (availW - totalLineW) / 2)
        else if (b.align === 'right') tx = M + indent + Math.max(0, availW - totalLineW)

        lineTokens.forEach((tk, idx) => {
          const tf = pickFont(tk.bold, tk.italic)
          const col = tk.colorHex && /^#?[0-9a-fA-F]{6}$/.test(tk.colorHex)
            ? parseHexColor(tk.colorHex)
            : rgb(0.1, 0.12, 0.18)
          page.drawText(tk.word, { x: tx, y, size, font: tf, color: col })
          const wordW = tf.widthOfTextAtSize(tk.word, size)
          if (tk.underline) {
            page.drawLine({
              start: { x: tx, y: y - 1.5 },
              end: { x: tx + wordW, y: y - 1.5 },
              thickness: 0.7,
              color: col,
            })
          }
          const adv = tf.widthOfTextAtSize(tk.word + (tk.spaceAfter && idx < lineTokens.length - 1 ? ' ' : ''), size)
          tx += adv
        })
        y -= lineStep
      })
      y -= 3
      continue
    }

    const wrapped = wrap(rawText, f, size, contentW - indent)
    wrapped.forEach((ln, li) => {
      ensureSpace(lineStep)
      if (isList && li === 0) {
        page.drawText(b.listMarker || '-', { x: M + 2, y, size, font: bold, color: rgb(0.15, 0.35, 0.75) })
      }
      if (ln) {
        const lw = f.widthOfTextAtSize(ln, size)
        const availW = contentW - indent
        let tx = M + indent
        if (b.align === 'center') tx = M + indent + Math.max(0, (availW - lw) / 2)
        else if (b.align === 'right') tx = M + indent + Math.max(0, availW - lw)
        page.drawText(ln, { x: tx, y, size, font: f, color: rgb(0.1, 0.12, 0.18) })
      }
      y -= lineStep
    })
    y -= isH1 || isH2 ? 4 : 3
  }

  const pages = doc.getPages()
  const total = pages.length
  const hdrClean = opts?.includeHeadersFooters !== false && opts?.headerText ? safePdfText(opts.headerText).slice(0, 90) : ''
  const ftrClean = opts?.includeHeadersFooters !== false && opts?.footerText ? safePdfText(opts.footerText).slice(0, 90) : ''

  if (opts?.includePageNumbers || hdrClean || ftrClean) {
    pages.forEach((p, idx) => {
      if (hdrClean) {
        p.drawText(hdrClean, { x: M, y: H - Math.max(18, M / 2), size: 8.5, font, color: rgb(0.45, 0.5, 0.58) })
      }
      if (ftrClean) {
        p.drawText(ftrClean, { x: M, y: Math.max(14, M / 2 - 4), size: 8.5, font, color: rgb(0.45, 0.5, 0.58) })
      }
      if (opts?.includePageNumbers) {
        const label = `Page ${idx + 1} of ${total}`
        const lw = font.widthOfTextAtSize(label, 9)
        const px = ftrClean ? W - M - lw : (W - lw) / 2
        p.drawText(label, { x: px, y: Math.max(14, M / 2 - 4), size: 9, font, color: rgb(0.45, 0.5, 0.58) })
      }
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

export interface PdfToDocxOpts {
  mode?: 'editable' | 'hybrid' | 'snapshot'
  preserveAlignment?: boolean
  includePageBreaks?: boolean
}

export interface PdfDocxPreviewInfo {
  pageCount: number
  wordCount: number
  tableCount: number
  hasSelectableText: boolean
  sampleLines: string[]
}

/** Pre-inspect a PDF file for PDF-to-DOCX conversion: reports page count, word count, table count, and selectable text status. */
export async function inspectPdfForDocx(file: File): Promise<PdfDocxPreviewInfo> {
  const buf = await file.arrayBuffer()
  const pages = await extractTextPages(buf)
  let wordCount = 0
  let tableCount = 0
  const sampleLines: string[] = []

  for (const p of pages) {
    let inTable = 0
    for (const ln of p.richLines ?? []) {
      if (ln.cells && ln.cells.length >= 2) {
        inTable++
      } else {
        if (inTable >= 2) tableCount++
        inTable = 0
      }
    }
    if (inTable >= 2) tableCount++

    for (const line of p.lines) {
      const trimmed = line.trim()
      if (!trimmed) continue
      wordCount += trimmed.split(/\s+/).filter(Boolean).length
      if (sampleLines.length < 6) sampleLines.push(trimmed.slice(0, 100))
    }
  }

  return {
    pageCount: pages.length,
    wordCount,
    tableCount,
    hasSelectableText: wordCount > 0,
    sampleLines,
  }
}

// ── PDF → Word (style, alignment, table, and hybrid/snapshot page image rebuild) ─────────────
export async function pdfToDocx(file: File, opts?: PdfToDocxOpts): Promise<OutputFile> {
  const buf = await file.arrayBuffer()
  const pages = await extractTextPages(buf)
  const mode = opts?.mode ?? 'editable'
  const preserveAlign = opts?.preserveAlignment !== false
  const includeBreaks = opts?.includePageBreaks !== false

  const hasText = pages.some((p) => p.lines.length > 0)
  if (!hasText && mode === 'editable') {
    throw new Error('No selectable text found. Scanned or image-only PDFs need OCR — switch to "Page Snapshot Mode" above or use the "OCR PDF to Text" tool.')
  }

  const { Document, Packer, Paragraph, TextRun, HeadingLevel, PageBreak, Table, TableRow, TableCell, WidthType, AlignmentType, ImageRun } = await import('docx')
  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = []

  // Estimate body font size across document to detect headings
  const allFontSizes = pages.flatMap((p) => (p.richLines ?? []).map((l) => l.fontSize)).sort((a, b) => a - b)
  const bodySize = allFontSizes.length ? allFontSizes[Math.floor(allFontSizes.length / 2)] : 11

  for (let pi = 0; pi < pages.length; pi++) {
    const p = pages[pi]
    if (pi > 0 && includeBreaks) {
      children.push(new Paragraph({ children: [new PageBreak()] }))
    }

    if (mode === 'snapshot' || mode === 'hybrid') {
      if (typeof document !== 'undefined') {
        try {
          const snap = await renderPageJpeg(buf, pi + 1, 1.75)
          const targetW = 500
          const targetH = Math.max(80, Math.round((snap.pageHeight / Math.max(1, snap.pageWidth)) * targetW))
          children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            children: [
              new ImageRun({
                data: snap.jpeg,
                transformation: { width: targetW, height: targetH },
                type: 'jpg',
              }),
            ],
          }))
        } catch {
          // Fallback to text flow if canvas rasterization is unavailable
        }
      }
      if (mode === 'snapshot') continue
    }

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

      // Detect centered or right-aligned lines from horizontal X offset and estimated text width
      let alignment: (typeof AlignmentType)[keyof typeof AlignmentType] | undefined
      if (preserveAlign && line.pageWidth > 0) {
        const estWidth = line.text.length * line.fontSize * 0.5
        const lineCenter = line.x + estWidth / 2
        const pageCenter = line.pageWidth / 2
        if (line.x > line.pageWidth * 0.55) {
          alignment = AlignmentType.RIGHT
        } else if (line.x > line.pageWidth * 0.16 && Math.abs(lineCenter - pageCenter) < line.pageWidth * 0.14) {
          alignment = AlignmentType.CENTER
        }
      }

      if (isH1) {
        children.push(new Paragraph({ text: line.text, heading: HeadingLevel.HEADING_1, alignment }))
      } else if (isH2) {
        children.push(new Paragraph({ text: line.text, heading: HeadingLevel.HEADING_2, alignment }))
      } else if (isBullet) {
        children.push(new Paragraph({
          text: line.text.replace(/^[•\-*▪]\s+/, ''),
          bullet: { level: 0 },
        }))
      } else {
        children.push(new Paragraph({
          alignment,
          children: [new TextRun({ text: line.text, bold: line.isBold })],
        }))
      }
    })
    flushTable()
  }

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

// ── Direct OOXML DOCX → Structured Blocks parser (preserves inline runs, alignment, images, headers/footers, & tables) ──
export async function parseDocxRichBlocks(
  file: File,
): Promise<{ blocks: StructuredBlock[]; headerText?: string; footerText?: string }> {
  if (typeof DOMParser === 'undefined') return { blocks: [] }
  const { default: JSZip } = await import('jszip')
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const docEntry = zip.file('word/document.xml')
  if (!docEntry) return { blocks: [] }

  const parseXml = (xml: string) => new DOMParser().parseFromString(xml, 'application/xml')
  const doc = parseXml(await docEntry.async('string'))
  const body = doc.querySelector('body')
  if (!body) return { blocks: [] }

  // Map relationship IDs to media image paths in word/media/*
  const relIdToPath = new Map<string, string>()
  const relsEntry = zip.file('word/_rels/document.xml.rels')
  if (relsEntry) {
    const relsDoc = parseXml(await relsEntry.async('string'))
    relsDoc.querySelectorAll('Relationship').forEach((r) => {
      const id = r.getAttribute('Id')
      const target = r.getAttribute('Target') ?? ''
      if (id && /\.(png|jpe?g)$/i.test(target)) {
        const clean = target.startsWith('../') ? target.slice(3) : `word/${target.replace(/^\/+/, '')}`
        relIdToPath.set(id, clean)
      }
    })
  }

  // Extract header & footer text if present
  let headerText: string | undefined
  let footerText: string | undefined
  const hdrName = Object.keys(zip.files).find((p) => /^word\/header\d*\.xml$/i.test(p))
  if (hdrName) {
    const hDoc = parseXml(await zip.file(hdrName)!.async('string'))
    const hTxt = Array.from(hDoc.getElementsByTagName('w:t')).map((t) => t.textContent ?? '').join(' ').replace(/\s+/g, ' ').trim()
    if (hTxt) headerText = hTxt
  }
  const ftrName = Object.keys(zip.files).find((p) => /^word\/footer\d*\.xml$/i.test(p))
  if (ftrName) {
    const fDoc = parseXml(await zip.file(ftrName)!.async('string'))
    const fTxt = Array.from(fDoc.getElementsByTagName('w:t')).map((t) => t.textContent ?? '').join(' ').replace(/\s+/g, ' ').trim()
    if (fTxt) footerText = fTxt
  }

  const blocks: StructuredBlock[] = []
  let numListCounter = 0

  for (const el of Array.from(body.children)) {
    if (el.tagName === 'w:tbl') {
      numListCounter = 0
      const rows: string[][] = []
      Array.from(el.getElementsByTagName('w:tr')).forEach((tr) => {
        const cells = Array.from(tr.getElementsByTagName('w:tc')).map((tc) =>
          Array.from(tc.getElementsByTagName('w:t')).map((t) => t.textContent ?? '').join(' ').replace(/\s+/g, ' ').trim()
        )
        if (cells.some(Boolean)) rows.push(cells)
      })
      if (rows.length > 0) blocks.push({ kind: 'table', rows })
      continue
    }

    if (el.tagName !== 'w:p') continue

    const style = el.querySelector('pStyle')?.getAttribute('w:val') ?? ''
    const jcRaw = el.querySelector('jc')?.getAttribute('w:val') ?? ''
    const align: StructuredBlock['align'] = jcRaw === 'center' ? 'center' : jcRaw === 'right' ? 'right' : jcRaw === 'both' ? 'justify' : 'left'
    const numPr = el.querySelector('numPr')

    // Check for explicit page break before or inside paragraph
    if (el.getElementsByTagName('w:pageBreakBefore').length > 0) {
      blocks.push({ kind: 'page-break' })
    }

    // Check for embedded images inside this paragraph (<a:blip r:embed="rId..."/>)
    const blips = Array.from(el.getElementsByTagName('a:blip'))
    for (const blip of blips) {
      const rid = blip.getAttribute('r:embed') ?? blip.getAttribute('embed')
      const mediaPath = rid ? relIdToPath.get(rid) : undefined
      if (mediaPath && zip.file(mediaPath)) {
        const bytes = await zip.file(mediaPath)!.async('uint8array')
        const isPng = /\.png$/i.test(mediaPath)
        blocks.push({
          kind: 'image',
          imageBytes: bytes,
          imageMime: isPng ? 'image/png' : 'image/jpeg',
          align,
        })
      }
    }

    const spans: InlineTextSpan[] = []
    let hasExplicitBreakAfter = false

    for (const r of Array.from(el.getElementsByTagName('w:r'))) {
      const brs = Array.from(r.getElementsByTagName('w:br'))
      if (brs.some((b) => b.getAttribute('w:type') === 'page' || b.getAttribute('type') === 'page')) {
        hasExplicitBreakAfter = true
      }
      const rTxt = Array.from(r.getElementsByTagName('w:t')).map((t) => t.textContent ?? '').join('')
      if (!rTxt) continue
      const rPr = r.querySelector('rPr')
      const isBold = Boolean(rPr?.querySelector('b'))
      const isItalic = Boolean(rPr?.querySelector('i'))
      const isUnderline = Boolean(rPr?.querySelector('u'))
      const colVal = rPr?.querySelector('color')?.getAttribute('w:val')
      const colorHex = colVal && /^[0-9a-fA-F]{6}$/.test(colVal) && colVal.toLowerCase() !== 'auto' ? `#${colVal}` : undefined
      spans.push({
        text: rTxt,
        bold: isBold,
        italic: isItalic,
        underline: isUnderline,
        colorHex,
      })
    }

    const fullText = spans.map((s) => s.text).join('').replace(/\s+/g, ' ').trim()
    if (fullText) {
      const isH1 = /Heading1|Title/i.test(style)
      const isH2 = !isH1 && /Heading2|Subtitle/i.test(style)
      const isH3 = !isH1 && !isH2 && /Heading[3-6]/i.test(style)
      const isList = Boolean(numPr) || /List/i.test(style)

      if (isList) {
        const numId = numPr?.querySelector('numId')?.getAttribute('w:val') ?? ''
        // Heuristic: if numId > 1 or style mentions Number, format as numbered list
        const isNumbered = /Number/i.test(style) || numId === '2'
        numListCounter = isNumbered ? numListCounter + 1 : 0
        blocks.push({
          kind: 'li',
          text: fullText,
          spans,
          align,
          listMarker: isNumbered ? `${numListCounter}.` : '-',
        })
      } else {
        numListCounter = 0
        blocks.push({
          kind: isH1 ? 'h1' : isH2 ? 'h2' : isH3 ? 'h3' : 'p',
          text: fullText,
          spans,
          align,
          bold: isH1 || isH2 || isH3 || (spans.length > 0 && spans.every((s) => s.bold)),
          italic: spans.length > 0 && spans.every((s) => s.italic),
        })
      }
    }

    if (hasExplicitBreakAfter) {
      blocks.push({ kind: 'page-break' })
    }
  }

  return { blocks, headerText, footerText }
}

// ── Word → PDF (direct OOXML rich layout with inline runs, images, alignments, lists, headers/footers & tables) ──
export async function docxToPdf(file: File, opts?: DocLayoutOpts): Promise<OutputFile> {
  try {
    const rich = await parseDocxRichBlocks(file)
    if (rich.blocks.length > 0) {
      return {
        name: `${stem(file.name)}.pdf`,
        blob: await blocksToPdf(rich.blocks, stem(file.name), {
          ...opts,
          headerText: opts?.headerText ?? rich.headerText,
          footerText: opts?.footerText ?? rich.footerText,
        }),
      }
    }
  } catch {
    // Fall back to mammoth HTML / plain text extraction below
  }
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
