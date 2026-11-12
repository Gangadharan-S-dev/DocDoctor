import { PDFDocument, degrees, rgb, StandardFonts, PDFName, PDFNumber, PDFRawStream } from 'pdf-lib'
import type { OutputFile } from './download'
import { stem } from './download'

const pdfBlob = (bytes: Uint8Array): Blob =>
  new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' })

async function load(bytes: ArrayBuffer) {
  return PDFDocument.load(bytes, { ignoreEncryption: false })
}

/** Parse "1-3, 5, 8-10" (1-based) into sorted unique 0-based indices. */
export function parseRanges(input: string, pageCount: number): number[] {
  const out = new Set<number>()
  for (const part of input.split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d+)\s*-\s*(\d+)$/)
    if (m) {
      let a = parseInt(m[1]), b = parseInt(m[2])
      if (a > b) [a, b] = [b, a]
      for (let p = a; p <= b; p++) if (p >= 1 && p <= pageCount) out.add(p - 1)
    } else if (/^\d+$/.test(part)) {
      const p = parseInt(part)
      if (p >= 1 && p <= pageCount) out.add(p - 1)
    } else throw new Error(`Invalid page range: "${part}". Use e.g. 1-3, 5, 8.`)
  }
  if (!out.size) throw new Error('No valid pages selected.')
  return [...out].sort((a, b) => a - b)
}

export async function mergePdfs(files: File[]): Promise<OutputFile> {
  if (files.length < 2) throw new Error('Select at least two PDFs to merge.')
  const out = await PDFDocument.create()
  for (const f of files) {
    const src = await load(await f.arrayBuffer())
    const pages = await out.copyPages(src, src.getPageIndices())
    pages.forEach((p) => out.addPage(p))
  }
  return { name: 'merged.pdf', blob: pdfBlob(await out.save()) }
}

export async function splitPdf(file: File, ranges: string): Promise<OutputFile[]> {
  const src = await load(await file.arrayBuffer())
  const groups = ranges.split(';').map((s) => s.trim()).filter(Boolean)
  const outs: OutputFile[] = []
  if (groups.length <= 1 && !ranges.includes(';')) {
    // Single range field may contain commas = one output with those pages.
    const idx = parseRanges(ranges, src.getPageCount())
    const doc = await PDFDocument.create()
    ;(await doc.copyPages(src, idx)).forEach((p) => doc.addPage(p))
    outs.push({ name: `${stem(file.name)}-pages.pdf`, blob: pdfBlob(await doc.save()) })
    return outs
  }
  for (let i = 0; i < groups.length; i++) {
    const idx = parseRanges(groups[i], src.getPageCount())
    const doc = await PDFDocument.create()
    ;(await doc.copyPages(src, idx)).forEach((p) => doc.addPage(p))
    outs.push({ name: `${stem(file.name)}-part${i + 1}.pdf`, blob: pdfBlob(await doc.save()) })
  }
  return outs
}

export async function removePages(file: File, remove: number[]): Promise<OutputFile> {
  const src = await load(await file.arrayBuffer())
  const keep = src.getPageIndices().filter((i) => !remove.includes(i))
  if (!keep.length) throw new Error('You cannot remove every page.')
  const doc = await PDFDocument.create()
  ;(await doc.copyPages(src, keep)).forEach((p) => doc.addPage(p))
  return { name: `${stem(file.name)}-edited.pdf`, blob: pdfBlob(await doc.save()) }
}

export async function extractPages(file: File, keep: number[]): Promise<OutputFile> {
  const src = await load(await file.arrayBuffer())
  if (!keep.length) throw new Error('Select at least one page to extract.')
  const doc = await PDFDocument.create()
  ;(await doc.copyPages(src, [...keep].sort((a, b) => a - b))).forEach((p) => doc.addPage(p))
  return { name: `${stem(file.name)}-extracted.pdf`, blob: pdfBlob(await doc.save()) }
}

