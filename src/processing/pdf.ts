import { PDFDocument, degrees, rgb, StandardFonts, PDFName, PDFNumber, PDFRawStream, PDFString, PDFArray } from 'pdf-lib'
import type { OutputFile } from './download'
import { stem } from './download'

const pdfBlob = (bytes: Uint8Array): Blob =>
  new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' })

async function load(bytes: ArrayBuffer) {
  return PDFDocument.load(bytes, { ignoreEncryption: false })
}

/** Convert positive integer to Roman numerals (lower or upper). */
export function toRoman(num: number, upper = false): string {
  const n = Math.max(1, Math.min(3999, Math.floor(num)))
  const pairs: [number, string][] = [
    [1000, 'm'], [900, 'cm'], [500, 'd'], [400, 'cd'],
    [100, 'c'], [90, 'xc'], [50, 'l'], [40, 'xl'],
    [10, 'x'], [9, 'ix'], [5, 'v'], [4, 'iv'], [1, 'i'],
  ]
  let out = ''
  let rem = n
  for (const [val, sym] of pairs) {
    while (rem >= val) { out += sym; rem -= val }
  }
  return upper ? out.toUpperCase() : out
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

export interface MergePdfOpts {
  /** Optional per-file 1-based page range string, keyed by file index. */
  fileRanges?: Record<number, string>
  /** Add PDF Outline bookmarks for each source document. */
  addBookmarks?: boolean
}

export async function mergePdfs(files: File[], opts?: MergePdfOpts): Promise<OutputFile> {
  if (files.length < 2) throw new Error('Select at least two PDFs to merge.')
  const out = await PDFDocument.create()
  const bookmarkEntries: { title: string; pageIndex: number }[] = []

  for (let fi = 0; fi < files.length; fi++) {
    const f = files[fi]
    const src = await load(await f.arrayBuffer())
    const rangeStr = opts?.fileRanges?.[fi]?.trim()
    const indices = rangeStr ? parseRanges(rangeStr, src.getPageCount()) : src.getPageIndices()
    const startPageIndex = out.getPageCount()
    const pages = await out.copyPages(src, indices)
    pages.forEach((p) => out.addPage(p))
    bookmarkEntries.push({ title: stem(f.name) || `Document ${fi + 1}`, pageIndex: startPageIndex })
  }

  // Attach top-level PDF Outlines (bookmarks) pointing to each merged file's starting page
  if (opts?.addBookmarks !== false && bookmarkEntries.length > 0 && out.getPageCount() > 0) {
    try {
      const ctx = out.context
      const outlinesRef = ctx.nextRef()
      const itemRefs = bookmarkEntries.map(() => ctx.nextRef())
      const pages = out.getPages()

      bookmarkEntries.forEach((entry, i) => {
        const targetPage = pages[Math.min(entry.pageIndex, pages.length - 1)]
        const destArray = PDFArray.withContext(ctx)
        destArray.push(targetPage.ref)
        destArray.push(PDFName.of('XYZ'))
        destArray.push(ctx.obj(null))
        destArray.push(ctx.obj(null))
        destArray.push(ctx.obj(null))

        const itemDict = ctx.obj({
          Title: PDFString.of(entry.title),
          Parent: outlinesRef,
          Dest: destArray,
        })
        if (i > 0) itemDict.set(PDFName.of('Prev'), itemRefs[i - 1])
        if (i < bookmarkEntries.length - 1) itemDict.set(PDFName.of('Next'), itemRefs[i + 1])
        ctx.assign(itemRefs[i], itemDict)
      })

      ctx.assign(outlinesRef, ctx.obj({
        Type: PDFName.of('Outlines'),
        First: itemRefs[0],
        Last: itemRefs[itemRefs.length - 1],
        Count: PDFNumber.of(itemRefs.length),
      }))
      out.catalog.set(PDFName.of('Outlines'), outlinesRef)
    } catch {
      // Non-fatal if outline injection fails
    }
  }

  return { name: 'merged.pdf', blob: pdfBlob(await out.save()) }
}

export interface SplitPdfOpts {
  mode?: 'ranges' | 'every-n' | 'all-individual'
  everyN?: number
}

export async function splitPdf(file: File, ranges: string, opts?: SplitPdfOpts): Promise<OutputFile[]> {
  const src = await load(await file.arrayBuffer())
  const totalPages = src.getPageCount()
  const outs: OutputFile[] = []

  if (opts?.mode === 'all-individual') {
    for (let p = 0; p < totalPages; p++) {
      const doc = await PDFDocument.create()
      ;(await doc.copyPages(src, [p])).forEach((page) => doc.addPage(page))
      outs.push({ name: `${stem(file.name)}-page-${p + 1}.pdf`, blob: pdfBlob(await doc.save()) })
    }
    return outs
  }

  if (opts?.mode === 'every-n') {
    const step = Math.max(1, Math.floor(opts.everyN ?? 1))
    let part = 1
    for (let start = 0; start < totalPages; start += step) {
      const idx: number[] = []
      for (let j = start; j < Math.min(totalPages, start + step); j++) idx.push(j)
      const doc = await PDFDocument.create()
      ;(await doc.copyPages(src, idx)).forEach((page) => doc.addPage(page))
      outs.push({ name: `${stem(file.name)}-part${part++}.pdf`, blob: pdfBlob(await doc.save()) })
    }
    return outs
  }

  const groups = ranges.split(';').map((s) => s.trim()).filter(Boolean)
  if (groups.length <= 1 && !ranges.includes(';')) {
    // Single range field may contain commas = one output with those pages.
    const idx = parseRanges(ranges, totalPages)
    const doc = await PDFDocument.create()
    ;(await doc.copyPages(src, idx)).forEach((p) => doc.addPage(p))
    outs.push({ name: `${stem(file.name)}-pages.pdf`, blob: pdfBlob(await doc.save()) })
    return outs
  }
  for (let i = 0; i < groups.length; i++) {
    const idx = parseRanges(groups[i], totalPages)
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

export interface RotatePdfOpts {
  filter?: 'all' | 'odd' | 'even' | 'landscape' | 'portrait' | 'custom'
  customRanges?: string
}

export async function rotatePdf(
  file: File,
  deg: number,
  pages: number[] | 'all',
  opts?: RotatePdfOpts,
): Promise<OutputFile> {
  const doc = await load(await file.arrayBuffer())
  const total = doc.getPageCount()
  let targets: number[]
  if (opts?.filter && opts.filter !== 'all') {
    if (opts.filter === 'odd') {
      targets = doc.getPageIndices().filter((i) => (i + 1) % 2 === 1)
    } else if (opts.filter === 'even') {
      targets = doc.getPageIndices().filter((i) => (i + 1) % 2 === 0)
    } else if (opts.filter === 'landscape') {
      targets = doc.getPageIndices().filter((i) => {
        const { width, height } = doc.getPage(i).getSize()
        return width > height
      })
    } else if (opts.filter === 'portrait') {
      targets = doc.getPageIndices().filter((i) => {
        const { width, height } = doc.getPage(i).getSize()
        return height >= width
      })
    } else if (opts.filter === 'custom' && opts.customRanges?.trim()) {
      targets = parseRanges(opts.customRanges, total)
    } else {
      targets = doc.getPageIndices()
    }
  } else {
    targets = pages === 'all' ? doc.getPageIndices() : pages
  }
  for (const i of targets) {
    if (i < 0 || i >= total) continue
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

export type PageNumberPosition =
  | 'bottom-center' | 'bottom-right' | 'bottom-left'
  | 'top-center' | 'top-right' | 'top-left'

export interface PageNumberOpts {
  fontSize?: number
  colorHex?: string
  skipCover?: boolean
  fontFamily?: 'Helvetica' | 'TimesRoman' | 'Courier'
  numStyle?: 'arabic' | 'roman-lower' | 'roman-upper'
  pageRange?: string
  marginPt?: number
}

export async function addPageNumbers(
  file: File,
  position: PageNumberPosition,
  start: number,
  fmt: string,
  opts?: PageNumberOpts,
): Promise<OutputFile> {
  const doc = await load(await file.arrayBuffer())
  const fontName = opts?.fontFamily === 'TimesRoman'
    ? StandardFonts.TimesRoman
    : opts?.fontFamily === 'Courier'
      ? StandardFonts.Courier
      : StandardFonts.Helvetica
  const font = await doc.embedFont(fontName)
  const size = opts?.fontSize ?? 10
  const hex = (opts?.colorHex ?? '#596173').replace('#', '').padEnd(6, '0')
  const col = rgb(
    parseInt(hex.slice(0, 2), 16) / 255,
    parseInt(hex.slice(2, 4), 16) / 255,
    parseInt(hex.slice(4, 6), 16) / 255
  )
  const skipCover = opts?.skipCover ?? false
  const total = doc.getPageCount()
  const allowedSet = opts?.pageRange?.trim()
    ? new Set(parseRanges(opts.pageRange, total))
    : null
  const margin = opts?.marginPt ?? 24
  const fmtNum = (n: number) => {
    if (opts?.numStyle === 'roman-lower') return toRoman(n, false)
    if (opts?.numStyle === 'roman-upper') return toRoman(n, true)
    return String(n)
  }

  doc.getPages().forEach((page, i) => {
    if (skipCover && i === 0) return
    if (allowedSet && !allowedSet.has(i)) return
    const num = skipCover ? start + i - 1 : start + i
    const effectiveTotal = skipCover ? Math.max(1, total - 1) : total
    const label = fmt.replace('{n}', fmtNum(num)).replace('{total}', fmtNum(effectiveTotal))
    const { width, height } = page.getSize()
    const w = font.widthOfTextAtSize(label, size)
    const isTop = position.startsWith('top-')
    const isCenter = position.endsWith('-center')
    const isRight = position.endsWith('-right')
    const x = isCenter ? (width - w) / 2 : isRight ? width - w - Math.max(24, margin + 12) : Math.max(24, margin + 12)
    const y = isTop ? height - margin - size : margin
    page.drawText(label, { x, y, size, font, color: col })
  })
  return { name: `${stem(file.name)}-numbered.pdf`, blob: pdfBlob(await doc.save()) }
}

export type PdfWatermarkPosition = 'center' | 'tile' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right'

export interface PdfWatermarkOpts {
  angle?: number
  colorHex?: string
  position?: PdfWatermarkPosition
  imageBytes?: Uint8Array
  imageMime?: 'image/png' | 'image/jpeg'
  imageScale?: number
}

export async function watermarkPdf(
  file: File,
  text: string,
  opacity: number,
  size: number,
  opts?: PdfWatermarkOpts,
): Promise<OutputFile> {
  const doc = await load(await file.arrayBuffer())
  const angle = opts?.angle ?? -30
  const pos: PdfWatermarkPosition = opts?.position ?? 'center'

  if (opts?.imageBytes && opts.imageBytes.length > 0) {
    const img = opts.imageMime === 'image/png'
      ? await doc.embedPng(opts.imageBytes)
      : await doc.embedJpg(opts.imageBytes)
    const scaleRatio = Math.max(0.08, Math.min(0.85, opts.imageScale ?? 0.28))

    for (const page of doc.getPages()) {
      const { width, height } = page.getSize()
      const drawW = width * scaleRatio
      const drawH = (img.height / Math.max(1, img.width)) * drawW

      if (pos === 'tile') {
        const stepX = Math.max(140, drawW + 90)
        const stepY = Math.max(120, drawH + 90)
        for (let y = 36; y < height - 20; y += stepY) {
          for (let x = 36; x < width - 20; x += stepX) {
            page.drawImage(img, { x, y, width: drawW, height: drawH, opacity, rotate: degrees(angle) })
          }
        }
      } else {
        const x = pos === 'center' ? (width - drawW) / 2
          : (pos === 'top-right' || pos === 'bottom-right') ? width - drawW - 36 : 36
        const y = pos === 'center' ? (height - drawH) / 2
          : (pos === 'top-left' || pos === 'top-right') ? height - drawH - 36 : 36
        page.drawImage(img, { x, y, width: drawW, height: drawH, opacity, rotate: degrees(angle) })
      }
    }
    return { name: `${stem(file.name)}-watermarked.pdf`, blob: pdfBlob(await doc.save()) }
  }

  const font = await doc.embedFont(StandardFonts.HelveticaBold)
  const hex = (opts?.colorHex ?? '#73738c').replace('#', '').padEnd(6, '0')
  const col = rgb(
    parseInt(hex.slice(0, 2), 16) / 255,
    parseInt(hex.slice(2, 4), 16) / 255,
    parseInt(hex.slice(4, 6), 16) / 255
  )
  const wmLabel = text || 'CONFIDENTIAL'
  for (const page of doc.getPages()) {
    const { width, height } = page.getSize()
    const textW = font.widthOfTextAtSize(wmLabel, size)
    if (pos === 'tile') {
      const stepX = Math.max(160, textW + 100)
      const stepY = Math.max(110, size * 3.5)
      for (let y = 40; y < height; y += stepY) {
        for (let x = 30; x < width; x += stepX) {
          page.drawText(wmLabel, { x, y, size, font, color: col, opacity, rotate: degrees(angle) })
        }
      }
    } else {
      const x = pos === 'center' ? width / 2 - textW / 2
        : (pos === 'top-right' || pos === 'bottom-right') ? Math.max(24, width - textW - 36) : 36
      const y = pos === 'center' ? height / 2
        : (pos === 'top-left' || pos === 'top-right') ? height - size - 36 : 36
      page.drawText(wmLabel, {
        x,
        y,
        size,
        font,
        color: col,
        opacity,
        rotate: degrees(pos === 'center' ? angle : 0),
      })
    }
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

export interface RichTextLine {
  text: string
  fontSize: number
  isBold: boolean
  x: number
  y: number
  pageWidth: number
  pageHeight: number
  cells: string[]
}

interface TextItem {
  str: string
  x: number
  y: number
  w: number
  fontSize: number
  isBold: boolean
}

/** Extract text lines per page (grouped by baseline) with style & column metadata, for PDF→Word/Excel/PPTX conversion. */
export async function extractTextPages(bytes: ArrayBuffer): Promise<{ lines: string[]; rows: string[][]; richLines: RichTextLine[] }[]> {
  const pdf = await loadPdfJs(bytes.slice(0))
  const pages: { lines: string[]; rows: string[][]; richLines: RichTextLine[] }[] = []
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const vp1 = page.getViewport({ scale: 1 })
    const tc = await page.getTextContent()
    const styles = (tc as unknown as { styles?: Record<string, { fontFamily?: string }> }).styles ?? {}
    const items: TextItem[] = tc.items
      .filter((it): it is typeof it & { str: string; transform: number[]; width: number; fontName?: string } => 'str' in it && typeof (it as { str?: unknown }).str === 'string')
      .map((it) => {
        const fontSize = Math.max(6, Math.round(Math.hypot(it.transform[0] || 0, it.transform[1] || 0) || Math.abs(it.transform[3] || 11)))
        const fontRef = `${it.fontName ?? ''} ${styles[it.fontName ?? '']?.fontFamily ?? ''}`
        const isBold = /bold|black|heavy|demi/i.test(fontRef)
        return {
          str: it.str,
          x: it.transform[4],
          y: Math.round(it.transform[5]),
          w: it.width || it.str.length * (fontSize * 0.5),
          fontSize,
          isBold,
        }
      })
      .filter((it) => it.str.length > 0)
    // Group items into lines by baseline y (top-down), then sort by x.
    const byLine = new Map<number, TextItem[]>()
    for (const it of items) {
      let key = [...byLine.keys()].find((k) => Math.abs(k - it.y) <= 3)
      if (key === undefined) { key = it.y; byLine.set(key, []) }
      byLine.get(key)!.push(it)
    }
    const sorted = [...byLine.entries()].sort((a, b) => b[0] - a[0])
      .map(([, its]) => its.sort((a, b) => a.x - b.x))

    const richLines: RichTextLine[] = []
    for (const its of sorted) {
      const text = its.map((it) => it.str).join(' ').replace(/\s+/g, ' ').trim()
      if (!text) continue
      // Group items into tabular cells when horizontal gap > 16pt
      const cells: string[] = []
      let curCell = ''
      let prevEnd: number | null = null
      for (const it of its) {
        if (prevEnd !== null && it.x - prevEnd > 16) {
          if (curCell.trim()) cells.push(curCell.trim())
          curCell = it.str
        } else {
          curCell = curCell ? `${curCell} ${it.str}`.replace(/\s+/g, ' ') : it.str
        }
        prevEnd = it.x + Math.max(4, it.w)
      }
      if (curCell.trim()) cells.push(curCell.trim())

      const maxFont = Math.max(...its.map((it) => it.fontSize))
      const boldCount = its.filter((it) => it.isBold).length
      richLines.push({
        text,
        fontSize: maxFont,
        isBold: boldCount >= Math.ceil(its.length / 2),
        x: its[0].x,
        y: its[0].y,
        pageWidth: vp1.width || 595,
        pageHeight: vp1.height || 842,
        cells: cells.length ? cells : [text],
      })
    }

    pages.push({
      lines: richLines.map((l) => l.text),
      rows: richLines.map((l) => l.cells),
      richLines,
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

/** Compute line-level additions and removals between two page line arrays. */
export function diffPageLines(linesA: string[], linesB: string[]): {
  identical: boolean
  added: string[]
  removed: string[]
  unchangedCount: number
} {
  const norm = (s: string) => s.replace(/\s+/g, ' ').trim()
  const aNorm = linesA.map(norm).filter(Boolean)
  const bNorm = linesB.map(norm).filter(Boolean)
  const countMapA = new Map<string, number>()
  const countMapB = new Map<string, number>()
  for (const l of aNorm) countMapA.set(l, (countMapA.get(l) ?? 0) + 1)
  for (const l of bNorm) countMapB.set(l, (countMapB.get(l) ?? 0) + 1)

  const removed: string[] = []
  const added: string[] = []
  let unchangedCount = 0

  const usedB = new Map<string, number>()
  for (const l of aNorm) {
    const inB = countMapB.get(l) ?? 0
    const used = usedB.get(l) ?? 0
    if (used < inB) {
      usedB.set(l, used + 1)
      unchangedCount++
    } else {
      removed.push(l)
    }
  }
  const usedA = new Map<string, number>()
  for (const l of bNorm) {
    const inA = countMapA.get(l) ?? 0
    const used = usedA.get(l) ?? 0
    if (used < inA) {
      usedA.set(l, used + 1)
    } else {
      added.push(l)
    }
  }

  return {
    identical: removed.length === 0 && added.length === 0 && aNorm.length === bNorm.length,
    added,
    removed,
    unchangedCount,
  }
}

export interface ComparePdfOpts extends ProcessOpts {
  highlightPixelDiff?: boolean
}

/**
 * Compare two PDF files side-by-side: renders each page pair onto a split canvas,
 * highlighting page differences + pixel-level visual diffs + text diffs, and bundles the result as a comparison PDF + text diff report.
 */
export async function comparePdfs(files: File[], opts: ComparePdfOpts = {}): Promise<OutputFile[]> {
  if (files.length < 2) throw new Error('Please select at least two PDF documents to compare.')
  const [fA, fB] = files
  const bytesA = await fA.arrayBuffer()
  const bytesB = await fB.arrayBuffer()
  const [textPagesA, textPagesB] = await Promise.all([
    extractTextPages(bytesA.slice(0)).catch(() => []),
    extractTextPages(bytesB.slice(0)).catch(() => []),
  ])
  const pdfA = await loadPdfJs(bytesA.slice(0))
  const pdfB = await loadPdfJs(bytesB.slice(0))
  const countA = pdfA.numPages
  const countB = pdfB.numPages
  const maxPages = Math.max(countA, countB)

  const doc = await PDFDocument.create()
  const scale = 1.2
  const W = 1200, H = 900
  const headerH = 52
  const footerH = 68

  let identicalPages = 0
  let changedPages = 0

  const summaryLines: string[] = [
    `DocDoctor PDF Comparison & Text/Visual Diff Report`,
    `Generated: ${new Date().toLocaleString()}`,
    `Document A: ${fA.name} (${countA} pages)`,
    `Document B: ${fB.name} (${countB} pages)`,
    `Total comparison pages generated: ${maxPages}`,
    `========================================\n`,
  ]

  for (let i = 1; i <= maxPages; i++) {
    throwIfAborted(opts.signal)
    const linesA = textPagesA[i - 1]?.lines ?? []
    const linesB = textPagesB[i - 1]?.lines ?? []
    const diff = diffPageLines(linesA, linesB)
    const bothExist = i <= countA && i <= countB

    const c = document.createElement('canvas')
    c.width = W
    c.height = H
    const ctx = c.getContext('2d')!
    ctx.fillStyle = '#f8fafc'
    ctx.fillRect(0, 0, W, H)

    const halfW = W / 2 - 40
    const availH = H - headerH - footerH - 30
    let pageCanvasA: HTMLCanvasElement | null = null

    if (i <= countA) {
      const pA = await pdfA.getPage(i)
      const vpA = pA.getViewport({ scale })
      pageCanvasA = document.createElement('canvas')
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
      const offY = headerH + 15 + (availH - drawH) / 2
      ctx.drawImage(pageCanvasA, offX, offY, drawW, drawH)
    } else {
      ctx.fillStyle = '#94a3b8'
      ctx.font = 'italic 16px system-ui, sans-serif'
      ctx.fillText('(No corresponding page in Doc A)', 80, (H - footerH) / 2)
    }

    let pixelDiffPct = 0
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

      // Compute pixel-level visual difference and optionally highlight changed pixels on Doc B
      if (pageCanvasA && opts.highlightPixelDiff !== false) {
        try {
          const cmpW = Math.min(pageCanvasA.width, pageCanvasB.width)
          const cmpH = Math.min(pageCanvasA.height, pageCanvasB.height)
          const dataA = pageCanvasA.getContext('2d')!.getImageData(0, 0, cmpW, cmpH).data
          const imgDataB = ctxB.getImageData(0, 0, cmpW, cmpH)
          const dataB = imgDataB.data
          let diffPixels = 0
          const totalPixels = Math.max(1, cmpW * cmpH)
          for (let p = 0; p < dataB.length; p += 4) {
            const dr = Math.abs(dataA[p] - dataB[p])
            const dg = Math.abs(dataA[p + 1] - dataB[p + 1])
            const db = Math.abs(dataA[p + 2] - dataB[p + 2])
            if (dr + dg + db > 48) {
              diffPixels++
              // Tint changed pixel with semi-transparent magenta-red highlight
              dataB[p] = Math.min(255, Math.round(dataB[p] * 0.45 + 239 * 0.55))
              dataB[p + 1] = Math.round(dataB[p + 1] * 0.35 + 68 * 0.2)
              dataB[p + 2] = Math.round(dataB[p + 2] * 0.35 + 68 * 0.2)
            }
          }
          pixelDiffPct = Math.round((diffPixels / totalPixels) * 1000) / 10
          if (diffPixels > 0) {
            ctxB.putImageData(imgDataB, 0, 0)
          }
        } catch {
          // Ignore canvas readback errors
        }
      }

      const s = Math.min(halfW / pageCanvasB.width, availH / pageCanvasB.height)
      const drawW = pageCanvasB.width * s
      const drawH = pageCanvasB.height * s
      const offX = W / 2 + 20 + (halfW - drawW) / 2
      const offY = headerH + 15 + (availH - drawH) / 2
      ctx.drawImage(pageCanvasB, offX, offY, drawW, drawH)
    } else {
      ctx.fillStyle = '#94a3b8'
      ctx.font = 'italic 16px system-ui, sans-serif'
      ctx.fillText('(No corresponding page in Doc B)', W / 2 + 80, (H - footerH) / 2)
    }

    const isMatch = bothExist && diff.identical && pixelDiffPct < 0.2
    if (isMatch) identicalPages++
    else changedPages++

    // Header banner
    ctx.fillStyle = '#0b1526'
    ctx.fillRect(0, 0, W, headerH)
    ctx.fillStyle = '#ffffff'
    ctx.font = 'bold 14px system-ui, sans-serif'
    ctx.fillText(`Doc A: ${fA.name} (Page ${i <= countA ? i : '-'} of ${countA})`, 24, 31)
    ctx.fillText(`Doc B: ${fB.name} (Page ${i <= countB ? i : '-'} of ${countB})`, W / 2 + 24, 31)

    // Status pill in center of header
    const badgeText = isMatch
      ? '✓ MATCH'
      : !bothExist
        ? '⚠ PAGE COUNT DIFF'
        : diff.identical && pixelDiffPct > 0
          ? `⚠ VISUAL DIFF (${pixelDiffPct}% px)`
          : `⚠ ${diff.removed.length} REM · ${diff.added.length} ADD${pixelDiffPct > 0 ? ` · ${pixelDiffPct}% PX` : ''}`
    ctx.fillStyle = isMatch ? '#10b981' : '#f59e0b'
    ctx.fillRect(W / 2 - 125, 12, 250, 28)
    ctx.fillStyle = '#0b1526'
    ctx.font = 'bold 11px system-ui, sans-serif'
    ctx.fillText(badgeText, W / 2 - 112, 30)

    // Vertical divider
    ctx.strokeStyle = '#cbd5e1'
    ctx.lineWidth = 2
    ctx.beginPath()
    ctx.moveTo(W / 2, headerH)
    ctx.lineTo(W / 2, H - footerH)
    ctx.stroke()

    // Bottom text-diff strip on canvas
    ctx.fillStyle = isMatch ? '#ecfdf5' : '#fffbeb'
    ctx.fillRect(0, H - footerH, W, footerH)
    ctx.strokeStyle = isMatch ? '#a7f3d0' : '#fde68a'
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.moveTo(0, H - footerH)
    ctx.lineTo(W, H - footerH)
    ctx.stroke()

    ctx.font = '12px monospace'
    if (isMatch) {
      ctx.fillStyle = '#065f46'
      ctx.fillText(`Page ${i}: All ${diff.unchangedCount} text line(s) and visual layout match between Document A and Document B.`, 24, H - footerH + 38)
    } else {
      ctx.fillStyle = '#991b1b'
      const remPreview = diff.removed[0] ? `- ${diff.removed[0].slice(0, 75)}` : `(Visual pixel diff: ${pixelDiffPct}% changed)`
      ctx.fillText(remPreview, 24, H - footerH + 26)
      ctx.fillStyle = '#065f46'
      const addPreview = diff.added[0] ? `+ ${diff.added[0].slice(0, 75)}` : '(no lines added)'
      ctx.fillText(addPreview, 24, H - footerH + 48)
    }

    // Append detailed text diff to summary report
    summaryLines.push(`--- Page ${i} ---`)
    if (i > countA) {
      summaryLines.push(`Status: Added page in Document B (Document A has only ${countA} pages).`)
      diff.added.slice(0, 30).forEach((l) => summaryLines.push(`  + ${l}`))
    } else if (i > countB) {
      summaryLines.push(`Status: Removed page in Document B (Document B has only ${countB} pages).`)
      diff.removed.slice(0, 30).forEach((l) => summaryLines.push(`  - ${l}`))
    } else if (isMatch) {
      summaryLines.push(`Status: IDENTICAL (${diff.unchangedCount} lines matched, 0% visual diff)`)
    } else {
      summaryLines.push(`Status: MODIFIED (${diff.unchangedCount} unchanged, ${diff.removed.length} removed, ${diff.added.length} added, ${pixelDiffPct}% visual pixel diff)`)
      diff.removed.slice(0, 30).forEach((l) => summaryLines.push(`  - [Doc A] ${l}`))
      diff.added.slice(0, 30).forEach((l) => summaryLines.push(`  + [Doc B] ${l}`))
    }
    summaryLines.push('')

    const blob = await new Promise<Blob>((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Comparison render failed.'))), 'image/jpeg', 0.85))
    const img = await doc.embedJpg(new Uint8Array(await blob.arrayBuffer()))
    const p = doc.addPage([W, H])
    p.drawImage(img, { x: 0, y: 0, width: W, height: H })
    opts.onProgress?.(i, maxPages)
    await new Promise((r) => setTimeout(r, 0))
  }

  summaryLines.splice(5, 0, `Summary: ${identicalPages} identical page(s), ${changedPages} page(s) with differences`)

  closePdf(pdfA)
  closePdf(pdfB)
  doc.setTitle(`Comparison: ${fA.name} vs ${fB.name}`)
  doc.setProducer('DocDoctor')

  return [
    { name: `comparison-${stem(fA.name)}-vs-${stem(fB.name)}.pdf`, blob: pdfBlob(await doc.save({ useObjectStreams: true })) },
    { name: `comparison-summary.txt`, blob: new Blob([summaryLines.join('\n')], { type: 'text/plain' }) },
  ]
}
