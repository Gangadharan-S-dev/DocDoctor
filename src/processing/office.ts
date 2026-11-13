import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { OutputFile } from './download'
import { stem } from './download'

const blobOf = (bytes: Uint8Array, type: string) => new Blob([bytes.buffer as ArrayBuffer], { type })
export const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
export const PPTX_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

export interface OfficeMediaSummary {
  count: number
  mediaBytes: number
  totalBytes: number
}

/** Inspect an OOXML archive (DOCX/PPTX/XLSX) to report embedded media count and byte size. */
export async function inspectOfficeMedia(file: File): Promise<OfficeMediaSummary> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  let count = 0
  let mediaBytes = 0
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue
    if (/\/media\/[^/]+\.(jpe?g|png|gif|webp|bmp|tiff?)$/i.test(path)) {
      count++
      const bytes = await entry.async('uint8array')
      mediaBytes += bytes.byteLength
    }
  }
  return { count, mediaBytes, totalBytes: file.size }
}

export interface RecompressOpts {
  quality?: number
  maxEdge?: number
}

// ── Shared: recompress any OOXML/ZIP package at max DEFLATE with media optimization ──
export async function recompressPackage(
  file: File,
  outName: string,
  type: string,
  opts?: RecompressOpts,
): Promise<OutputFile> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const out = new JSZip()
  const canRecompress = typeof document !== 'undefined' && typeof createImageBitmap !== 'undefined'
  const targetQuality = opts?.quality ?? 0.68
  const maxEdge = opts?.maxEdge ?? 1600

  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue
    const isMediaImage = /\/media\/[^/]+\.(jpe?g|png)$/i.test(path)
    const oldBytes = await entry.async('uint8array')

    if (isMediaImage && canRecompress && oldBytes.length > 15_000) {
      try {
        const isJpeg = /\.jpe?g$/i.test(path)
        const mime = isJpeg ? 'image/jpeg' : 'image/png'
        const bmp = await createImageBitmap(new Blob([oldBytes.slice().buffer as ArrayBuffer], { type: mime }))
        let w = bmp.width, h = bmp.height
        if (maxEdge > 0 && Math.max(w, h) > maxEdge) {
          const s = maxEdge / Math.max(w, h)
          w = Math.max(1, Math.round(w * s))
          h = Math.max(1, Math.round(h * s))
        }
        const c = document.createElement('canvas')
        c.width = w
        c.height = h
        const ctx = c.getContext('2d')
        if (ctx) {
          if (isJpeg) {
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(0, 0, w, h)
          }
          ctx.drawImage(bmp, 0, 0, w, h)
          bmp.close()
          const outMime = isJpeg ? 'image/jpeg' : 'image/png'
          const newBlob = await new Promise<Blob | null>((res) => c.toBlob(res, outMime, isJpeg ? targetQuality : undefined))
          if (newBlob) {
            const newBytes = new Uint8Array(await newBlob.arrayBuffer())
            if (newBytes.length < oldBytes.length * 0.92) {
              out.file(path, newBytes)
              continue
            }
          }
        } else {
          bmp.close()
        }
      } catch {
        // Fall back to original bytes on media parse failure
      }
    }

    out.file(path, oldBytes)
  }

  const blob = await out.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 9 } })

  // Guarantee: Never return a file larger than input
  if (blob.size >= file.size) {
    return { name: outName, blob: file }
  }
  return { name: outName, blob: new Blob([blob], { type }) }
}

async function mammoth() {
  return (await import('mammoth')) as unknown as {
    extractRawText: (i: never) => Promise<{ value: string }>
    convertToHtml: (i: never) => Promise<{ value: string }>
  }
}

/** Browser mammoth wants {arrayBuffer}; the Node build wants {buffer}. Pick per runtime. */
const mammothInput = (buf: ArrayBuffer): never =>
  (typeof Buffer !== 'undefined' ? { buffer: Buffer.from(buf) } : { arrayBuffer: buf }) as never

// ── Word ─────────────────────────────────────────────────────────
export async function wordToText(file: File): Promise<OutputFile> {
  const m = await mammoth()
  const { value } = await m.extractRawText(mammothInput(await file.arrayBuffer()))
  return { name: `${stem(file.name)}.txt`, blob: new Blob([value], { type: 'text/plain' }) }
}

export async function wordExtractText(file: File): Promise<string> {
  const m = await mammoth()
  const { value } = await m.extractRawText(mammothInput(await file.arrayBuffer()))
  return value
}

export async function wordToHtml(file: File): Promise<OutputFile> {
  const m = await mammoth()
  const { value } = await m.convertToHtml(mammothInput(await file.arrayBuffer()))
  const html = `<!doctype html>\n<html><head><meta charset="utf-8"><title>${stem(file.name)}</title></head><body>\n${value}\n</body></html>`
  return { name: `${stem(file.name)}.html`, blob: new Blob([html], { type: 'text/html' }) }
}