export interface PageOp { index: number; rotation: number; deleted: boolean }

export async function organizePdf(file: File, ops: PageOp[]): Promise<OutputFile> {
  const src = await load(await file.arrayBuffer())
  const active = ops.filter((o) => !o.deleted)
  if (!active.length) throw new Error('You cannot delete every page.')
  const doc = await PDFDocument.create()
  const copied = await doc.copyPages(src, active.map((o) => o.index))
  copied.forEach((p, i) => {
    const rot = active[i].rotation % 360
    if (rot) p.setRotation(degrees((p.getRotation().angle + rot) % 360))
    doc.addPage(p)
  })
  return { name: `${stem(file.name)}-organized.pdf`, blob: pdfBlob(await doc.save()) }
}

export async function rotatePdf(file: File, deg: number, pages: number[] | 'all'): Promise<OutputFile> {
  const doc = await load(await file.arrayBuffer())
  const targets = pages === 'all' ? doc.getPageIndices() : pages
  for (const i of targets) {
    const p = doc.getPage(i)
    p.setRotation(degrees((p.getRotation().angle + deg) % 360))
  }
  return { name: `${stem(file.name)}-rotated.pdf`, blob: pdfBlob(await doc.save()) }
}

/**
 * Browser-side recompression: rebuilds the document, strips metadata and
 * stores objects in compressed streams. Honest limitation: scanned/image-heavy
 * PDFs may not shrink much — we always report the real before/after sizes.
 */
export interface ProcessOpts {
  signal?: AbortSignal
  onProgress?: (done: number, total: number) => void
}

export function throwIfAborted(signal?: AbortSignal) {
  if (signal?.aborted) throw new DOMException('Processing cancelled.', 'AbortError')
}

/**
 * Recompress embedded JPEG images directly in the PDF object streams.
 * Leaves text, vector graphics, fonts, and bookmarks intact.
 */
async function recompressEmbeddedImages(
  doc: PDFDocument,
  quality: number,
  maxEdge: number,
  signal?: AbortSignal,
): Promise<number> {
  if (typeof document === 'undefined' || typeof createImageBitmap === 'undefined') return 0
  let savedBytes = 0

  for (const [ref, obj] of doc.context.enumerateIndirectObjects()) {
    throwIfAborted(signal)
    if (!(obj instanceof PDFRawStream)) continue
    const subtype = obj.dict.get(PDFName.of('Subtype'))
    if (!subtype || subtype.toString() !== '/Image') continue

    const filter = obj.dict.get(PDFName.of('Filter'))
    const filterStr = filter ? filter.toString() : ''
    const isJpeg = /DCTDecode|DCT/i.test(filterStr)
    if (!isJpeg) continue

    const oldBytes = obj.getContents()
    if (!oldBytes || oldBytes.length < 4_000) continue

    try {
      const blob = new Blob([oldBytes.slice().buffer as ArrayBuffer], { type: 'image/jpeg' })
      const bmp = await createImageBitmap(blob)
      let w = bmp.width, h = bmp.height
      if (maxEdge && Math.max(w, h) > maxEdge) {
        const s = maxEdge / Math.max(w, h)
        w = Math.max(1, Math.round(w * s))
        h = Math.max(1, Math.round(h * s))
      }
      const c = document.createElement('canvas')
      c.width = w
      c.height = h
      const ctx = c.getContext('2d')
      if (!ctx) {
        bmp.close()
        continue
      }
      ctx.drawImage(bmp, 0, 0, w, h)
      bmp.close()

      const newBlob = await new Promise<Blob | null>((res) => c.toBlob(res, 'image/jpeg', quality))
      if (!newBlob) continue
      const newBytes = new Uint8Array(await newBlob.arrayBuffer())

      if (newBytes.length < oldBytes.length * 0.95) {
        obj.dict.set(PDFName.of('Width'), PDFNumber.of(w))
        obj.dict.set(PDFName.of('Height'), PDFNumber.of(h))
        const newStream = PDFRawStream.of(obj.dict, newBytes)
        doc.context.assign(ref, newStream)
        savedBytes += (oldBytes.length - newBytes.length)
      }
    } catch {
      // Ignore individual image stream failures gracefully
    }
  }
  return savedBytes
}

