import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { OutputFile } from './download'
import { stem } from './download'

const blobOf = (bytes: Uint8Array, type: string) => new Blob([bytes.buffer as ArrayBuffer], { type })
export const DOCX_TYPE = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
export const PPTX_TYPE = 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
export const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'

// ── Shared: recompress any OOXML/ZIP package at max DEFLATE ──────
export async function recompressPackage(file: File, outName: string, type: string): Promise<OutputFile> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const out = new JSZip()
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue
    out.file(path, await entry.async('uint8array'))
  }
  const blob = await out.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 9 } })
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

/** Rebuild a DOCX from edited plain text (one paragraph per line). Formatting is intentionally simple. */
export async function textToDocx(text: string, name: string): Promise<OutputFile> {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel } = await import('docx')
  const children = text.split(/\n/).map((line) => {
    const t = line.trim()
    if (/^#{1,3}\s/.test(t)) {
      const level = t.startsWith('### ') ? HeadingLevel.HEADING_3 : t.startsWith('## ') ? HeadingLevel.HEADING_2 : HeadingLevel.HEADING_1
      return new Paragraph({ text: t.replace(/^#{1,3}\s/, ''), heading: level })
    }
    return new Paragraph({ children: [new TextRun(t)] })
  })
  const docFile = new Document({ sections: [{ children: children.length ? children : [new Paragraph('')] }] })
  const blob = await Packer.toBlob(docFile)
  return { name, blob: new Blob([blob], { type: DOCX_TYPE }) }
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

/** Remove selected content blocks (paragraphs/tables). Word has no fixed pages, so removal is by content — never by guessed page numbers. */
export async function removeDocxBlocks(file: File, remove: number[]): Promise<OutputFile> {
  if (!remove.length) throw new Error('Select at least one block to remove.')
  const { zip, doc } = await docxBody(file)
  const body = doc.querySelector('body')!
  const children = Array.from(body.children).filter((el) => el.tagName === 'w:p' || el.tagName === 'w:tbl')
  if (remove.length >= children.length) throw new Error('You cannot remove all content from the document.')
  const doomed = new Set(remove)
  children.forEach((el, i) => { if (doomed.has(i)) el.remove() })
  zip.file('word/document.xml', xmlStr(doc))
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  return { name: `${stem(file.name)}-edited.docx`, blob: new Blob([blob], { type: DOCX_TYPE }) }
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

/** Values-only PDF: renders each sheet as a simple text table (print styling is not preserved). */
export async function excelToPdf(file: File): Promise<OutputFile> {
  const wb = await readWorkbook(file)
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Courier)
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[name], { header: 1, raw: false, defval: '' })
    let page = doc.addPage([842, 595])
    page.drawText(name, { x: 36, y: 555, size: 13, font, color: rgb(0.1, 0.12, 0.2) })
    let y = 530
    for (const row of rows.slice(0, 200)) {
      if (y < 36) { page = doc.addPage([842, 595]); y = 555 }
      const line = row.map((c) => String(c ?? '').slice(0, 24)).join('  |  ').slice(0, 118)
      page.drawText(line || ' ', { x: 36, y, size: 8, font, color: rgb(0.2, 0.2, 0.25) })
      y -= 13
    }
  }
  const bytes = await doc.save()
  return { name: `${stem(file.name)}.pdf`, blob: blobOf(bytes, 'application/pdf') }
}