/** Rebuild a DOCX from edited Markdown-flavored text (headings, bold/italic, bullets, tables). */
export async function textToDocx(text: string, name: string): Promise<OutputFile> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, Table, TableRow, TableCell, WidthType, BorderStyle } = await import('docx')

  const parseRuns = (raw: string) => {
    const runs: InstanceType<typeof TextRun>[] = []
    const tokenRe = /(\*\*[^*]+\*\*|\*[^*]+\*)/g
    let last = 0
    for (const m of raw.matchAll(tokenRe)) {
      const idx = m.index ?? 0
      if (idx > last) runs.push(new TextRun(raw.slice(last, idx)))
      const tok = m[0]
      if (tok.startsWith('**') && tok.endsWith('**')) {
        runs.push(new TextRun({ text: tok.slice(2, -2), bold: true }))
      } else if (tok.startsWith('*') && tok.endsWith('*')) {
        runs.push(new TextRun({ text: tok.slice(1, -1), italics: true }))
      }
      last = idx + tok.length
    }
    if (last < raw.length) runs.push(new TextRun(raw.slice(last)))
    return runs.length ? runs : [new TextRun(raw)]
  }

  const children: (InstanceType<typeof Paragraph> | InstanceType<typeof Table>)[] = []
  let tableBuf: string[][] = []

  const flushTable = () => {
    if (!tableBuf.length) return
    const colCount = Math.max(1, ...tableBuf.map((r) => r.length))
    children.push(new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: tableBuf.map((r, ri) => new TableRow({
        children: Array.from({ length: colCount }, (_, ci) => new TableCell({
          children: [new Paragraph({
            children: ri === 0
              ? [new TextRun({ text: r[ci] ?? '', bold: true })]
              : parseRuns(r[ci] ?? ''),
          })],
        })),
      })),
    }))
    tableBuf = []
  }

  for (const line of text.split(/\n/)) {
    const t = line.trim()
    if (/^\|.+\|$/.test(t)) {
      const cells = t.slice(1, -1).split('|').map((c) => c.trim())
      if (!cells.every((c) => /^[-:]+$/.test(c))) tableBuf.push(cells)
      continue
    }
    flushTable()

    if (/^#{1,3}\s/.test(t)) {
      const level = t.startsWith('### ') ? HeadingLevel.HEADING_3 : t.startsWith('## ') ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_1
      children.push(new Paragraph({ text: t.replace(/^#{1,3}\s/, ''), heading: level }))
    } else if (/^[-*•]\s+/.test(t)) {
      children.push(new Paragraph({
        children: parseRuns(t.replace(/^[-*•]\s+/, '')),
        bullet: { level: 0 },
      }))
    } else if (/^---+$/.test(t)) {
      children.push(new Paragraph({
        border: { bottom: { color: 'CBD5E1', space: 1, style: BorderStyle.SINGLE, size: 6 } },
      }))
    } else {
      children.push(new Paragraph({ children: parseRuns(t) }))
    }
  }
  flushTable()

  const docFile = new Document({ sections: [{ children: children.length ? children : [new Paragraph('')] }] })
  const blob = await Packer.toBlob(docFile)
  return { name, blob: new Blob([blob], { type: DOCX_TYPE }) }
}

/**
 * In-place XML Find & Replace in a DOCX document.
 * Preserves 100% of original document styles, fonts, images, headers/footers, and tables.
 */
export async function replaceInDocx(
  file: File,
  findText: string,
  replaceText: string,
  matchCase = false,
): Promise<OutputFile> {
  if (!findText) throw new Error('Enter the text to find first.')
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const xmlParts = Object.keys(zip.files).filter((p) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(p))
  if (!xmlParts.length) throw new Error('Not a valid DOCX file.')

  const escaped = findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const regex = new RegExp(escaped, matchCase ? 'g' : 'gi')

  for (const part of xmlParts) {
    const entry = zip.file(part)
    if (!entry) continue
    const doc = xmlDoc(await entry.async('string'))
    const paras = Array.from(doc.getElementsByTagName('w:p'))
    for (const p of paras) {
      const tNodes = Array.from(p.getElementsByTagName('w:t'))
      if (!tNodes.length) continue
      const combined = tNodes.map((n) => n.textContent ?? '').join('')
      if (!regex.test(combined)) continue
      regex.lastIndex = 0
      const updated = combined.replace(regex, replaceText)
      tNodes[0].textContent = updated
      tNodes[0].setAttribute('xml:space', 'preserve')
      for (let i = 1; i < tNodes.length; i++) {
        tNodes[i].textContent = ''
      }
    }
    zip.file(part, xmlStr(doc))
  }

  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  return { name: `${stem(file.name)}-edited.docx`, blob: new Blob([blob], { type: DOCX_TYPE }) }
}

function xmlDoc(xml: string): Document {
  const d = new DOMParser().parseFromString(xml, 'application/xml')
  if (d.querySelector('parsererror')) throw new Error('Document XML could not be parsed — the file may be damaged.')
  return d
}
const xmlStr = (d: Document) => new XMLSerializer().serializeToString(d)

/**
 * Merge DOCX files by appending body content with relationship remapping.
 * Images/media referenced by appended content are copied with fresh IDs.
 * Complex numbering/styles from later files fall back to base styles — see UI note.
 */
export async function mergeWord(files: File[]): Promise<OutputFile> {
  if (files.length < 2) throw new Error('Select at least two DOCX files to merge.')
  const baseZip = await JSZip.loadAsync(await files[0].arrayBuffer())
  const baseDocFile = baseZip.file('word/document.xml')
  if (!baseDocFile) throw new Error('The first file is not a valid DOCX.')
  const baseDoc = xmlDoc(await baseDocFile.async('string'))
  const relsFile = baseZip.file('word/_rels/document.xml.rels')
  const baseRels = relsFile ? xmlDoc(await relsFile.async('string')) : xmlDoc('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>')
  const relsRoot = baseRels.documentElement
  let maxId = 0
  relsRoot.querySelectorAll('Relationship').forEach((r) => { const n = parseInt((r.getAttribute('Id') ?? '').replace(/\D/g, '')); if (n > maxId) maxId = n })
  const body = baseDoc.querySelector('body')!
  const sectPr = body.querySelector(':scope > sectPr')
  const insertBefore = (node: Node) => { if (sectPr) body.insertBefore(node, sectPr); else body.appendChild(node) }

  for (let fi = 1; fi < files.length; fi++) {
    const zip = await JSZip.loadAsync(await files[fi].arrayBuffer())
    const docFile = zip.file('word/document.xml')
    if (!docFile) throw new Error(`"${files[fi].name}" is not a valid DOCX.`)
    const srcDoc = xmlDoc(await docFile.async('string'))
    const srcRelsFile = zip.file('word/_rels/document.xml.rels')
    const idMap = new Map<string, string>()
    if (srcRelsFile) {
      const srcRels = xmlDoc(await srcRelsFile.async('string'))
      for (const rel of Array.from(srcRels.querySelectorAll('Relationship'))) {
        const oldId = rel.getAttribute('Id')!
        const target = rel.getAttribute('Target') ?? ''
        const type = rel.getAttribute('Type') ?? ''
        const newId = `rId${++maxId}`
        idMap.set(oldId, newId)
        let newTarget = target
        // Copy internal parts (media, fonts, etc.) into the base package.
        if (!target.startsWith('http') && !target.startsWith('/')) {
          const partPath = target.startsWith('../') ? target.slice(3) : `word/${target}`
          const part = zip.file(partPath)
          if (part && /media|image|font|header|footer/.test(partPath)) {
            const ext = partPath.split('.').pop()
            const newPath = `word/media/merged-${fi}-${maxId}.${ext}`
            baseZip.file(newPath, await part.async('uint8array'))
            newTarget = `media/merged-${fi}-${maxId}.${ext}`
          }
        }
        const nr = baseRels.createElementNS('http://schemas.openxmlformats.org/package/2006/relationships', 'Relationship')
        nr.setAttribute('Id', newId); nr.setAttribute('Type', type); nr.setAttribute('Target', newTarget)
        const mode = rel.getAttribute('TargetMode'); if (mode) nr.setAttribute('TargetMode', mode)
        relsRoot.appendChild(nr)
      }
    }
    // Page break separator then appended content (minus its section properties).
    const brP = baseDoc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:p')
    const brR = baseDoc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:r')
    const br = baseDoc.createElementNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main', 'w:br')
    br.setAttribute('w:type', 'page')
    brR.appendChild(br); brP.appendChild(brR); insertBefore(brP)
    for (const child of Array.from(srcDoc.querySelector('body')!.childNodes)) {
      if ((child as Element).tagName === 'w:sectPr') continue
      const imported = baseDoc.importNode(child, true) as Element
      imported.querySelectorAll('*').forEach((el) => {
        for (const attr of ['r:embed', 'r:id', 'r:link']) {
          const v = el.getAttribute(attr)
          if (v && idMap.has(v)) el.setAttribute(attr, idMap.get(v)!)
        }
      })
      insertBefore(imported)
    }
  }
  baseZip.file('word/document.xml', xmlStr(baseDoc))
  if (relsFile) baseZip.file('word/_rels/document.xml.rels', xmlStr(baseRels))
  const blob = await baseZip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  return { name: 'merged.docx', blob: new Blob([blob], { type: DOCX_TYPE }) }
}

/** Split DOCX at Heading 1 paragraphs (or every N paragraphs) into multiple documents. */
export async function splitWord(file: File, mode: 'heading' | 'paragraphs', perDoc = 15): Promise<OutputFile[]> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const docFile = zip.file('word/document.xml')
  if (!docFile) throw new Error('Not a valid DOCX file.')
  const src = xmlDoc(await docFile.async('string'))
  const paras = Array.from(src.querySelector('body')!.children).filter((el) => el.tagName === 'w:p' || el.tagName === 'w:tbl')
  const groups: Element[][] = []
  if (mode === 'heading') {
    let cur: Element[] = []
    for (const el of paras) {
      const style = el.querySelector('pStyle')?.getAttribute('w:val') ?? ''
      if (/Heading1|Title/.test(style) && cur.length) { groups.push(cur); cur = [] }
      cur.push(el)
    }
    if (cur.length) groups.push(cur)
    if (groups.length < 2) throw new Error('No Heading 1 structure found. Try "Split every N paragraphs" instead.')
  } else {
    for (let i = 0; i < paras.length; i += perDoc) groups.push(paras.slice(i, i + perDoc))
    if (groups.length < 2) throw new Error('Document is too short to split this way.')
  }
  const outs: OutputFile[] = []
  for (let gi = 0; gi < groups.length; gi++) {
    const partZip = await JSZip.loadAsync(await file.arrayBuffer())
    const partDoc = xmlDoc(await partZip.file('word/document.xml')!.async('string'))
    const pBody = partDoc.querySelector('body')!
    const pSect = pBody.querySelector(':scope > sectPr')
    Array.from(pBody.childNodes).forEach((n) => { if (n !== pSect) pBody.removeChild(n) })
    for (const el of groups[gi]) pBody.insertBefore(partDoc.importNode(el, true), pSect)
    partZip.file('word/document.xml', xmlStr(partDoc))
    const blob = await partZip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
    outs.push({ name: `${stem(file.name)}-part${gi + 1}.docx`, blob: new Blob([blob], { type: DOCX_TYPE }) })
  }
  return outs
}

// ── Word: content-block removal (the safe alternative to "page" removal) ──
export interface DocxBlock { index: number; kind: 'heading' | 'paragraph' | 'table'; label: string }

function blockLabel(el: Element): { kind: DocxBlock['kind']; label: string } {
  if (el.tagName === 'w:tbl') {
    const rows = el.getElementsByTagName('w:tr').length
    return { kind: 'table', label: `Table (${rows} row${rows === 1 ? '' : 's'})` }
  }
  const style = el.querySelector('pStyle')?.getAttribute('w:val') ?? ''
  const text = Array.from(el.getElementsByTagName('w:t')).map((t) => t.textContent ?? '').join('').trim()
  const kind = /Heading|Title/.test(style) ? 'heading' : 'paragraph'
  return { kind, label: text.slice(0, 70) || (kind === 'heading' ? '(untitled heading)' : '(empty paragraph)') }
}

async function docxBody(file: File) {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const docFile = zip.file('word/document.xml')
  if (!docFile) throw new Error('Not a valid DOCX file.')
  return { zip, doc: xmlDoc(await docFile.async('string')) }
}

export async function listDocxBlocks(file: File): Promise<DocxBlock[]> {
  const { doc } = await docxBody(file)
  const children = Array.from(doc.querySelector('body')!.children)
    .filter((el) => el.tagName === 'w:p' || el.tagName === 'w:tbl')
  return children.map((el, index) => ({ index, ...blockLabel(el) }))
}

export interface DocxPageInfo {
  pageNumber: number
  label: string
  blockIndices: number[]
  wordCount: number
  hasExplicitBreak: boolean
}

export async function listDocxPages(file: File): Promise<DocxPageInfo[]> {
  const { doc } = await docxBody(file)
  const children = Array.from(doc.querySelector('body')!.children)
    .filter((el) => el.tagName === 'w:p' || el.tagName === 'w:tbl')

  if (!children.length) return []

  const hasBreak = (el: Element) => {
    const brs = Array.from(el.getElementsByTagName('w:br'))
    if (brs.some((b) => b.getAttribute('w:type') === 'page' || b.getAttribute('type') === 'page')) return true
    if (el.getElementsByTagName('w:lastRenderedPageBreak').length > 0) return true
    if (el.getElementsByTagName('w:pageBreakBefore').length > 0) return true
    return false
  }

  const textOf = (el: Element) =>
    Array.from(el.getElementsByTagName('w:t')).map((t) => t.textContent ?? '').join('').trim()

  const anyExplicitBreaks = children.some(hasBreak)
  const pages: DocxPageInfo[] = []
  let currentBlocks: number[] = []
  let currentTexts: string[] = []
  let pageNum = 1

  if (anyExplicitBreaks) {
    for (let i = 0; i < children.length; i++) {
      const el = children[i]
      const text = textOf(el)
      const brk = hasBreak(el)

      currentBlocks.push(i)
      if (text) currentTexts.push(text)

      if (brk && i < children.length - 1) {
        const fullText = currentTexts.join(' ')
        pages.push({
          pageNumber: pageNum++,
          label: fullText.slice(0, 90) || `(Empty page ${pageNum - 1})`,
          blockIndices: [...currentBlocks],
          wordCount: fullText.split(/\s+/).filter(Boolean).length,
          hasExplicitBreak: true,
        })
        currentBlocks = []
        currentTexts = []
      }
    }
  } else {
    let currentWords = 0
    for (let i = 0; i < children.length; i++) {
      const el = children[i]
      const text = textOf(el)
      const words = text.split(/\s+/).filter(Boolean).length

      currentBlocks.push(i)
      if (text) currentTexts.push(text)
      currentWords += words

      if ((currentWords >= 300 || currentBlocks.length >= 4) && i < children.length - 1) {
        const fullText = currentTexts.join(' ')
        pages.push({
          pageNumber: pageNum++,
          label: fullText.slice(0, 90) || `(Page ${pageNum - 1})`,
          blockIndices: [...currentBlocks],
          wordCount: currentWords,
          hasExplicitBreak: false,
        })
        currentBlocks = []
        currentTexts = []
        currentWords = 0
      }
    }
  }

  if (currentBlocks.length > 0) {
    const fullText = currentTexts.join(' ')
    pages.push({
      pageNumber: pageNum,
      label: fullText.slice(0, 90) || `(Page ${pageNum})`,
      blockIndices: [...currentBlocks],
      wordCount: fullText.split(/\s+/).filter(Boolean).length,
      hasExplicitBreak: anyExplicitBreaks,
    })
  }

  return pages
}

/** Remove selected content blocks or pages from a DOCX file. */
export async function removeDocxPages(file: File, blockIndices: number[]): Promise<OutputFile> {
  if (!blockIndices.length) throw new Error('Select at least one page or section to remove.')
  const { zip, doc } = await docxBody(file)
  const body = doc.querySelector('body')!
  const children = Array.from(body.children).filter((el) => el.tagName === 'w:p' || el.tagName === 'w:tbl')
  if (blockIndices.length >= children.length) throw new Error('You cannot remove all content from the document.')

  const doomed = new Set(blockIndices)
  children.forEach((el, i) => {
    if (doomed.has(i)) el.remove()
  })

  // Clean up any remaining leading/trailing page breaks
  const remaining = Array.from(body.children).filter((el) => el.tagName === 'w:p')
  for (const p of remaining) {
    const brs = Array.from(p.getElementsByTagName('w:br')).filter((b) => b.getAttribute('w:type') === 'page' || b.getAttribute('type') === 'page')
    const text = Array.from(p.getElementsByTagName('w:t')).map((t) => t.textContent ?? '').join('').trim()
    if (brs.length > 0 && !text && (p === remaining[0] || p === remaining[remaining.length - 1])) {
      brs.forEach((b) => b.remove())
    }
  }

  zip.file('word/document.xml', xmlStr(doc))
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  return { name: `${stem(file.name)}-pages-removed.docx`, blob: new Blob([blob], { type: DOCX_TYPE }) }
}

/** Backward-compatible block removal helper. */
export async function removeDocxBlocks(file: File, remove: number[]): Promise<OutputFile> {
  return removeDocxPages(file, remove)
}

// ── PowerPoint (OOXML slide-part surgery) ────────────────────────
export interface SlideInfo { part: string; title: string }

const slidePartName = (n: number) => `ppt/slides/slide${n}.xml`

function slideTitle(xml: string, fallback: number): string {
  const texts = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1].trim()).filter(Boolean)
  return texts[0]?.slice(0, 60) || `Slide ${fallback}`
}