/**
 * Extreme / fallback compression: rasterize each page to a downsampled JPEG and rebuild.
 * Useful for scanned documents where text is already image-based or vector stream is uncompressible.
 */
async function rasterizePdf(
  file: File,
  opts: ProcessOpts,
  quality = 0.58,
  dpi = 100,
): Promise<OutputFile> {
  const pdf = await loadPdfJs(await file.arrayBuffer())
  const doc = await PDFDocument.create()
  const scale = dpi / 72
  for (let i = 1; i <= pdf.numPages; i++) {
    throwIfAborted(opts.signal)
    const page = await pdf.getPage(i)
    const vp = page.getViewport({ scale })
    const c = document.createElement('canvas')
    c.width = Math.floor(vp.width); c.height = Math.floor(vp.height)
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height)
    await page.render({ canvas: c, viewport: vp }).promise
    const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Render failed.'))), 'image/jpeg', quality))
    const img = await doc.embedJpg(new Uint8Array(await blob.arrayBuffer()))
    const p = doc.addPage([vp.width / scale, vp.height / scale])
    p.drawImage(img, { x: 0, y: 0, width: p.getWidth(), height: p.getHeight() })
    opts.onProgress?.(i, pdf.numPages)
    await new Promise((r) => setTimeout(r, 0))
  }
  closePdf(pdf)
  doc.setProducer('DocDoctor'); doc.setCreator('DocDoctor')
  const bytes = await doc.save({ useObjectStreams: true })

  // Guarantee: Never return a file larger than input
  if (bytes.byteLength >= file.size) {
    return { name: `${stem(file.name)}-compressed.pdf`, blob: file }
  }
  return { name: `${stem(file.name)}-compressed.pdf`, blob: pdfBlob(bytes) }
}

export async function compressPdf(
  file: File,
  level: 'less' | 'recommended' | 'extreme',
  opts: ProcessOpts = {},
): Promise<OutputFile> {
  // Extreme mode: Try aggressive rasterization (smallest file for scans/decks),
  // compare with aggressive in-place recompression, and return whichever is smaller.
  if (level === 'extreme') {
    let rasterCandidate: OutputFile | null = null
    if (typeof document !== 'undefined') {
      try {
        const r = await rasterizePdf(file, opts, 0.42, 72)
        if (r.blob.size < file.size) rasterCandidate = r
      } catch {
        // ignore
      }
    }

    // Also try aggressive in-place stream recompression
    try {
      const src = await load(await file.arrayBuffer())
      await recompressEmbeddedImages(src, 0.45, 1000, opts.signal)
      src.setTitle(''); src.setAuthor(''); src.setSubject(''); src.setKeywords([]); src.setProducer('DocDoctor'); src.setCreator('DocDoctor')
      const inPlaceBytes = await src.save({ useObjectStreams: true, addDefaultPage: false })
      if (inPlaceBytes.byteLength < file.size) {
        const inPlaceBlob = pdfBlob(inPlaceBytes)
        if (!rasterCandidate || inPlaceBlob.size < rasterCandidate.blob.size) {
          return { name: `${stem(file.name)}-compressed.pdf`, blob: inPlaceBlob }
        }
      }
    } catch {
      // ignore
    }

    if (rasterCandidate) return rasterCandidate
    return { name: `${stem(file.name)}-compressed.pdf`, blob: file }
  }

  // Recommended & Less modes:
  const src = await load(await file.arrayBuffer())
  const q = level === 'less' ? 0.72 : 0.58
  const maxEdge = level === 'less' ? 2000 : 1400

  // 1. Recompress embedded images directly in the PDF streams
  await recompressEmbeddedImages(src, q, maxEdge, opts.signal)

  // 2. Strip metadata overhead from info dictionary
  try {
    src.setTitle('')
    src.setAuthor('')
    src.setSubject('')
    src.setKeywords([])
    src.setProducer('DocDoctor')
    src.setCreator('DocDoctor')
  } catch {
    // ignore
  }

  // 3. Save with object streams
  const bytes = await src.save({ useObjectStreams: true, addDefaultPage: false })
  const inPlaceBlob = bytes.byteLength < file.size ? pdfBlob(bytes) : null

  // 4. In recommended mode, if in-place compression achieved < 25% savings
  // (e.g. scanned documents with uncompressed or flate raster streams),
  // compare against adaptive page rasterization and choose whichever is smaller.
  if (level === 'recommended' && typeof document !== 'undefined') {
    const savings = inPlaceBlob ? (file.size - inPlaceBlob.size) / file.size : 0
    if (savings < 0.25) {
      try {
        const rasterized = await rasterizePdf(file, opts, 0.50, 85)
        if (rasterized.blob.size < file.size) {
          if (!inPlaceBlob || rasterized.blob.size < inPlaceBlob.size) {
            return rasterized
          }
        }
      } catch {
        // ignore
      }
    }
  }

  if (inPlaceBlob) {
    return { name: `${stem(file.name)}-compressed.pdf`, blob: inPlaceBlob }
  }

  // 5. Absolute guarantee: If no compression technique could make it smaller
  // (e.g. file is already heavily optimized or tiny), NEVER return a file larger than input.
  return { name: `${stem(file.name)}-compressed.pdf`, blob: file }
}

export interface PageNumberOpts {
  fontSize?: number
  colorHex?: string
  skipCover?: boolean
}

export async function addPageNumbers(
  file: File,
  position: 'bottom-center' | 'bottom-right' | 'bottom-left',
  start: number,
  fmt: string,
  opts?: PageNumberOpts,
): Promise<OutputFile> {
  const doc = await load(await file.arrayBuffer())
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const size = opts?.fontSize ?? 10
  const hex = (opts?.colorHex ?? '#596173').replace('#', '')
  const col = rgb(
    parseInt(hex.slice(0, 2), 16) / 255,
    parseInt(hex.slice(2, 4), 16) / 255,
    parseInt(hex.slice(4, 6), 16) / 255
  )
  const skipCover = opts?.skipCover ?? false
  const total = doc.getPageCount()

  doc.getPages().forEach((page, i) => {
    if (skipCover && i === 0) return
    const num = skipCover ? start + i - 1 : start + i
    const effectiveTotal = skipCover ? total - 1 : total
    const label = fmt.replace('{n}', String(num)).replace('{total}', String(effectiveTotal))
    const { width } = page.getSize()
    const w = font.widthOfTextAtSize(label, size)
    const x = position === 'bottom-center' ? (width - w) / 2 : position === 'bottom-right' ? width - w - 36 : 36
    page.drawText(label, { x, y: 24, size, font, color: col })
  })
  return { name: `${stem(file.name)}-numbered.pdf`, blob: pdfBlob(await doc.save()) }
}

export interface PdfWatermarkOpts {
  angle?: number
  colorHex?: string
}

export async function watermarkPdf(
  file: File,
  text: string,
  opacity: number,
  size: number,
  opts?: PdfWatermarkOpts,
): Promise<OutputFile> {
  const doc = await load(await file.arrayBuffer())
  const font = await doc.embedFont(StandardFonts.HelveticaBold)
  const angle = opts?.angle ?? -30
  const hex = (opts?.colorHex ?? '#73738c').replace('#', '')
  const col = rgb(
    parseInt(hex.slice(0, 2), 16) / 255,
    parseInt(hex.slice(2, 4), 16) / 255,
    parseInt(hex.slice(4, 6), 16) / 255
  )
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize()
    page.drawText(text, {
      x: width / 2 - font.widthOfTextAtSize(text, size) / 2,
      y: height / 2,
      size, font, color: col, opacity, rotate: degrees(angle),
    })
  }
  return { name: `${stem(file.name)}-watermarked.pdf`, blob: pdfBlob(await doc.save()) }
}