export async function listSlides(file: File): Promise<SlideInfo[]> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const parts = Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
    .sort((x, y) => parseInt(x.match(/\d+/)![0]) - parseInt(y.match(/\d+/)![0]))
  const out: SlideInfo[] = []
  for (let i = 0; i < parts.length; i++) out.push({ part: parts[i], title: slideTitle(await zip.file(parts[i])!.async('string'), i + 1) })
  return out
}

async function buildDeck(source: File, orderedParts: string[], outName: string): Promise<OutputFile> {
  const zip = await JSZip.loadAsync(await source.arrayBuffer())
  const presFile = zip.file('ppt/presentation.xml')
  const presRelsFile = zip.file('ppt/_rels/presentation.xml.rels')
  if (!presFile || !presRelsFile) throw new Error('Not a valid PPTX file.')
  const presRels = xmlDoc(await presRelsFile.async('string'))
  // Map slide relationship Id -> part path
  const idToPart = new Map<string, string>()
  const partToId = new Map<string, string>()
  presRels.querySelectorAll('Relationship').forEach((r) => {
    const target = r.getAttribute('Target') ?? ''
    if (/slides\/slide\d+\.xml$/.test(target)) {
      const part = 'ppt/' + target.replace(/^\//, '').replace(/^ppt\//, '')
      idToPart.set(r.getAttribute('Id')!, part)
      partToId.set(part, r.getAttribute('Id')!)
    }
  })
  const keepIds = new Set(orderedParts.map((p) => partToId.get(p)).filter(Boolean) as string[])
  // Remove relationships for dropped slides; delete their parts.
  presRels.querySelectorAll('Relationship').forEach((r) => {
    const part = idToPart.get(r.getAttribute('Id')!)
    if (part && !keepIds.has(r.getAttribute('Id')!)) r.remove()
  })
  for (const [part] of partToId) if (!orderedParts.includes(part)) { zip.remove(part); zip.remove(`ppt/slides/_rels/${part.split('/').pop()}.rels`) }
  // Reorder the slide id list in presentation.xml
  const pres = xmlDoc(await presFile.async('string'))
  const sldIdLst = pres.querySelector('sldIdLst')
  if (sldIdLst) {
    const byId = new Map<string, Element>()
    sldIdLst.querySelectorAll('sldId').forEach((el) => { const rid = el.getAttribute('r:id'); if (rid) byId.set(rid, el) })
    sldIdLst.querySelectorAll('sldId').forEach((el) => el.remove())
    for (const part of orderedParts) {
      const rid = partToId.get(part)
      const el = rid ? byId.get(rid) : undefined
      if (el) sldIdLst.appendChild(el)
    }
  }
  zip.file('ppt/presentation.xml', xmlStr(pres))
  zip.file('ppt/_rels/presentation.xml.rels', xmlStr(presRels))
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  return { name: outName, blob: new Blob([blob], { type: PPTX_TYPE }) }
}

export async function removeSlides(file: File, removeParts: string[]): Promise<OutputFile> {
  const slides = await listSlides(file)
  const keep = slides.map((s) => s.part).filter((p) => !removeParts.includes(p))
  if (!keep.length) throw new Error('You cannot remove every slide.')
  return buildDeck(file, keep, `${stem(file.name)}-edited.pptx`)
}

export async function extractSlides(file: File, keepParts: string[]): Promise<OutputFile> {
  if (!keepParts.length) throw new Error('Select at least one slide.')
  const slides = await listSlides(file)
  const ordered = slides.map((s) => s.part).filter((p) => keepParts.includes(p))
  return buildDeck(file, ordered, `${stem(file.name)}-extracted.pptx`)
}

export async function reorderSlides(file: File, orderedParts: string[]): Promise<OutputFile> {
  return buildDeck(file, orderedParts, `${stem(file.name)}-reordered.pptx`)
}

export async function splitPresentation(file: File): Promise<OutputFile[]> {
  const slides = await listSlides(file)
  if (slides.length < 2) throw new Error('This presentation has only one slide.')
  const outs: OutputFile[] = []
  for (let i = 0; i < slides.length; i++) {
    outs.push(await buildDeck(file, [slides[i].part], `${stem(file.name)}-slide-${i + 1}.pptx`))
  }
  return outs
}

/**
 * Merge decks by copying slide parts into the first deck. Each copied slide is
 * repointed at the base deck's first slide layout; media parts are copied with
 * fresh names. Charts/OLE objects may not survive — disclosed in the UI.
 */
export async function mergePresentations(files: File[]): Promise<OutputFile> {
  if (files.length < 2) throw new Error('Select at least two PPTX files to merge.')
  const base = await JSZip.loadAsync(await files[0].arrayBuffer())
  const baseSlides = await listSlides(files[0])
  const order: string[] = baseSlides.map((s) => s.part)
  let maxSlideNum = Math.max(0, ...order.map((p) => parseInt(p.match(/(\d+)\.xml$/)![1])))
  const presRelsFile = base.file('ppt/_rels/presentation.xml.rels')!
  const presRels = xmlDoc(await presRelsFile.async('string'))
  let maxR = 0
  presRels.querySelectorAll('Relationship').forEach((r) => { const n = parseInt((r.getAttribute('Id') ?? '').replace(/\D/g, '')); if (n > maxR) maxR = n })
  const pres = xmlDoc(await base.file('ppt/presentation.xml')!.async('string'))
  const sldIdLst = pres.querySelector('sldIdLst')!
  let maxSldId = 255
  sldIdLst.querySelectorAll('sldId').forEach((el) => { const n = parseInt(el.getAttribute('id') ?? '0'); if (n > maxSldId) maxSldId = n })
  const ctFile = base.file('[Content_Types].xml')
  const ct = ctFile ? xmlDoc(await ctFile.async('string')) : null
  // Base deck's first slide layout relationship target (for repointing copied slides).
  let baseLayoutTarget: string | null = null
  if (baseSlides.length) {
    const rels = base.file(`ppt/slides/_rels/${baseSlides[0].part.split('/').pop()}.rels`)
    if (rels) {
      const rd = xmlDoc(await rels.async('string'))
      rd.querySelectorAll('Relationship').forEach((r) => { if ((r.getAttribute('Type') ?? '').endsWith('/slideLayout')) baseLayoutTarget = r.getAttribute('Target') })
    }
  }

  for (let fi = 1; fi < files.length; fi++) {
    const src = await JSZip.loadAsync(await files[fi].arrayBuffer())
    const srcSlides = await listSlides(files[fi])
    for (const s of srcSlides) {
      const num = ++maxSlideNum
      const newPart = slidePartName(num)
      base.file(newPart, await src.file(s.part)!.async('uint8array'))
      // Rebuild the slide's relationships: keep layout (repointed), copy media.
      const srcRelsPath = `ppt/slides/_rels/${s.part.split('/').pop()}.rels`
      const newRels = xmlDoc('<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>')
      const srcRels = src.file(srcRelsPath)
      if (srcRels) {
        const sd = xmlDoc(await srcRels.async('string'))
        for (const rel of Array.from(sd.querySelectorAll('Relationship'))) {
          const type = rel.getAttribute('Type') ?? ''
          const target = rel.getAttribute('Target') ?? ''
          const nr = newRels.createElementNS('http://schemas.openxmlformats.org/package/2006/relationships', 'Relationship')
          nr.setAttribute('Id', rel.getAttribute('Id')!)
          nr.setAttribute('Type', type)
          if (type.endsWith('/slideLayout')) {
            nr.setAttribute('Target', baseLayoutTarget ?? target)
          } else if (!target.startsWith('http') && !target.startsWith('/')) {
            const partPath = target.startsWith('../') ? 'ppt/' + target.slice(3) : `ppt/slides/${target}`
            const part = src.file(partPath)
            if (part) {
              const fileName = partPath.split('/').pop()!
              const newName = `merged${fi}-${fileName}`
              const dir = partPath.slice(0, partPath.length - fileName.length)
              base.file(dir + newName, await part.async('uint8array'))
              nr.setAttribute('Target', '../' + dir.slice(4) + newName)
            } else nr.setAttribute('Target', target)
          } else nr.setAttribute('Target', target)
          newRels.documentElement.appendChild(nr)
        }
      }
      base.file(`ppt/slides/_rels/slide${num}.xml.rels`, xmlStr(newRels))
      // Content type override
      if (ct) {
        const ov = ct.createElementNS('http://schemas.openxmlformats.org/package/2006/content-types', 'Override')
        ov.setAttribute('PartName', '/' + newPart)
        ov.setAttribute('ContentType', 'application/vnd.openxmlformats-officedocument.presentationml.slide+xml')
        ct.documentElement.appendChild(ov)
      }
      // Presentation relationship + slide id entry
      const rid = `rId${++maxR}`
      const pr = presRels.createElementNS('http://schemas.openxmlformats.org/package/2006/relationships', 'Relationship')
      pr.setAttribute('Id', rid)
      pr.setAttribute('Type', 'http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide')
      pr.setAttribute('Target', `slides/slide${num}.xml`)
      presRels.documentElement.appendChild(pr)
      const sid = pres.createElementNS('http://schemas.openxmlformats.org/presentationml/2006/main', 'p:sldId')
      sid.setAttribute('id', String(++maxSldId))
      sid.setAttribute('r:id', rid)
      sldIdLst.appendChild(sid)
    }
  }
  base.file('ppt/presentation.xml', xmlStr(pres))
  base.file('ppt/_rels/presentation.xml.rels', xmlStr(presRels))
  if (ct) base.file('[Content_Types].xml', xmlStr(ct))
  const blob = await base.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  return { name: 'merged.pptx', blob: new Blob([blob], { type: PPTX_TYPE }) }
}

// ── Excel (SheetJS) ──────────────────────────────────────────────
async function readWorkbook(file: File): Promise<XLSX.WorkBook> {
  return XLSX.read(await file.arrayBuffer(), { type: 'array' })
}
function wbBlob(wb: XLSX.WorkBook, type: XLSX.BookType): Blob {
  const out = XLSX.write(wb, { bookType: type, type: 'array' }) as ArrayBuffer
  return new Blob([out], { type: type === 'csv' ? 'text/csv' : XLSX_TYPE })
}
export async function sheetNames(file: File): Promise<string[]> {
  return (await readWorkbook(file)).SheetNames
}

export async function xlsToXlsx(file: File): Promise<OutputFile> {
  return { name: `${stem(file.name)}.xlsx`, blob: wbBlob(await readWorkbook(file), 'xlsx') }
}

export async function csvToExcel(file: File): Promise<OutputFile> {
  const wb = XLSX.read(await file.text(), { type: 'string' })
  return { name: `${stem(file.name)}.xlsx`, blob: wbBlob(wb, 'xlsx') }
}

export async function excelToCsv(file: File): Promise<OutputFile[]> {
  const wb = await readWorkbook(file)
  return wb.SheetNames.map((n) => ({
    name: `${stem(file.name)}-${n.replace(/[^\w-]+/g, '_')}.csv`,
    blob: new Blob([XLSX.utils.sheet_to_csv(wb.Sheets[n])], { type: 'text/csv' }),
  }))
}

export async function mergeExcel(files: File[]): Promise<OutputFile> {
  if (files.length < 2) throw new Error('Select at least two workbooks to merge.')
  const out = XLSX.utils.book_new()
  for (const f of files) {
    const wb = await readWorkbook(f)
    for (const name of wb.SheetNames) {
      let unique = name, i = 2
      while (out.SheetNames.includes(unique)) unique = `${name.slice(0, 24)} (${i++})`
      XLSX.utils.book_append_sheet(out, wb.Sheets[name], unique)
    }
  }
  return { name: 'merged.xlsx', blob: wbBlob(out, 'xlsx') }
}

export async function splitWorksheets(file: File): Promise<OutputFile[]> {
  const wb = await readWorkbook(file)
  if (wb.SheetNames.length < 2) throw new Error('This workbook has only one worksheet.')
  return wb.SheetNames.map((n) => {
    const single = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(single, wb.Sheets[n], n)
    return { name: `${stem(file.name)}-${n.replace(/[^\w-]+/g, '_')}.xlsx`, blob: wbBlob(single, 'xlsx') }
  })
}

export async function removeWorksheets(file: File, remove: string[]): Promise<OutputFile> {
  const wb = await readWorkbook(file)
  const keep = wb.SheetNames.filter((n) => !remove.includes(n))
  if (!keep.length) throw new Error('You cannot remove every worksheet.')
  const out = XLSX.utils.book_new()
  keep.forEach((n) => XLSX.utils.book_append_sheet(out, wb.Sheets[n], n))
  return { name: `${stem(file.name)}-edited.xlsx`, blob: wbBlob(out, 'xlsx') }
}

export async function excelToHtml(file: File): Promise<OutputFile> {
  const wb = await readWorkbook(file)
  const sections = wb.SheetNames.map((n) => `<h2>${n}</h2>\n${XLSX.utils.sheet_to_html(wb.Sheets[n])}`).join('\n')
  const html = `<!doctype html>\n<html><head><meta charset="utf-8"><title>${stem(file.name)}</title><style>table{border-collapse:collapse}td,th{border:1px solid #ccc;padding:4px 8px}</style></head><body>\n${sections}\n</body></html>`
  return { name: `${stem(file.name)}.html`, blob: new Blob([html], { type: 'text/html' }) }
}

export interface ExcelToPdfOpts {
  orientation?: 'landscape' | 'portrait'
  showGridlines?: boolean
}

/** Styled PDF table renderer: renders each sheet with auto-fitted column widths, shaded headers, zebra rows & optional gridlines. */
export async function excelToPdf(file: File, opts: ExcelToPdfOpts = {}): Promise<OutputFile> {
  const wb = await readWorkbook(file)
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const isLandscape = opts.orientation !== 'portrait'
  const showGrid = opts.showGridlines !== false
  const pageSize: [number, number] = isLandscape ? [842, 595] : [595, 842]
  const pageW = pageSize[0]
  const pageH = pageSize[1]
  const margin = 32
  const availW = pageW - margin * 2
  const rowH = 18

  const safeCell = (v: unknown) =>
    String(v ?? '')
      .replace(/[\u2018\u2019]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014]/g, '-')
      // eslint-disable-next-line no-control-regex
      .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '')
      .trim()

  for (const name of wb.SheetNames) {
    const rawRows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[name], { header: 1, raw: false, defval: '' })
    const rows = rawRows.slice(0, 300)
    const maxCols = Math.min(isLandscape ? 14 : 9, Math.max(1, ...rows.map((r) => r.length)))

    // Compute proportional column widths from content length
    const weights = Array.from({ length: maxCols }, (_, ci) => {
      const longest = Math.max(5, ...rows.slice(0, 60).map((r) => safeCell(r[ci]).length))
      return Math.min(36, longest + 2)
    })
    const totalWeight = weights.reduce((a, b) => a + b, 0) || 1
    const colWidths = weights.map((w) => (w / totalWeight) * availW)

    let page = doc.addPage(pageSize)
    let y = pageH - margin - 14
    page.drawText(safeCell(name) || 'Sheet', { x: margin, y, size: 13, font: bold, color: rgb(0.08, 0.12, 0.22) })
    y -= 22

    const drawTableRow = (rowCells: string[], isHeader: boolean, rowIdx: number) => {
      if (isHeader) {
        page.drawRectangle({ x: margin, y: y - rowH + 4, width: availW, height: rowH, color: rgb(0.11, 0.22, 0.42) })
      } else if (rowIdx % 2 === 1) {
        page.drawRectangle({ x: margin, y: y - rowH + 4, width: availW, height: rowH, color: rgb(0.96, 0.97, 0.99) })
      }
      let cx = margin
      for (let ci = 0; ci < maxCols; ci++) {
        const cw = colWidths[ci]
        if (showGrid) {
          page.drawRectangle({
            x: cx,
            y: y - rowH + 4,
            width: cw,
            height: rowH,
            borderColor: isHeader ? rgb(0.18, 0.3, 0.52) : rgb(0.82, 0.85, 0.9),
            borderWidth: 0.5,
          })
        }
        const txt = safeCell(rowCells[ci])
        if (txt) {
          const f = isHeader ? bold : font
          const sz = isHeader ? 8.5 : 8
          const maxChars = Math.max(3, Math.floor((cw - 8) / 4.4))
          const clipped = txt.length > maxChars ? txt.slice(0, maxChars - 1) + '...' : txt
          page.drawText(clipped, {
            x: cx + 4,
            y: y - 9,
            size: sz,
            font: f,
            color: isHeader ? rgb(1, 1, 1) : rgb(0.15, 0.18, 0.24),
          })
        }
        cx += cw
      }
      y -= rowH
    }

    const headerRow = rows[0] ?? []
    if (rows.length > 0) {
      drawTableRow(headerRow, true, 0)
    }

    for (let ri = 1; ri < rows.length; ri++) {
      if (y - rowH < margin) {
        page = doc.addPage(pageSize)
        y = pageH - margin - 10
        // Repeat table header row on new page
        drawTableRow(headerRow, true, 0)
      }
      drawTableRow(rows[ri], false, ri)
    }
  }
  const bytes = await doc.save()
  return { name: `${stem(file.name)}.pdf`, blob: blobOf(bytes, 'application/pdf') }
}