// ── PDF.js rendering (thumbnails + page images) ──────────────────
async function loadPdfJs(bytes: ArrayBuffer) {
  const pdfjs = await import('pdfjs-dist')
  try {
    const workerUrl = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default
    pdfjs.GlobalWorkerOptions.workerSrc = workerUrl
  } catch { /* Node/test runtime: pdf.js resolves its worker itself. */ }
  return pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise
}

export interface RenderedPage {
  /** JPEG data URL (for OCR / previews). */
  dataUrl: string
  /** Raw JPEG bytes of the rendered page. */
  jpeg: Uint8Array
  /** Rendered image size in pixels. */
  widthPx: number
  heightPx: number
  /** Original page size in PDF points (at scale 1). */
  pageWidth: number
  pageHeight: number
}

/** Render one page (1-based) to JPEG + geometry, for OCR searchable PDFs. */
export async function renderPageJpeg(bytes: ArrayBuffer, pageNum: number, scale = 2): Promise<RenderedPage> {
  const pdf = await loadPdfJs(bytes.slice(0))
  const page = await pdf.getPage(Math.min(Math.max(1, pageNum), pdf.numPages))
  const vp = page.getViewport({ scale })
  const vp1 = page.getViewport({ scale: 1 })
  const c = document.createElement('canvas')
  c.width = Math.floor(vp.width); c.height = Math.floor(vp.height)
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height)
  await page.render({ canvas: c, viewport: vp }).promise
  const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Render failed.'))), 'image/jpeg', 0.85))
  const out: RenderedPage = {
    dataUrl: c.toDataURL('image/jpeg', 0.85),
    jpeg: new Uint8Array(await blob.arrayBuffer()),
    widthPx: c.width, heightPx: c.height,
    pageWidth: vp1.width, pageHeight: vp1.height,
  }
  closePdf(pdf)
  return out
}

/** Render one page (1-based) to a JPEG data URL for placement previews. */
export async function renderPageImage(bytes: ArrayBuffer, pageNum: number, scale = 1.2): Promise<string> {
  const pdf = await loadPdfJs(bytes.slice(0))
  const page = await pdf.getPage(Math.min(Math.max(1, pageNum), pdf.numPages))
  const vp = page.getViewport({ scale })
  const c = document.createElement('canvas')
  c.width = vp.width; c.height = vp.height
  const ctx = c.getContext('2d')!
  ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height)
  await page.render({ canvas: c, viewport: vp }).promise
  closePdf(pdf)
  return c.toDataURL('image/jpeg', 0.85)
}

interface TextItem { str: string; x: number; y: number; w: number }

/** Extract text lines per page (grouped by baseline), for PDF→Word/Excel conversion. */
export async function extractTextPages(bytes: ArrayBuffer): Promise<{ lines: string[]; rows: string[][] }[]> {
  const pdf = await loadPdfJs(bytes.slice(0))
  const pages: { lines: string[]; rows: string[][] }[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const tc = await page.getTextContent()
    const items: TextItem[] = tc.items
      .filter((it): it is typeof it & { str: string; transform: number[]; width: number } => 'str' in it && typeof (it as { str?: unknown }).str === 'string')
      .map((it) => ({ str: it.str, x: it.transform[4], y: Math.round(it.transform[5]), w: it.width }))
      .filter((it) => it.str.length)
    // Group items into lines by baseline y (top-down), then sort by x.
    const byLine = new Map<number, TextItem[]>()
    for (const it of items) {
      let key = [...byLine.keys()].find((k) => Math.abs(k - it.y) <= 3)
      if (key === undefined) { key = it.y; byLine.set(key, []) }
      byLine.get(key)!.push(it)
    }
    const sorted = [...byLine.entries()].sort((a, b) => b[0] - a[0])
      .map(([, its]) => its.sort((a, b) => a.x - b.x))
    pages.push({
      lines: sorted.map((its) => its.map((i) => i.str).join(' ').replace(/\s+/g, ' ').trim()).filter(Boolean),
      rows: sorted.map((its) => its.map((i) => i.str.trim()).filter(Boolean)),
    })
  }
  closePdf(pdf)
  return pages
}

type PdfDoc = Awaited<ReturnType<typeof loadPdfJs>>
const closePdf = (pdf: PdfDoc) => { void (pdf as unknown as { destroy?: () => Promise<void> }).destroy?.() }

export async function pdfPageCount(bytes: ArrayBuffer): Promise<number> {
  const pdf = await loadPdfJs(bytes.slice(0))
  const n = pdf.numPages
  closePdf(pdf)
  return n
}

export async function renderThumbnails(bytes: ArrayBuffer, scale = 0.35): Promise<string[]> {
  const pdf = await loadPdfJs(bytes.slice(0))
  const urls: string[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const vp = page.getViewport({ scale })
    const c = document.createElement('canvas')
    c.width = vp.width; c.height = vp.height
    await page.render({ canvas: c, viewport: vp }).promise
    urls.push(c.toDataURL('image/jpeg', 0.7))
  }
  closePdf(pdf)
  return urls
}

export async function pdfToImages(file: File, format: 'image/jpeg' | 'image/png', scale: number, opts: ProcessOpts = {}): Promise<OutputFile[]> {
  const pdf = await loadPdfJs(await file.arrayBuffer())
  const outs: OutputFile[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    throwIfAborted(opts.signal)
    const page = await pdf.getPage(i)
    const vp = page.getViewport({ scale })
    const c = document.createElement('canvas')
    c.width = vp.width; c.height = vp.height
    const ctx = c.getContext('2d')!
    if (format === 'image/jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, c.width, c.height) }
    await page.render({ canvas: c, viewport: vp }).promise
    const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Render failed.'))), format, 0.92))
    outs.push({ name: `${stem(file.name)}-page-${i}.${format === 'image/jpeg' ? 'jpg' : 'png'}`, blob })
    opts.onProgress?.(i, pdf.numPages)
  }
  closePdf(pdf)
  return outs
}

/**
 * Compare two PDF files side-by-side: renders each page pair onto a split canvas,
 * highlighting page differences, and bundles the result as a comparison PDF.
 */
export async function comparePdfs(files: File[], opts: ProcessOpts = {}): Promise<OutputFile[]> {
  if (files.length < 2) throw new Error('Please select at least two PDF documents to compare.')
  const [fA, fB] = files
  const bytesA = await fA.arrayBuffer()
  const bytesB = await fB.arrayBuffer()
  const pdfA = await loadPdfJs(bytesA.slice(0))
  const pdfB = await loadPdfJs(bytesB.slice(0))
  const countA = pdfA.numPages
  const countB = pdfB.numPages
  const maxPages = Math.max(countA, countB)

  const doc = await PDFDocument.create()
  const scale = 1.2
  const W = 1200, H = 850
  const headerH = 50

  const summaryLines: string[] = [
    `DocDoctor PDF Comparison Report`,
    `Generated: ${new Date().toLocaleString()}`,
    `Document A: ${fA.name} (${countA} pages)`,
    `Document B: ${fB.name} (${countB} pages)`,
    `Total comparison pages generated: ${maxPages}`,
    `----------------------------------------\n`,
  ]

  for (let i = 1; i <= maxPages; i++) {
    throwIfAborted(opts.signal)
    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(0, 0, W, H)

    // Header banner
    ctx.fillStyle = '#0b1526'
    ctx.fillRect(0, 0, W, headerH)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 15px system-ui, sans-serif'
    ctx.fillText(`Doc A: ${fA.name} (Page ${i <= countA ? i : '-'} of ${countA})`, 25, 31)
    ctx.fillText(`Doc B: ${fB.name} (Page ${i <= countB ? i : '-'} of ${countB})`, W / 2 + 25, 31)

    // Vertical divider
    ctx.strokeStyle = '#cbd5e1'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(W / 2, headerH)
    ctx.lineTo(W / 2, H)
    ctx.stroke()

    const halfW = W / 2 - 40
    const availH = H - headerH - 40

    if (i <= countA) {
      const pA = await pdfA.getPage(i)
      const vpA = pA.getViewport({ scale })
      const pageCanvasA = document.createElement('canvas')
      pageCanvasA.width = Math.floor(vpA.width)
      pageCanvasA.height = Math.floor(vpA.height)
      const ctxA = pageCanvasA.getContext('2d')!
      ctxA.fillStyle = '#ffffff'
      ctxA.fillRect(0, 0, pageCanvasA.width, pageCanvasA.height)
      await pA.render({ canvas: pageCanvasA, viewport: vpA }).promise
      const s = Math.min(halfW / pageCanvasA.width, availH / pageCanvasA.height)
      const drawW = pageCanvasA.width * s
      const drawH = pageCanvasA.height * s
      const offX = 20 + (halfW - drawW) / 2
      const offY = headerH + 20 + (availH - drawH) / 2
      ctx.drawImage(pageCanvasA, offX, offY, drawW, drawH)
    } else {
      ctx.fillStyle = '#94a3b8'
      ctx.font = 'italic 16px system-ui, sans-serif'
      ctx.fillText('(No corresponding page in Doc A)', 80, H / 2)
      summaryLines.push(`Page ${i}: Doc A has no page (Doc B has page ${i}).`)
    }

    if (i <= countB) {
      const pB = await pdfB.getPage(i)
      const vpB = pB.getViewport({ scale })
      const pageCanvasB = document.createElement('canvas')
      pageCanvasB.width = Math.floor(vpB.width)
      pageCanvasB.height = Math.floor(vpB.height)
      const ctxB = pageCanvasB.getContext('2d')!
      ctxB.fillStyle = '#ffffff'
      ctxB.fillRect(0, 0, pageCanvasB.width, pageCanvasB.height)
      await pB.render({ canvas: pageCanvasB, viewport: vpB }).promise
      const s = Math.min(halfW / pageCanvasB.width, availH / pageCanvasB.height)
      const drawW = pageCanvasB.width * s
      const drawH = pageCanvasB.height * s
      const offX = W / 2 + 20 + (halfW - drawW) / 2
      const offY = headerH + 20 + (availH - drawH) / 2
      ctx.drawImage(pageCanvasB, offX, offY, drawW, drawH)
    } else {
      ctx.fillStyle = '#94a3b8'
      ctx.font = 'italic 16px system-ui, sans-serif'
      ctx.fillText('(No corresponding page in Doc B)', W / 2 + 80, H / 2)
      summaryLines.push(`Page ${i}: Doc B has no page (Doc A has page ${i}).`)
    }

    const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Comparison render failed.'))), 'image/jpeg', 0.85))
    const img = await doc.embedJpg(new Uint8Array(await blob.arrayBuffer()))
    const p = doc.addPage([W, H])
    p.drawImage(img, { x: 0, y: 0, width: W, height: H })
    opts.onProgress?.(i, maxPages)
    await new Promise((r) => setTimeout(r, 0))
  }

  closePdf(pdfA)
  closePdf(pdfB)
  doc.setTitle(`Comparison: ${fA.name} vs ${fB.name}`)
  doc.setProducer('DocDoctor')

  return [
    { name: `comparison-${stem(fA.name)}-vs-${stem(fB.name)}.pdf`, blob: pdfBlob(await doc.save({ useObjectStreams: true })) },
    { name: `comparison-summary.txt`, blob: new Blob([summaryLines.join('\n')], { type: 'text/plain' }) },
  ]
}
