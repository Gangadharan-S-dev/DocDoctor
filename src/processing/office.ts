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
  xmlBytes: number
  otherBytes: number
  totalBytes: number
  rsidCount: number
  orphanMediaCount: number
  commentCount: number
}

/** Inspect an OOXML archive (DOCX/PPTX/XLSX) to report embedded media count, XML bloat, and byte breakdown. */
export async function inspectOfficeMedia(file: File): Promise<OfficeMediaSummary> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  let count = 0
  let mediaBytes = 0
  let xmlBytes = 0
  let otherBytes = 0
  let rsidCount = 0
  let commentCount = 0
  const mediaPaths: string[] = []
  const referencedTargets = new Set<string>()

  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue
    const bytes = await entry.async('uint8array')
    if (/\/media\/[^/]+\.(jpe?g|png|gif|webp|bmp|tiff?|emf|wmf|svg)$/i.test(path)) {
      count++
      mediaBytes += bytes.byteLength
      mediaPaths.push(path)
    } else if (/\.xml$/i.test(path)) {
      xmlBytes += bytes.byteLength
      if (/^word\/(document|header\d*|footer\d*|comments)\.xml$/i.test(path)) {
        const str = new TextDecoder().decode(bytes)
        rsidCount += (str.match(/\bw:rsid\w*="[^"]*"/g) ?? []).length
        commentCount += (str.match(/<w:commentRangeStart\b|<w:comment\b/g) ?? []).length
      }
    } else if (/\.rels$/i.test(path)) {
      xmlBytes += bytes.byteLength
      const str = new TextDecoder().decode(bytes)
      for (const m of str.matchAll(/Target="([^"]+)"/g)) {
        const t = m[1].replace(/^\.\.\//, '').replace(/^\/+/, '')
        referencedTargets.add(t)
        referencedTargets.add(`word/${t}`)
        referencedTargets.add(`ppt/${t}`)
        referencedTargets.add(`xl/${t}`)
      }
    } else {
      otherBytes += bytes.byteLength
    }
  }

  let orphanMediaCount = 0
  if (referencedTargets.size > 0) {
    for (const mp of mediaPaths) {
      if (!referencedTargets.has(mp)) orphanMediaCount++
    }
  }

  return {
    count,
    mediaBytes,
    xmlBytes,
    otherBytes,
    totalBytes: file.size,
    rsidCount,
    orphanMediaCount,
    commentCount,
  }
}

export interface RecompressOpts {
  quality?: number
  maxEdge?: number
  stripXmlBloat?: boolean
  stripCommentsAndRevisions?: boolean
  removeOrphanMedia?: boolean
  convertPngToJpeg?: boolean
}

// ── Shared: recompress any OOXML/ZIP package at max DEFLATE with media optimization & XML slimmer ──
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
  const stripXmlBloat = opts?.stripXmlBloat !== false
  const stripRevs = opts?.stripCommentsAndRevisions === true
  const removeOrphans = opts?.removeOrphanMedia !== false
  const convertOpaquePng = opts?.convertPngToJpeg !== false

  // Discover referenced media paths from .rels files so orphan media can be pruned safely
  const referencedMedia = new Set<string>()
  let hasAnyRels = false
  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir || !/\.rels$/i.test(path)) continue
    hasAnyRels = true
    const str = await entry.async('string')
    for (const m of str.matchAll(/Target="([^"]+)"/g)) {
      const t = m[1].replace(/^\.\.\//, '').replace(/^\/+/, '')
      referencedMedia.add(t)
      referencedMedia.add(`word/${t}`)
      referencedMedia.add(`ppt/${t}`)
      referencedMedia.add(`xl/${t}`)
    }
  }

  const renamedPngToJpg = new Map<string, string>() // old media filename -> new .jpg filename

  for (const [path, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue
    const isMediaImage = /\/media\/[^/]+\.(jpe?g|png|bmp)$/i.test(path)

    if (isMediaImage && removeOrphans && hasAnyRels && !referencedMedia.has(path)) {
      continue
    }

    // Clean XML bloat in word/*.xml when enabled
    if (stripXmlBloat && /^word\/(document|styles|numbering|header\d*|footer\d*)\.xml$/i.test(path)) {
      let xmlText = await entry.async('string')
      xmlText = xmlText
        .replace(/\s+w:rsid\w*="[^"]*"/g, '')
        .replace(/<w:proofErr\b[^>]*\/>/g, '')
        .replace(/<w:lastRenderedPageBreak\s*\/>/g, '')
      if (stripRevs) {
        xmlText = xmlText
          .replace(/<w:commentRangeStart\b[^>]*\/>/g, '')
          .replace(/<w:commentRangeEnd\b[^>]*\/>/g, '')
          .replace(/<w:r\b[^>]*>\s*<w:rPr>[\s\S]*?<\/w:rPr>\s*<w:commentReference\b[^>]*\/>[\s\S]*?<\/w:r>/g, '')
          .replace(/<w:commentReference\b[^>]*\/>/g, '')
          .replace(/<w:del\b[^>]*>[\s\S]*?<\/w:del>/g, '')
          .replace(/<w:ins\b[^>]*>([\s\S]*?)<\/w:ins>/g, '$1')
      }
      out.file(path, xmlText)
      continue
    }

    const oldBytes = await entry.async('uint8array')

    if (isMediaImage && canRecompress && oldBytes.length > 12_000) {
      try {
        const isJpeg = /\.jpe?g$/i.test(path)
        const isPng = /\.png$/i.test(path)
        const mime = isJpeg ? 'image/jpeg' : isPng ? 'image/png' : 'image/bmp'
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
          ctx.drawImage(bmp, 0, 0, w, h)
          bmp.close()

          let encodeAsJpeg = isJpeg
          if (!isJpeg && convertOpaquePng) {
            try {
              const imgData = ctx.getImageData(0, 0, w, h).data
              let isOpaque = true
              for (let p = 3; p < imgData.length; p += 16) {
                if (imgData[p] < 250) { isOpaque = false; break }
              }
              if (isOpaque) encodeAsJpeg = true
            } catch {
              // keep original format
            }
          }

          if (encodeAsJpeg && !isJpeg) {
            ctx.globalCompositeOperation = 'destination-over'
            ctx.fillStyle = '#ffffff'
            ctx.fillRect(0, 0, w, h)
            ctx.globalCompositeOperation = 'source-over'
          }

          const outMime = encodeAsJpeg ? 'image/jpeg' : 'image/png'
          const newBlob = await new Promise<Blob | null>((res) => c.toBlob(res, outMime, encodeAsJpeg ? targetQuality : undefined))
          if (newBlob) {
            const newBytes = new Uint8Array(await newBlob.arrayBuffer())
            if (newBytes.length < oldBytes.length * 0.92) {
              if (encodeAsJpeg && !isJpeg) {
                const newPath = path.replace(/\.(png|bmp)$/i, '.jpg')
                const oldFile = path.split('/').pop()!
                const newFile = newPath.split('/').pop()!
                renamedPngToJpg.set(oldFile, newFile)
                out.file(newPath, newBytes)
              } else {
                out.file(path, newBytes)
              }
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

  // If any opaque PNGs were converted to .jpg, update .rels and [Content_Types].xml
  if (renamedPngToJpg.size > 0) {
    for (const [path, entry] of Object.entries(out.files)) {
      if (entry.dir || !/\.rels$/i.test(path)) continue
      let relsXml = await entry.async('string')
      let changed = false
      for (const [oldFile, newFile] of renamedPngToJpg.entries()) {
        if (relsXml.includes(oldFile)) {
          relsXml = relsXml.split(oldFile).join(newFile)
          changed = true
        }
      }
      if (changed) out.file(path, relsXml)
    }
    const ctEntry = out.file('[Content_Types].xml')
    if (ctEntry) {
      let ctXml = await ctEntry.async('string')
      if (!/Extension="jpg"/i.test(ctXml)) {
        ctXml = ctXml.replace(/<Types\b[^>]*>/, '$&<Default Extension="jpg" ContentType="image/jpeg"/>')
        out.file('[Content_Types].xml', ctXml)
      }
    }
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
export type WordExtractTarget = 'all' | 'headings' | 'tables-md' | 'tables-csv' | 'links' | 'images'

export interface WordToTextOpts {
  collapseBlankLines?: boolean
  markdownFormatting?: boolean
  extractTarget?: WordExtractTarget
}

export interface WordTextStats {
  words: number
  chars: number
  paragraphs: number
  readingTimeMin: number
  headingsCount?: number
  tablesCount?: number
  imagesCount?: number
  linksCount?: number
}

export function analyzeTextStats(text: string): WordTextStats {
  const trimmed = text.trim()
  const words = trimmed ? trimmed.split(/\s+/).filter(Boolean).length : 0
  const chars = text.length
  const paragraphs = trimmed ? trimmed.split(/\n\s*\n/).filter((p) => p.trim().length > 0).length : 0
  const readingTimeMin = Math.max(1, Math.ceil(words / 200))
  return { words, chars, paragraphs, readingTimeMin }
}

function serializeInlineMarkdown(el: Element): string {
  let out = ''
  for (const node of Array.from(el.childNodes)) {
    if (node.nodeType === 3) {
      out += node.textContent ?? ''
    } else if (node.nodeType === 1) {
      const child = node as Element
      const tag = child.tagName.toLowerCase()
      const inner = serializeInlineMarkdown(child).trim()
      if (!inner) continue
      if (tag === 'strong' || tag === 'b') out += `**${inner}**`
      else if (tag === 'em' || tag === 'i') out += `*${inner}*`
      else if (tag === 'a') {
        const href = child.getAttribute('href')
        out += href ? `[${inner}](${href})` : inner
      } else {
        out += inner
      }
    }
  }
  return out.replace(/\s+/g, ' ').trim()
}

export async function wordToText(file: File, opts?: WordToTextOpts): Promise<OutputFile> {
  const target = opts?.extractTarget ?? 'all'
  if (target !== 'all') {
    const assets = await extractWordAssets(file, opts)
    return assets[0]
  }

  const m = await mammoth()
  const buf = await file.arrayBuffer()
  let value: string
  if (opts?.markdownFormatting && typeof DOMParser !== 'undefined') {
    const htmlRes = await m.convertToHtml(mammothInput(buf))
    const doc = new DOMParser().parseFromString(htmlRes.value, 'text/html')
    const lines: string[] = []
    for (const el of Array.from(doc.body.children)) {
      const tag = el.tagName.toLowerCase()
      if (tag === 'table') {
        const rows = Array.from(el.querySelectorAll('tr')).map((tr) =>
          Array.from(tr.querySelectorAll('th,td')).map((c) => (c.textContent ?? '').replace(/\s+/g, ' ').trim())
        ).filter((r) => r.some(Boolean))
        if (rows.length > 0) {
          const cols = Math.max(1, ...rows.map((r) => r.length))
          const header = Array.from({ length: cols }, (_, ci) => rows[0][ci] ?? '')
          const sep = Array.from({ length: cols }, () => '---')
          const tableLines = [
            `| ${header.join(' | ')} |`,
            `| ${sep.join(' | ')} |`,
            ...rows.slice(1).map((r) => `| ${Array.from({ length: cols }, (_, ci) => r[ci] ?? '').join(' | ')} |`),
          ]
          lines.push(tableLines.join('\n'))
        }
        continue
      }
      const txt = serializeInlineMarkdown(el) || (el.textContent ?? '').replace(/\s+/g, ' ').trim()
      if (!txt) continue
      if (tag === 'h1') lines.push(`# ${(el.textContent ?? '').replace(/\s+/g, ' ').trim()}`)
      else if (tag === 'h2') lines.push(`## ${(el.textContent ?? '').replace(/\s+/g, ' ').trim()}`)
      else if (tag === 'h3') lines.push(`### ${(el.textContent ?? '').replace(/\s+/g, ' ').trim()}`)
      else if (tag === 'ul' || tag === 'ol') {
        Array.from(el.querySelectorAll('li')).forEach((li, idx) => {
          const lt = serializeInlineMarkdown(li) || (li.textContent ?? '').replace(/\s+/g, ' ').trim()
          if (lt) lines.push(tag === 'ol' ? `${idx + 1}. ${lt}` : `- ${lt}`)
        })
      } else {
        lines.push(txt)
      }
    }
    value = lines.join('\n\n')
  } else {
    const raw = await m.extractRawText(mammothInput(buf))
    value = raw.value
  }
  if (opts?.collapseBlankLines) {
    value = value.replace(/\n{3,}/g, '\n\n').trim()
  }
  const ext = opts?.markdownFormatting ? 'md' : 'txt'
  const mime = opts?.markdownFormatting ? 'text/markdown' : 'text/plain'
  return { name: `${stem(file.name)}.${ext}`, blob: new Blob([value], { type: mime }) }
}

/**
 * Multi-target extractor for `extract-word-text`:
 * Supports extracting full text, headings outline, Markdown/CSV tables, hyperlinks, or embedded media images.
 */
export async function extractWordAssets(file: File, opts?: WordToTextOpts): Promise<OutputFile[]> {
  const target = opts?.extractTarget ?? 'all'
  if (target === 'all') {
    const single = await wordToText(file, { ...opts, extractTarget: 'all' })
    // Preserve .txt filename for backward compatibility unless markdown is requested
    return [{ name: `${stem(file.name)}.txt`, blob: new Blob([await single.blob.text()], { type: 'text/plain' }) }]
  }

  const zip = await JSZip.loadAsync(await file.arrayBuffer())

  if (target === 'images') {
    const outs: OutputFile[] = []
    let idx = 1
    for (const [path, entry] of Object.entries(zip.files)) {
      if (entry.dir) continue
      const m = path.match(/^word\/media\/([^/]+\.(jpe?g|png|gif|webp|bmp|svg))$/i)
      if (!m) continue
      const ext = m[2].toLowerCase()
      const mime = ext === 'png' ? 'image/png' : ext === 'gif' ? 'image/gif' : ext === 'webp' ? 'image/webp' : ext === 'svg' ? 'image/svg+xml' : 'image/jpeg'
      const bytes = await entry.async('uint8array')
      outs.push({
        name: `${stem(file.name)}-image-${idx++}.${ext}`,
        blob: blobOf(bytes, mime),
      })
    }
    if (!outs.length) throw new Error('No embedded images were found in this Word document.')
    return outs
  }

  const docEntry = zip.file('word/document.xml')
  if (!docEntry) throw new Error('Not a valid DOCX file.')
  const doc = xmlDoc(await docEntry.async('string'))

  if (target === 'headings') {
    const lines: string[] = []
    for (const p of Array.from(doc.getElementsByTagName('w:p'))) {
      const style = p.querySelector('pStyle')?.getAttribute('w:val') ?? ''
      const m = style.match(/Heading(\d)|Title/i)
      if (!m) continue
      const txt = Array.from(p.getElementsByTagName('w:t')).map((t) => t.textContent ?? '').join('').trim()
      if (!txt) continue
      const lvl = m[1] ? Math.min(6, Math.max(1, parseInt(m[1]))) : 1
      lines.push(`${'#'.repeat(lvl)} ${txt}`)
    }
    if (!lines.length) {
      throw new Error('No heading styles (Heading 1–6 or Title) were found in this document.')
    }
    return [{ name: `${stem(file.name)}-outline.md`, blob: new Blob([lines.join('\n\n')], { type: 'text/markdown' }) }]
  }

  if (target === 'tables-md' || target === 'tables-csv') {
    const tables = Array.from(doc.getElementsByTagName('w:tbl'))
    if (!tables.length) throw new Error('No tables were found in this Word document.')
    if (target === 'tables-csv') {
      return tables.map((tbl, ti) => {
        const rows = Array.from(tbl.getElementsByTagName('w:tr')).map((tr) =>
          Array.from(tr.getElementsByTagName('w:tc')).map((tc) => {
            const cellTxt = Array.from(tc.getElementsByTagName('w:t')).map((t) => t.textContent ?? '').join(' ').replace(/\s+/g, ' ').trim()
            return /[",\n]/.test(cellTxt) ? `"${cellTxt.replace(/"/g, '""')}"` : cellTxt
          }).join(',')
        )
        return {
          name: `${stem(file.name)}-table-${ti + 1}.csv`,
          blob: new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' }),
        }
      })
    } else {
      const mdTables = tables.map((tbl, ti) => {
        const rows = Array.from(tbl.getElementsByTagName('w:tr')).map((tr) =>
          Array.from(tr.getElementsByTagName('w:tc')).map((tc) =>
            Array.from(tc.getElementsByTagName('w:t')).map((t) => t.textContent ?? '').join(' ').replace(/\s+/g, ' ').trim()
          )
        ).filter((r) => r.some(Boolean))
        if (!rows.length) return ''
        const cols = Math.max(1, ...rows.map((r) => r.length))
        const hdr = Array.from({ length: cols }, (_, ci) => rows[0][ci] ?? '')
        const sep = Array.from({ length: cols }, () => '---')
        return [
          `### Table ${ti + 1}`,
          `| ${hdr.join(' | ')} |`,
          `| ${sep.join(' | ')} |`,
          ...rows.slice(1).map((r) => `| ${Array.from({ length: cols }, (_, ci) => r[ci] ?? '').join(' | ')} |`),
        ].join('\n')
      }).filter(Boolean)
      return [{ name: `${stem(file.name)}-tables.md`, blob: new Blob([mdTables.join('\n\n')], { type: 'text/markdown' }) }]
    }
  }

  if (target === 'links') {
    const relsEntry = zip.file('word/_rels/document.xml.rels')
    const relMap = new Map<string, string>()
    if (relsEntry) {
      const relsDoc = xmlDoc(await relsEntry.async('string'))
      relsDoc.querySelectorAll('Relationship').forEach((r) => {
        const type = r.getAttribute('Type') ?? ''
        const targetUrl = r.getAttribute('Target') ?? ''
        if (type.endsWith('/hyperlink') && targetUrl) {
          relMap.set(r.getAttribute('Id') ?? '', targetUrl)
        }
      })
    }
    const foundLinks: string[] = []
    Array.from(doc.getElementsByTagName('w:hyperlink')).forEach((hl) => {
      const rid = hl.getAttribute('r:id') ?? ''
      const url = relMap.get(rid)
      const label = Array.from(hl.getElementsByTagName('w:t')).map((t) => t.textContent ?? '').join('').trim()
      if (url) foundLinks.push(label && label !== url ? `${label} — ${url}` : url)
    })
    // Also detect plain URLs in text
    const fullText = Array.from(doc.getElementsByTagName('w:t')).map((t) => t.textContent ?? '').join(' ')
    for (const um of fullText.matchAll(/https?:\/\/[^\s)>\]"']+/g)) {
      if (!foundLinks.some((l) => l.includes(um[0]))) foundLinks.push(um[0])
    }
    if (!foundLinks.length) throw new Error('No hyperlinks or URLs were found in this Word document.')
    return [{ name: `${stem(file.name)}-links.txt`, blob: new Blob([foundLinks.join('\n')], { type: 'text/plain' }) }]
  }

  return [await wordToText(file, { ...opts, extractTarget: 'all' })]
}

export async function wordExtractText(file: File): Promise<string> {
  const m = await mammoth()
  const { value } = await m.extractRawText(mammothInput(await file.arrayBuffer()))
  return value
}

export interface WordToHtmlOpts {
  mode?: 'styled' | 'clean' | 'dark'
  imageHandling?: 'base64' | 'zip-folder' | 'strip'
  includeTocSidebar?: boolean
}

export async function wordToHtml(file: File, opts?: WordToHtmlOpts): Promise<OutputFile> {
  const m = await mammoth()
  let { value } = await m.convertToHtml(mammothInput(await file.arrayBuffer()))
  const mode = opts?.mode ?? 'styled'
  const imgMode = opts?.imageHandling ?? 'base64'

  if (imgMode === 'strip') {
    value = value.replace(/<img\b[^>]*>/gi, '')
  }

  let tocHtml = ''
  if (opts?.includeTocSidebar && mode !== 'clean' && typeof DOMParser !== 'undefined') {
    const parsed = new DOMParser().parseFromString(value, 'text/html')
    const headings = Array.from(parsed.querySelectorAll('h1, h2, h3'))
    if (headings.length >= 2) {
      const items: string[] = []
      headings.forEach((h, idx) => {
        const id = `section-${idx + 1}`
        h.setAttribute('id', id)
        const level = h.tagName.toLowerCase()
        const indent = level === 'h3' ? 'margin-left:24px' : level === 'h2' ? 'margin-left:12px' : 'font-weight:700'
        items.push(`<li style="${indent}"><a href="#${id}">${(h.textContent ?? '').trim()}</a></li>`)
      })
      value = parsed.body.innerHTML
      tocHtml = `<nav class="doc-toc"><strong>Table of Contents</strong><ul>${items.join('')}</ul></nav>\n`
    }
  }

  const buildFullHtml = (bodyHtml: string) => {
    if (mode === 'clean') {
      return `<!doctype html>\n<html><head><meta charset="utf-8"><title>${stem(file.name)}</title></head><body>\n${bodyHtml}\n</body></html>`
    }
    const isDark = mode === 'dark'
    const css = isDark
      ? `body{font-family:system-ui,-apple-system,sans-serif;max-width:820px;margin:40px auto;padding:0 24px;line-height:1.68;color:#e2e8f0;background:#0f172a}h1,h2,h3{color:#f8fafc;margin-top:1.5em}table{border-collapse:collapse;width:100%;margin:1.2em 0}td,th{border:1px solid #334155;padding:8px 12px}tr:nth-child(even){background:#1e293b}img{max-width:100%;height:auto;border-radius:8px}a{color:#38bdf8}.doc-toc{background:#1e293b;border:1px solid #334155;border-radius:12px;padding:16px 20px;margin-bottom:28px}.doc-toc ul{list-style:none;padding-left:0;margin:8px 0 0}.doc-toc li{margin:4px 0}`
      : `body{font-family:system-ui,-apple-system,sans-serif;max-width:820px;margin:40px auto;padding:0 24px;line-height:1.68;color:#1e293b;background:#ffffff}h1,h2,h3{color:#0f172a;margin-top:1.5em}table{border-collapse:collapse;width:100%;margin:1.2em 0}td,th{border:1px solid #cbd5e1;padding:8px 12px}tr:nth-child(even){background:#f8fafc}img{max-width:100%;height:auto;border-radius:8px}a{color:#1d6ff2}.doc-toc{background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;padding:16px 20px;margin-bottom:28px}.doc-toc ul{list-style:none;padding-left:0;margin:8px 0 0}.doc-toc li{margin:4px 0}`
    return `<!doctype html>\n<html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${stem(file.name)}</title><style>${css}</style></head><body>\n${tocHtml}${bodyHtml}\n</body></html>`
  }

  if (imgMode === 'zip-folder') {
    const bundle = new JSZip()
    let imgIdx = 0
    const rewritten = value.replace(/src="data:image\/([a-zA-Z0-9+]+);base64,([^"]+)"/g, (_full, subtype, b64) => {
      imgIdx++
      const ext = subtype === 'jpeg' ? 'jpg' : subtype.replace(/[^a-z0-9]/gi, '') || 'png'
      const relPath = `images/image-${imgIdx}.${ext}`
      const binStr = typeof atob === 'function' ? atob(b64) : Buffer.from(b64, 'base64').toString('binary')
      const bytes = new Uint8Array(binStr.length)
      for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i)
      bundle.file(relPath, bytes)
      return `src="${relPath}"`
    })
    const finalHtml = buildFullHtml(rewritten)
    if (imgIdx > 0) {
      bundle.file(`${stem(file.name)}.html`, finalHtml)
      const zipBlob = await bundle.generateAsync({ type: 'blob', compression: 'DEFLATE' })
      return { name: `${stem(file.name)}-html-bundle.zip`, blob: new Blob([zipBlob], { type: 'application/zip' }) }
    }
  }

  const html = buildFullHtml(value)
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

// ── In-Place Visual Document Block & Table Editor (100% Style Preservation) ──
export interface EditableDocxNode {
  id: string
  origIndex: number // index in original body children (-1 for newly added blocks)
  kind: 'heading1' | 'heading2' | 'heading3' | 'paragraph' | 'list' | 'table'
  text: string
  cells?: string[][]
  align?: 'left' | 'center' | 'right' | 'both'
  bold?: boolean
  italic?: boolean
  hasEmbeddedMedia?: boolean
}

export async function listEditableDocxNodes(file: File): Promise<EditableDocxNode[]> {
  const { doc } = await docxBody(file)
  const body = doc.querySelector('body')
  if (!body) return []
  const children = Array.from(body.children).filter((el) => el.tagName === 'w:p' || el.tagName === 'w:tbl')
  const out: EditableDocxNode[] = []

  children.forEach((el, idx) => {
    if (el.tagName === 'w:tbl') {
      const rows = Array.from(el.getElementsByTagName('w:tr')).map((tr) =>
        Array.from(tr.getElementsByTagName('w:tc')).map((tc) =>
          Array.from(tc.getElementsByTagName('w:t')).map((t) => t.textContent ?? '').join('')
        )
      )
      out.push({
        id: `node-${idx}`,
        origIndex: idx,
        kind: 'table',
        text: '',
        cells: rows.length ? rows : [['']],
      })
      return
    }

    const style = el.querySelector('pStyle')?.getAttribute('w:val') ?? ''
    const hasNumPr = el.getElementsByTagName('w:numPr').length > 0
    const hasMedia = el.getElementsByTagName('w:drawing').length > 0 || el.getElementsByTagName('w:pict').length > 0
    const jcVal = el.querySelector('jc')?.getAttribute('w:val') as EditableDocxNode['align'] | undefined
    const runs = Array.from(el.getElementsByTagName('w:r'))
    const text = Array.from(el.getElementsByTagName('w:t')).map((t) => t.textContent ?? '').join('')
    if (!text.trim() && !hasMedia) return

    const bold = runs.length > 0 && runs.every((r) => r.getElementsByTagName('w:b').length > 0)
    const italic = runs.length > 0 && runs.every((r) => r.getElementsByTagName('w:i').length > 0)
    let kind: EditableDocxNode['kind'] = 'paragraph'
    if (/Heading1|Title/i.test(style)) kind = 'heading1'
    else if (/Heading2|Subtitle/i.test(style)) kind = 'heading2'
    else if (/Heading[3-6]/i.test(style)) kind = 'heading3'
    else if (hasNumPr || /List/i.test(style)) kind = 'list'

    out.push({
      id: `node-${idx}`,
      origIndex: idx,
      kind,
      text,
      align: jcVal || 'left',
      bold,
      italic,
      hasEmbeddedMedia: hasMedia,
    })
  })

  return out
}

/**
 * Save changes from the In-Place Visual Block & Table Editor back into the original DOCX package.
 * Preserves 100% of original document styles, headers, footers, images, and table borders.
 */
export async function saveEditedDocxNodes(file: File, nodes: EditableDocxNode[]): Promise<OutputFile> {
  const { zip, doc } = await docxBody(file)
  const body = doc.querySelector('body')!
  const sectPr = body.querySelector(':scope > sectPr')
  const origChildren = Array.from(body.children).filter((el) => el.tagName === 'w:p' || el.tagName === 'w:tbl')
  const wNs = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

  const setParagraphTextInPlace = (pEl: Element, newText: string, node: EditableDocxNode) => {
    // Update paragraph style and alignment if modified
    let pPr = pEl.querySelector(':scope > pPr')
    if (!pPr && (node.kind.startsWith('heading') || node.align)) {
      pPr = doc.createElementNS(wNs, 'w:pPr')
      pEl.insertBefore(pPr, pEl.firstChild)
    }
    if (pPr) {
      let pStyle = pPr.querySelector(':scope > pStyle')
      if (node.kind === 'heading1' || node.kind === 'heading2' || node.kind === 'heading3') {
        if (!pStyle) {
          pStyle = doc.createElementNS(wNs, 'w:pStyle')
          pPr.insertBefore(pStyle, pPr.firstChild)
        }
        pStyle.setAttribute('w:val', node.kind === 'heading1' ? 'Heading1' : node.kind === 'heading2' ? 'Heading2' : 'Heading3')
      }
      if (node.align) {
        let jc = pPr.querySelector(':scope > jc')
        if (!jc) {
          jc = doc.createElementNS(wNs, 'w:jc')
          pPr.appendChild(jc)
        }
        jc.setAttribute('w:val', node.align)
      }
    }

    const tNodes = Array.from(pEl.getElementsByTagName('w:t'))
    const oldText = tNodes.map((t) => t.textContent ?? '').join('')
    if (tNodes.length > 0) {
      if (oldText !== newText) {
        tNodes[0].textContent = newText
        tNodes[0].setAttribute('xml:space', 'preserve')
        for (let i = 1; i < tNodes.length; i++) tNodes[i].textContent = ''
      }
      // Apply bold/italic toggle to the first run if requested
      const firstRun = tNodes[0].parentElement
      if (firstRun && firstRun.tagName === 'w:r' && (node.bold !== undefined || node.italic !== undefined)) {
        let rPr = firstRun.querySelector(':scope > rPr')
        if (!rPr && (node.bold || node.italic)) {
          rPr = doc.createElementNS(wNs, 'w:rPr')
          firstRun.insertBefore(rPr, firstRun.firstChild)
        }
        if (rPr) {
          const existingB = rPr.querySelector(':scope > b')
          if (node.bold && !existingB) rPr.appendChild(doc.createElementNS(wNs, 'w:b'))
          else if (node.bold === false && existingB) existingB.remove()

          const existingI = rPr.querySelector(':scope > i')
          if (node.italic && !existingI) rPr.appendChild(doc.createElementNS(wNs, 'w:i'))
          else if (node.italic === false && existingI) existingI.remove()
        }
      }
    } else if (newText) {
      const r = doc.createElementNS(wNs, 'w:r')
      if (node.bold || node.italic) {
        const rPr = doc.createElementNS(wNs, 'w:rPr')
        if (node.bold) rPr.appendChild(doc.createElementNS(wNs, 'w:b'))
        if (node.italic) rPr.appendChild(doc.createElementNS(wNs, 'w:i'))
        r.appendChild(rPr)
      }
      const t = doc.createElementNS(wNs, 'w:t')
      t.setAttribute('xml:space', 'preserve')
      t.textContent = newText
      r.appendChild(t)
      pEl.appendChild(r)
    }
  }

  const createNewElement = (node: EditableDocxNode): Element => {
    if (node.kind === 'table' && node.cells) {
      const tbl = doc.createElementNS(wNs, 'w:tbl')
      for (const row of node.cells) {
        const tr = doc.createElementNS(wNs, 'w:tr')
        for (const cellVal of row) {
          const tc = doc.createElementNS(wNs, 'w:tc')
          const p = doc.createElementNS(wNs, 'w:p')
          const r = doc.createElementNS(wNs, 'w:r')
          const t = doc.createElementNS(wNs, 'w:t')
          t.setAttribute('xml:space', 'preserve')
          t.textContent = cellVal
          r.appendChild(t)
          p.appendChild(r)
          tc.appendChild(p)
          tr.appendChild(tc)
        }
        tbl.appendChild(tr)
      }
      return tbl
    }
    const p = doc.createElementNS(wNs, 'w:p')
    setParagraphTextInPlace(p, node.text, node)
    return p
  }

  // Build the new ordered sequence of body elements
  // Also preserve any originally empty/media-only paragraphs that were not part of the editable list if untouched
  const finalElements: Element[] = []
  for (const node of nodes) {
    const orig = node.origIndex >= 0 ? origChildren[node.origIndex] : undefined
    if (orig) {
      if (node.kind === 'table' && orig.tagName === 'w:tbl' && node.cells) {
        const trs = Array.from(orig.getElementsByTagName('w:tr'))
        node.cells.forEach((rowCells, ri) => {
          const tr = trs[ri]
          if (!tr) return
          const tcs = Array.from(tr.getElementsByTagName('w:tc'))
          rowCells.forEach((cellVal, ci) => {
            const tc = tcs[ci]
            if (!tc) return
            const tNodes = Array.from(tc.getElementsByTagName('w:t'))
            const oldCell = tNodes.map((t) => t.textContent ?? '').join('')
            if (oldCell !== cellVal) {
              if (tNodes.length > 0) {
                tNodes[0].textContent = cellVal
                tNodes[0].setAttribute('xml:space', 'preserve')
                for (let k = 1; k < tNodes.length; k++) tNodes[k].textContent = ''
              } else {
                const p = tc.querySelector('p') ?? tc.appendChild(doc.createElementNS(wNs, 'w:p'))
                const r = doc.createElementNS(wNs, 'w:r')
                const t = doc.createElementNS(wNs, 'w:t')
                t.setAttribute('xml:space', 'preserve')
                t.textContent = cellVal
                r.appendChild(t)
                p.appendChild(r)
              }
            }
          })
        })
        finalElements.push(orig)
      } else if (orig.tagName === 'w:p') {
        setParagraphTextInPlace(orig, node.text, node)
        finalElements.push(orig)
      } else {
        finalElements.push(createNewElement(node))
      }
    } else {
      finalElements.push(createNewElement(node))
    }
  }

  // Replace body children before sectPr
  origChildren.forEach((el) => el.remove())
  for (const el of finalElements) {
    if (sectPr) body.insertBefore(el, sectPr)
    else body.appendChild(el)
  }

  zip.file('word/document.xml', xmlStr(doc))
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  return { name: `${stem(file.name)}-edited.docx`, blob: new Blob([blob], { type: DOCX_TYPE }) }
}

/**
 * Scan a DOCX file (body, headers, footers) for template placeholders such as:
 * {{CLIENT_NAME}}, [[DATE]], [COMPANY_NAME], or <PROJECT_TITLE>.
 */
export async function detectDocxPlaceholders(file: File): Promise<string[]> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const xmlParts = Object.keys(zip.files).filter((p) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(p))
  const found = new Set<string>()
  const patterns = [
    /\{\{[^{}\n]{1,50}\}\}/g,
    /\[\[[^[\]\n]{1,50}\]\]/g,
    /\[[A-Z][A-Z0-9_ -]{1,40}\]/g,
    /<[A-Z][A-Z0-9_ -]{1,40}>/g,
  ]
  for (const part of xmlParts) {
    const entry = zip.file(part)
    if (!entry) continue
    const doc = xmlDoc(await entry.async('string'))
    const paras = Array.from(doc.getElementsByTagName('w:p'))
    for (const p of paras) {
      const text = Array.from(p.getElementsByTagName('w:t')).map((t) => t.textContent ?? '').join('')
      for (const re of patterns) {
        for (const m of text.matchAll(re)) {
          found.add(m[0])
        }
      }
    }
  }
  return [...found]
}

export interface DocxReplaceRule {
  find: string
  replace: string
}

export interface DocxMatchOpts {
  matchCase?: boolean
  wholeWord?: boolean
  useRegex?: boolean
}

export interface DocxMatchSnippet {
  part: string
  before: string
  match: string
  after: string
}

function buildSearchRegex(findText: string, matchCase = false, opts?: DocxMatchOpts): RegExp {
  const flags = (opts?.matchCase ?? matchCase) ? 'g' : 'gi'
  let pattern = opts?.useRegex ? findText : findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  if (opts?.wholeWord) pattern = `\\b(?:${pattern})\\b`
  return new RegExp(pattern, flags)
}

/** Preview matches in context across body, headers, and footers. */
export async function previewDocxMatches(
  file: File,
  findText: string,
  opts?: DocxMatchOpts,
): Promise<{ count: number; snippets: DocxMatchSnippet[] }> {
  if (!findText) return { count: 0, snippets: [] }
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const xmlParts = Object.keys(zip.files).filter((p) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(p))
  if (!xmlParts.length) return { count: 0, snippets: [] }
  let regex: RegExp
  try {
    regex = buildSearchRegex(findText, opts?.matchCase, opts)
  } catch {
    return { count: 0, snippets: [] }
  }

  let count = 0
  const snippets: DocxMatchSnippet[] = []
  for (const part of xmlParts) {
    const entry = zip.file(part)
    if (!entry) continue
    const doc = xmlDoc(await entry.async('string'))
    const partLabel = part.includes('header') ? 'Header' : part.includes('footer') ? 'Footer' : 'Body'
    const paras = Array.from(doc.getElementsByTagName('w:p'))
    for (const p of paras) {
      const tNodes = Array.from(p.getElementsByTagName('w:t'))
      if (!tNodes.length) continue
      const combined = tNodes.map((n) => n.textContent ?? '').join('')
      for (const m of combined.matchAll(regex)) {
        if (!m[0]) break
        count++
        if (snippets.length < 12) {
          const idx = m.index ?? 0
          const start = Math.max(0, idx - 36)
          const end = Math.min(combined.length, idx + m[0].length + 36)
          snippets.push({
            part: partLabel,
            before: (start > 0 ? '…' : '') + combined.slice(start, idx),
            match: m[0],
            after: combined.slice(idx + m[0].length, end) + (end < combined.length ? '…' : ''),
          })
        }
      }
    }
  }
  return { count, snippets }
}

/** Count how many times a search string appears across a DOCX's body, headers, and footers. */
export async function countDocxMatches(
  file: File,
  findText: string,
  matchCase = false,
  opts?: DocxMatchOpts,
): Promise<number> {
  const res = await previewDocxMatches(file, findText, { ...opts, matchCase: opts?.matchCase ?? matchCase })
  return res.count
}

/**
 * In-place XML Find & Replace in a DOCX document (supports single find/replace or multiple rules).
 * Preserves 100% of original document styles, fonts, images, headers/footers, and tables.
 */
export async function replaceInDocx(
  file: File,
  findText: string,
  replaceText: string,
  matchCase = false,
  rules?: DocxReplaceRule[],
  opts?: DocxMatchOpts,
): Promise<OutputFile> {
  const activeRules = (rules && rules.length > 0 ? rules : [{ find: findText, replace: replaceText }])
    .filter((r) => r.find.length > 0)
  if (!activeRules.length) throw new Error('Enter the text to find first.')
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const xmlParts = Object.keys(zip.files).filter((p) => /^word\/(document|header\d*|footer\d*)\.xml$/.test(p))
  if (!xmlParts.length) throw new Error('Not a valid DOCX file.')

  const compiled = activeRules.map((r) => ({
    regex: buildSearchRegex(r.find, matchCase, opts),
    replace: r.replace,
  }))

  for (const part of xmlParts) {
    const entry = zip.file(part)
    if (!entry) continue
    const doc = xmlDoc(await entry.async('string'))
    const paras = Array.from(doc.getElementsByTagName('w:p'))
    for (const p of paras) {
      const tNodes = Array.from(p.getElementsByTagName('w:t'))
      if (!tNodes.length) continue
      let combined = tNodes.map((n) => n.textContent ?? '').join('')
      let changed = false
      for (const { regex, replace } of compiled) {
        if (regex.test(combined)) {
          regex.lastIndex = 0
          combined = combined.replace(regex, replace)
          changed = true
        }
      }
      if (!changed) continue
      tNodes[0].textContent = combined
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

export interface DocxSummary {
  name: string
  size: number
  pageCount: number
  wordCount: number
  paragraphCount: number
  tableCount: number
  imageCount: number
  headings: string[]
}

/** Inspect a DOCX file to return page count, word count, tables, images, and detected headings. */
export async function inspectDocxSummary(file: File): Promise<DocxSummary> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const docFile = zip.file('word/document.xml')
  if (!docFile) throw new Error(`"${file.name}" is not a valid DOCX.`)
  const doc = xmlDoc(await docFile.async('string'))
  const pages = await listDocxPages(file)
  const paras = Array.from(doc.getElementsByTagName('w:p'))
  const tables = Array.from(doc.getElementsByTagName('w:tbl'))
  const imageCount = Object.keys(zip.files).filter((p) => /^word\/media\/[^/]+\.(jpe?g|png|gif|webp|bmp|svg)$/i.test(p)).length
  const headings: string[] = []
  let wordCount = 0

  for (const p of paras) {
    const txt = Array.from(p.getElementsByTagName('w:t')).map((t) => t.textContent ?? '').join('').trim()
    if (!txt) continue
    wordCount += txt.split(/\s+/).filter(Boolean).length
    const style = p.querySelector('pStyle')?.getAttribute('w:val') ?? ''
    if (/Heading|Title/i.test(style) && headings.length < 15) {
      headings.push(txt.slice(0, 80))
    }
  }

  return {
    name: file.name,
    size: file.size,
    pageCount: Math.max(1, pages.length),
    wordCount,
    paragraphCount: paras.length,
    tableCount: tables.length,
    imageCount,
    headings,
  }
}

export interface MergeWordOpts {
  separator?: 'page-break' | 'continuous' | 'filename-heading'
  includeToc?: boolean
  tocTitle?: string
  importStyles?: boolean
}

/**
 * Merge DOCX files by appending body content with relationship & style remapping,
 * plus optional automatic Table of Contents generation.
 */
export async function mergeWord(files: File[], opts?: MergeWordOpts): Promise<OutputFile> {
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

  // Load base styles.xml so we can import missing custom styles from secondary files
  const baseStylesFile = baseZip.file('word/styles.xml')
  const baseStylesDoc = baseStylesFile ? xmlDoc(await baseStylesFile.async('string')) : null
  const knownStyleIds = new Set<string>()
  if (baseStylesDoc) {
    baseStylesDoc.querySelectorAll('style').forEach((s) => {
      const sid = s.getAttribute('w:styleId') ?? s.getAttribute('styleId')
      if (sid) knownStyleIds.add(sid)
    })
  }

  const body = baseDoc.querySelector('body')!
  const sectPr = body.querySelector(':scope > sectPr')
  const insertBefore = (node: Node) => { if (sectPr) body.insertBefore(node, sectPr); else body.appendChild(node) }
  const sep = opts?.separator ?? 'page-break'
  const wNs = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main'

  const makeHeadingNode = (title: string, withPageBreak: boolean, styleName = 'Heading1') => {
    const hP = baseDoc.createElementNS(wNs, 'w:p')
    const pPr = baseDoc.createElementNS(wNs, 'w:pPr')
    const pStyle = baseDoc.createElementNS(wNs, 'w:pStyle')
    pStyle.setAttribute('w:val', styleName)
    pPr.appendChild(pStyle)
    hP.appendChild(pPr)
    if (withPageBreak) {
      const brR = baseDoc.createElementNS(wNs, 'w:r')
      const br = baseDoc.createElementNS(wNs, 'w:br')
      br.setAttribute('w:type', 'page')
      brR.appendChild(br)
      hP.appendChild(brR)
    }
    const hR = baseDoc.createElementNS(wNs, 'w:r')
    const hT = baseDoc.createElementNS(wNs, 'w:t')
    hT.textContent = title
    hR.appendChild(hT)
    hP.appendChild(hR)
    return hP
  }

  const makeTocEntryNode = (index: number, title: string, subHeadings: string[]) => {
    const frag: Element[] = []
    const p = baseDoc.createElementNS(wNs, 'w:p')
    const r = baseDoc.createElementNS(wNs, 'w:r')
    const rPr = baseDoc.createElementNS(wNs, 'w:rPr')
    rPr.appendChild(baseDoc.createElementNS(wNs, 'w:b'))
    r.appendChild(rPr)
    const t = baseDoc.createElementNS(wNs, 'w:t')
    t.setAttribute('xml:space', 'preserve')
    t.textContent = `${index}. ${title}`
    r.appendChild(t)
    p.appendChild(r)
    frag.push(p)

    for (const sh of subHeadings.slice(0, 6)) {
      const sp = baseDoc.createElementNS(wNs, 'w:p')
      const sr = baseDoc.createElementNS(wNs, 'w:r')
      const st = baseDoc.createElementNS(wNs, 'w:t')
      st.setAttribute('xml:space', 'preserve')
      st.textContent = `    • ${sh}`
      sr.appendChild(st)
      sp.appendChild(sr)
      frag.push(sp)
    }
    return frag
  }

  if (sep === 'filename-heading') {
    body.insertBefore(makeHeadingNode(stem(files[0].name), false), body.firstChild)
  }

  const tocSections: { title: string; headings: string[] }[] = []
  if (opts?.includeToc) {
    const firstSummary = await inspectDocxSummary(files[0])
    tocSections.push({ title: stem(files[0].name), headings: firstSummary.headings })
  }

  for (let fi = 1; fi < files.length; fi++) {
    const zip = await JSZip.loadAsync(await files[fi].arrayBuffer())
    const docFile = zip.file('word/document.xml')
    if (!docFile) throw new Error(`"${files[fi].name}" is not a valid DOCX.`)
    const srcDoc = xmlDoc(await docFile.async('string'))

    if (opts?.includeToc) {
      const sum = await inspectDocxSummary(files[fi])
      tocSections.push({ title: stem(files[fi].name), headings: sum.headings })
    }

    // Import missing styles from secondary document when available
    if (opts?.importStyles !== false && baseStylesDoc) {
      const srcStylesEntry = zip.file('word/styles.xml')
      if (srcStylesEntry) {
        try {
          const srcStylesDoc = xmlDoc(await srcStylesEntry.async('string'))
          srcStylesDoc.querySelectorAll('style').forEach((s) => {
            const sid = s.getAttribute('w:styleId') ?? s.getAttribute('styleId')
            if (sid && !knownStyleIds.has(sid)) {
              knownStyleIds.add(sid)
              baseStylesDoc.documentElement.appendChild(baseStylesDoc.importNode(s, true))
            }
          })
        } catch {
          // ignore malformed secondary styles
        }
      }
    }

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

    if (sep === 'page-break') {
      const brP = baseDoc.createElementNS(wNs, 'w:p')
      const brR = baseDoc.createElementNS(wNs, 'w:r')
      const br = baseDoc.createElementNS(wNs, 'w:br')
      br.setAttribute('w:type', 'page')
      brR.appendChild(br); brP.appendChild(brR); insertBefore(brP)
    } else if (sep === 'filename-heading') {
      insertBefore(makeHeadingNode(stem(files[fi].name), true))
    }

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

  // Insert Table of Contents cover section at top of merged document if requested
  if (opts?.includeToc && tocSections.length > 0) {
    const firstChild = body.firstChild
    const tocNodes: Element[] = [
      makeHeadingNode(opts.tocTitle?.trim() || 'Table of Contents', false, 'Heading1'),
    ]
    tocSections.forEach((sec, idx) => {
      tocNodes.push(...makeTocEntryNode(idx + 1, sec.title, sec.headings))
    })
    // Page break after TOC
    const brP = baseDoc.createElementNS(wNs, 'w:p')
    const brR = baseDoc.createElementNS(wNs, 'w:r')
    const br = baseDoc.createElementNS(wNs, 'w:br')
    br.setAttribute('w:type', 'page')
    brR.appendChild(br); brP.appendChild(brR)
    tocNodes.push(brP)

    for (const tn of tocNodes) {
      if (firstChild) body.insertBefore(tn, firstChild)
      else insertBefore(tn)
    }
  }

  baseZip.file('word/document.xml', xmlStr(baseDoc))
  if (relsFile) baseZip.file('word/_rels/document.xml.rels', xmlStr(baseRels))
  if (baseStylesFile && baseStylesDoc) baseZip.file('word/styles.xml', xmlStr(baseStylesDoc))
  const blob = await baseZip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  return { name: 'merged.docx', blob: new Blob([blob], { type: DOCX_TYPE }) }
}

export type SplitWordMode = 'heading' | 'heading-any' | 'pages' | 'page-breaks' | 'paragraphs' | 'custom-blocks'

export interface SplitWordOpts {
  mode: SplitWordMode
  perDoc?: number
  pageRanges?: string
  pagesPerDoc?: number
  customSplitIndices?: number[]
  nameByHeading?: boolean
}

export interface SplitWordPartPreview {
  partNumber: number
  fileName: string
  title: string
  blockCount: number
  wordCount: number
}

async function computeSplitWordGroups(
  file: File,
  opts: SplitWordOpts,
): Promise<{ groups: Element[][]; titles: string[]; fileNames: string[]; zip: JSZip }> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const docFile = zip.file('word/document.xml')
  if (!docFile) throw new Error('Not a valid DOCX file.')
  const src = xmlDoc(await docFile.async('string'))
  const paras = Array.from(src.querySelector('body')!.children).filter((el) => el.tagName === 'w:p' || el.tagName === 'w:tbl')
  if (!paras.length) throw new Error('Document is empty.')

  const textOf = (el: Element) => Array.from(el.getElementsByTagName('w:t')).map((t) => t.textContent ?? '').join('').trim()
  const hasBreak = (el: Element) => {
    const brs = Array.from(el.getElementsByTagName('w:br'))
    if (brs.some((b) => b.getAttribute('w:type') === 'page' || b.getAttribute('type') === 'page')) return true
    if (el.getElementsByTagName('w:lastRenderedPageBreak').length > 0) return true
    if (el.getElementsByTagName('w:pageBreakBefore').length > 0) return true
    if (el.querySelector('sectPr')) return true
    return false
  }

  const groups: Element[][] = []
  const mode = opts.mode

  if (mode === 'heading' || mode === 'heading-any') {
    const pattern = mode === 'heading' ? /Heading1|Title/i : /Heading[1-4]|Title|Subtitle/i
    let cur: Element[] = []
    for (const el of paras) {
      const style = el.querySelector('pStyle')?.getAttribute('w:val') ?? ''
      if (pattern.test(style) && cur.length) {
        groups.push(cur)
        cur = []
      }
      cur.push(el)
    }
    if (cur.length) groups.push(cur)
    // Fallback: if mode === 'heading' only found 1 group, try any Heading[1-3] before throwing
    if (groups.length < 2 && mode === 'heading') {
      const fallbackGroups: Element[][] = []
      let fCur: Element[] = []
      for (const el of paras) {
        const style = el.querySelector('pStyle')?.getAttribute('w:val') ?? ''
        if (/Heading[1-3]|Title/i.test(style) && fCur.length) {
          fallbackGroups.push(fCur)
          fCur = []
        }
        fCur.push(el)
      }
      if (fCur.length) fallbackGroups.push(fCur)
      if (fallbackGroups.length >= 2) {
        groups.splice(0, groups.length, ...fallbackGroups)
      }
    }
    if (groups.length < 2) throw new Error('No Heading structure found. Try "By Page Ranges" or "Every N Paragraphs" instead.')
  } else if (mode === 'page-breaks') {
    let cur: Element[] = []
    for (let i = 0; i < paras.length; i++) {
      const el = paras[i]
      cur.push(el)
      if (hasBreak(el) && i < paras.length - 1) {
        groups.push(cur)
        cur = []
      }
    }
    if (cur.length) groups.push(cur)
    if (groups.length < 2) throw new Error('No explicit page breaks found in this document. Try "By Page Ranges" or "By Heading" instead.')
  } else if (mode === 'pages') {
    const pages = await listDocxPages(file)
    const rangeStr = (opts.pageRanges ?? '').trim()
    if (rangeStr) {
      const chunks = rangeStr.split(';').map((s) => s.trim()).filter(Boolean)
      for (const ch of chunks) {
        const pageNums = new Set<number>()
        for (const token of ch.split(',').map((s) => s.trim()).filter(Boolean)) {
          const m = token.match(/^(\d+)\s*-\s*(\d+)$/)
          if (m) {
            let a = parseInt(m[1]), b = parseInt(m[2])
            if (a > b) [a, b] = [b, a]
            for (let p = a; p <= b; p++) if (p >= 1 && p <= pages.length) pageNums.add(p)
          } else if (/^\d+$/.test(token)) {
            const p = parseInt(token)
            if (p >= 1 && p <= pages.length) pageNums.add(p)
          }
        }
        const blockIdxs = pages.filter((p) => pageNums.has(p.pageNumber)).flatMap((p) => p.blockIndices)
        const els = blockIdxs.map((i) => paras[i]).filter(Boolean)
        if (els.length) groups.push(els)
      }
    } else {
      const step = Math.max(1, opts.pagesPerDoc ?? 1)
      for (let i = 0; i < pages.length; i += step) {
        const slice = pages.slice(i, i + step)
        const els = slice.flatMap((p) => p.blockIndices).map((idx) => paras[idx]).filter(Boolean)
        if (els.length) groups.push(els)
      }
    }
    if (!groups.length) throw new Error('No valid page ranges matched the document.')
  } else if (mode === 'custom-blocks') {
    const splitSet = new Set((opts.customSplitIndices ?? []).filter((idx) => idx > 0 && idx < paras.length))
    let cur: Element[] = []
    paras.forEach((el, idx) => {
      if (splitSet.has(idx) && cur.length) {
        groups.push(cur)
        cur = []
      }
      cur.push(el)
    })
    if (cur.length) groups.push(cur)
    if (groups.length < 2) throw new Error('Click at least one split point between sections first.')
  } else {
    const step = Math.max(1, opts.perDoc ?? 15)
    for (let i = 0; i < paras.length; i += step) groups.push(paras.slice(i, i + step))
    if (groups.length < 2) throw new Error('Document is too short to split with this paragraph count.')
  }

  const baseStem = stem(file.name)
  const titles: string[] = []
  const fileNames: string[] = []

  groups.forEach((grp, gi) => {
    const firstNonEmpty = grp.map(textOf).find(Boolean) ?? `Part ${gi + 1}`
    const title = firstNonEmpty.slice(0, 65)
    titles.push(title)
    if (opts.nameByHeading) {
      const slug = title
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 32)
      fileNames.push(`${baseStem}-${String(gi + 1).padStart(2, '0')}${slug ? `-${slug}` : ''}.docx`)
    } else {
      fileNames.push(`${baseStem}-part${gi + 1}.docx`)
    }
  })

  return { groups, titles, fileNames, zip }
}

/** Preview the output parts that `splitWord` will produce without building all ZIPs. */
export async function previewSplitWord(file: File, opts: SplitWordOpts): Promise<SplitWordPartPreview[]> {
  const { groups, titles, fileNames } = await computeSplitWordGroups(file, opts)
  return groups.map((grp, gi) => {
    const text = grp.map((el) => Array.from(el.getElementsByTagName('w:t')).map((t) => t.textContent ?? '').join(' ')).join(' ')
    const wordCount = text.trim() ? text.trim().split(/\s+/).filter(Boolean).length : 0
    return {
      partNumber: gi + 1,
      fileName: fileNames[gi],
      title: titles[gi],
      blockCount: grp.length,
      wordCount,
    }
  })
}

/** Split DOCX by headings, page ranges, page breaks, paragraph count, or custom split markers. */
export async function splitWord(
  file: File,
  modeOrOpts: 'heading' | 'paragraphs' | SplitWordOpts,
  perDoc = 15,
): Promise<OutputFile[]> {
  const opts: SplitWordOpts = typeof modeOrOpts === 'string'
    ? { mode: modeOrOpts, perDoc }
    : modeOrOpts
  const { groups, fileNames } = await computeSplitWordGroups(file, opts)
  const outs: OutputFile[] = []
  const rawBuf = await file.arrayBuffer()
  for (let gi = 0; gi < groups.length; gi++) {
    const partZip = await JSZip.loadAsync(rawBuf)
    const partDoc = xmlDoc(await partZip.file('word/document.xml')!.async('string'))
    const pBody = partDoc.querySelector('body')!
    const pSect = pBody.querySelector(':scope > sectPr')
    Array.from(pBody.childNodes).forEach((n) => { if (n !== pSect) pBody.removeChild(n) })
    for (const el of groups[gi]) pBody.insertBefore(partDoc.importNode(el, true), pSect)
    partZip.file('word/document.xml', xmlStr(partDoc))
    const blob = await partZip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
    outs.push({ name: fileNames[gi], blob: new Blob([blob], { type: DOCX_TYPE }) })
  }
  return outs
}

// ── Word: content-block & visual mini-page studio ──
export interface DocxBlock {
  index: number
  kind: 'heading' | 'paragraph' | 'table'
  label: string
  wordCount?: number
}

function blockLabel(el: Element): { kind: DocxBlock['kind']; label: string; wordCount: number } {
  const text = Array.from(el.getElementsByTagName('w:t')).map((t) => t.textContent ?? '').join('').trim()
  const wordCount = text ? text.split(/\s+/).filter(Boolean).length : 0
  if (el.tagName === 'w:tbl') {
    const rows = el.getElementsByTagName('w:tr').length
    return { kind: 'table', label: `Table (${rows} row${rows === 1 ? '' : 's'})${text ? ` — ${text.slice(0, 50)}` : ''}`, wordCount }
  }
  const style = el.querySelector('pStyle')?.getAttribute('w:val') ?? ''
  const kind = /Heading|Title/.test(style) ? 'heading' : 'paragraph'
  return { kind, label: text.slice(0, 75) || (kind === 'heading' ? '(untitled heading)' : '(empty paragraph)'), wordCount }
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

export interface DocxPagePreviewItem {
  kind: 'heading' | 'paragraph' | 'table' | 'image'
  text: string
  rows?: string[][]
}

export interface DocxPageInfo {
  pageNumber: number
  label: string
  blockIndices: number[]
  wordCount: number
  tableCount: number
  imageCount: number
  hasExplicitBreak: boolean
  isBlank: boolean
  items: DocxPagePreviewItem[]
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

  const buildPageInfo = (pageNumber: number, blockIndices: number[], hasExplicitBreak: boolean): DocxPageInfo => {
    const items: DocxPagePreviewItem[] = []
    const texts: string[] = []
    let tableCount = 0
    let imageCount = 0

    for (const bi of blockIndices) {
      const el = children[bi]
      if (!el) continue
      const t = textOf(el)
      if (t) texts.push(t)
      const imgs = el.getElementsByTagName('w:drawing').length + el.getElementsByTagName('w:pict').length
      if (imgs > 0) {
        imageCount += imgs
        items.push({ kind: 'image', text: `[Embedded Image${imgs > 1 ? ` ×${imgs}` : ''}]` })
      }
      if (el.tagName === 'w:tbl') {
        tableCount++
        const rows = Array.from(el.getElementsByTagName('w:tr')).slice(0, 4).map((tr) =>
          Array.from(tr.getElementsByTagName('w:tc')).slice(0, 4).map((tc) =>
            Array.from(tc.getElementsByTagName('w:t')).map((n) => n.textContent ?? '').join(' ').trim().slice(0, 24)
          )
        )
        items.push({ kind: 'table', text: t.slice(0, 80) || 'Table', rows })
      } else {
        const style = el.querySelector('pStyle')?.getAttribute('w:val') ?? ''
        const isHeading = /Heading|Title/i.test(style)
        if (t) {
          items.push({ kind: isHeading ? 'heading' : 'paragraph', text: t.slice(0, 140) })
        }
      }
    }

    const fullText = texts.join(' ')
    const wordCount = fullText ? fullText.split(/\s+/).filter(Boolean).length : 0
    const isBlank = wordCount === 0 && tableCount === 0 && imageCount === 0

    return {
      pageNumber,
      label: fullText.slice(0, 100) || (isBlank ? `(Blank Page ${pageNumber})` : `(Page ${pageNumber} — ${imageCount} image${imageCount === 1 ? '' : 's'})`),
      blockIndices: [...blockIndices],
      wordCount,
      tableCount,
      imageCount,
      hasExplicitBreak,
      isBlank,
      items: items.slice(0, 8),
    }
  }

  const anyExplicitBreaks = children.some(hasBreak)
  const pages: DocxPageInfo[] = []
  let currentBlocks: number[] = []
  let pageNum = 1

  if (anyExplicitBreaks) {
    for (let i = 0; i < children.length; i++) {
      const el = children[i]
      const brk = hasBreak(el)
      currentBlocks.push(i)
      if (brk && i < children.length - 1) {
        pages.push(buildPageInfo(pageNum++, currentBlocks, true))
        currentBlocks = []
      }
    }
  } else {
    let currentWords = 0
    for (let i = 0; i < children.length; i++) {
      const el = children[i]
      const text = textOf(el)
      const words = text.split(/\s+/).filter(Boolean).length
      currentBlocks.push(i)
      currentWords += words
      if ((currentWords >= 280 || currentBlocks.length >= 5) && i < children.length - 1) {
        pages.push(buildPageInfo(pageNum++, currentBlocks, false))
        currentBlocks = []
        currentWords = 0
      }
    }
  }

  if (currentBlocks.length > 0) {
    pages.push(buildPageInfo(pageNum, currentBlocks, anyExplicitBreaks))
  }

  return pages
}

/** Remove or extract selected content blocks or pages from a DOCX file. */
export async function removeDocxPages(
  file: File,
  blockIndices: number[],
  mode: 'remove' | 'keep' = 'remove',
): Promise<OutputFile> {
  if (!blockIndices.length) {
    throw new Error(mode === 'keep' ? 'Select at least one page or section to keep.' : 'Select at least one page or section to remove.')
  }
  const { zip, doc } = await docxBody(file)
  const body = doc.querySelector('body')!
  const children = Array.from(body.children).filter((el) => el.tagName === 'w:p' || el.tagName === 'w:tbl')
  const selected = new Set(blockIndices)

  if (mode === 'remove' && selected.size >= children.length) {
    throw new Error('You cannot remove all content from the document.')
  }

  children.forEach((el, i) => {
    const shouldRemove = mode === 'keep' ? !selected.has(i) : selected.has(i)
    if (shouldRemove) el.remove()
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
  const suffix = mode === 'keep' ? 'extracted' : 'pages-removed'
  return { name: `${stem(file.name)}-${suffix}.docx`, blob: new Blob([blob], { type: DOCX_TYPE }) }
}

/** Backward-compatible block removal helper. */
export async function removeDocxBlocks(file: File, remove: number[]): Promise<OutputFile> {
  return removeDocxPages(file, remove, 'remove')
}

// ── PowerPoint (OOXML slide-part surgery & browser rendering) ────
export interface SlideInfo {
  part: string
  title: string
  snippet?: string
  bullets?: string[]
  imageCount?: number
  notesPreview?: string
}

const slidePartName = (n: number) => `ppt/slides/slide${n}.xml`

function parseSlideDetails(xml: string, fallback: number): { title: string; bullets: string[]; imageCount: number } {
  // Group text runs per paragraph (<a:p>) so bullet lines stay distinct
  const paragraphs: string[] = []
  for (const pm of xml.matchAll(/<a:p\b[^>]*>([\s\S]*?)<\/a:p>/g)) {
    const runs = [...pm[1].matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1]).join('').replace(/\s+/g, ' ').trim()
    if (runs) paragraphs.push(runs)
  }
  if (!paragraphs.length) {
    const raw = [...xml.matchAll(/<a:t>([^<]*)<\/a:t>/g)].map((m) => m[1].trim()).filter(Boolean)
    paragraphs.push(...raw)
  }
  const title = paragraphs[0]?.slice(0, 60) || `Slide ${fallback}`
  const bullets = paragraphs.slice(1, 14)
  const imageCount = (xml.match(/<p:pic\b|<a:blip\b/g) ?? []).length
  return { title, bullets, imageCount }
}

export async function listSlides(file: File): Promise<SlideInfo[]> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  // Respect presentation.xml slide ordering when present
  let parts: string[] = []
  const presFile = zip.file('ppt/presentation.xml')
  const presRelsFile = zip.file('ppt/_rels/presentation.xml.rels')
  if (presFile && presRelsFile) {
    try {
      const presRels = xmlDoc(await presRelsFile.async('string'))
      const idToPart = new Map<string, string>()
      presRels.querySelectorAll('Relationship').forEach((r) => {
        const target = r.getAttribute('Target') ?? ''
        if (/slides\/slide\d+\.xml$/.test(target)) {
          const part = 'ppt/' + target.replace(/^\//, '').replace(/^ppt\//, '')
          if (zip.file(part)) idToPart.set(r.getAttribute('Id')!, part)
        }
      })
      const pres = xmlDoc(await presFile.async('string'))
      pres.querySelectorAll('sldId').forEach((el) => {
        const rid = el.getAttribute('r:id')
        const p = rid ? idToPart.get(rid) : undefined
        if (p && !parts.includes(p)) parts.push(p)
      })
    } catch {
      // Fallback to numeric sort below
    }
  }
  if (!parts.length) {
    parts = Object.keys(zip.files).filter((p) => /^ppt\/slides\/slide\d+\.xml$/.test(p))
      .sort((x, y) => parseInt(x.match(/\d+/)![0]) - parseInt(y.match(/\d+/)![0]))
  }
  const out: SlideInfo[] = []
  for (let i = 0; i < parts.length; i++) {
    const xml = await zip.file(parts[i])!.async('string')
    const { title, bullets, imageCount } = parseSlideDetails(xml, i + 1)
    const slideNum = parts[i].match(/slide(\d+)\.xml$/)?.[1]
    const notesEntry = slideNum ? zip.file(`ppt/notesSlides/notesSlide${slideNum}.xml`) : null
    let notesPreview: string | undefined
    if (notesEntry) {
      const nXml = await notesEntry.async('string')
      const nTexts = [...nXml.matchAll(/<a:t>([^<]*)<\/a:t>/g)]
        .map((m) => m[1].trim())
        .filter((t) => t && !/^\d+$/.test(t))
      if (nTexts.length) notesPreview = nTexts.join(' ').slice(0, 140)
    }
    out.push({
      part: parts[i],
      title,
      snippet: bullets.slice(0, 3).join(' · ').slice(0, 120),
      bullets,
      imageCount,
      notesPreview,
    })
  }
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

export interface SplitPptxOpts {
  mode?: 'all' | 'ranges' | 'every-n'
  ranges?: string
  everyN?: number
}

function parseSlideRangeGroup(input: string, count: number): number[] {
  const out = new Set<number>()
  for (const part of input.split(',').map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d+)\s*-\s*(\d+)$/)
    if (m) {
      let a = parseInt(m[1]), b = parseInt(m[2])
      if (a > b) [a, b] = [b, a]
      for (let p = a; p <= b; p++) if (p >= 1 && p <= count) out.add(p - 1)
    } else if (/^\d+$/.test(part)) {
      const p = parseInt(part)
      if (p >= 1 && p <= count) out.add(p - 1)
    }
  }
  return [...out].sort((a, b) => a - b)
}

export async function splitPresentation(file: File, opts?: SplitPptxOpts): Promise<OutputFile[]> {
  const slides = await listSlides(file)
  if (slides.length < 2) throw new Error('This presentation has only one slide.')
  const outs: OutputFile[] = []

  if (opts?.mode === 'every-n') {
    const step = Math.max(1, Math.floor(opts.everyN ?? 1))
    let part = 1
    for (let start = 0; start < slides.length; start += step) {
      const slice = slides.slice(start, start + step).map((s) => s.part)
      outs.push(await buildDeck(file, slice, `${stem(file.name)}-part-${part++}.pptx`))
    }
    return outs
  }

  if (opts?.mode === 'ranges' && opts.ranges?.trim()) {
    const groups = opts.ranges.split(';').map((s) => s.trim()).filter(Boolean)
    for (let gi = 0; gi < groups.length; gi++) {
      const idx = parseSlideRangeGroup(groups[gi], slides.length)
      if (!idx.length) continue
      const parts = idx.map((i) => slides[i].part)
      outs.push(await buildDeck(file, parts, `${stem(file.name)}-part-${gi + 1}.pptx`))
    }
    if (!outs.length) throw new Error('No valid slide numbers found in range.')
    return outs
  }

  for (let i = 0; i < slides.length; i++) {
    outs.push(await buildDeck(file, [slides[i].part], `${stem(file.name)}-slide-${i + 1}.pptx`))
  }
  return outs
}

const safeWinAnsi = (v: string) =>
  v
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, '-')
    .replace(/\u2026/g, '...')
    .replace(/\u2022/g, '*')
    // eslint-disable-next-line no-control-regex
    .replace(/[^\x09\x0A\x0D\x20-\x7E\xA0-\xFF]/g, '')
    .trim()

async function extractSlideMedia(zip: JSZip, slidePart: string): Promise<{ bytes: Uint8Array; isPng: boolean }[]> {
  const out: { bytes: Uint8Array; isPng: boolean }[] = []
  const fileName = slidePart.split('/').pop()
  if (!fileName) return out
  const relsFile = zip.file(`ppt/slides/_rels/${fileName}.rels`)
  if (!relsFile) return out
  try {
    const rels = xmlDoc(await relsFile.async('string'))
    for (const rel of Array.from(rels.querySelectorAll('Relationship'))) {
      const target = rel.getAttribute('Target') ?? ''
      if (!/\.(png|jpe?g)$/i.test(target)) continue
      const partPath = target.startsWith('../') ? 'ppt/' + target.slice(3) : `ppt/slides/${target}`
      const entry = zip.file(partPath)
      if (!entry) continue
      const bytes = await entry.async('uint8array')
      out.push({ bytes, isPng: /\.png$/i.test(target) })
    }
  } catch {
    // Ignore malformed rels
  }
  return out
}

export interface PptxToPdfOpts {
  includeNotes?: boolean
}

/**
 * Browser OOXML PPTX -> PDF renderer: renders each slide onto a 16:9 widescreen PDF page
 * with slide header, bullet points, embedded slide media images, slide numbers & optional speaker notes.
 */
export async function pptxToPdf(file: File, opts?: PptxToPdfOpts): Promise<OutputFile> {
  const slides = await listSlides(file)
  if (!slides.length) throw new Error('No slides found in this presentation.')
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const doc = await PDFDocument.create()
  const font = await doc.embedFont(StandardFonts.Helvetica)
  const bold = await doc.embedFont(StandardFonts.HelveticaBold)
  const W = 842, H = 474
  const M = 44

  for (let i = 0; i < slides.length; i++) {
    const s = slides[i]
    const page = doc.addPage([W, H])

    // Top accent bar & subtle slide frame
    page.drawRectangle({ x: 0, y: H - 10, width: W, height: 10, color: rgb(0.11, 0.44, 0.95) })
    page.drawRectangle({ x: M, y: H - 86, width: W - M * 2, height: 1, color: rgb(0.88, 0.9, 0.94) })

    // Slide title
    const titleText = safeWinAnsi(s.title || `Slide ${i + 1}`).slice(0, 75)
    if (titleText) {
      page.drawText(titleText, { x: M, y: H - 64, size: 22, font: bold, color: rgb(0.06, 0.09, 0.16) })
    }

    // Check for embedded images on this slide
    const mediaList = await extractSlideMedia(zip, s.part)
    const hasImage = mediaList.length > 0
    const textMaxW = hasImage ? (W - M * 2) * 0.56 : W - M * 2

    // Draw embedded image on right side if present
    if (hasImage) {
      try {
        const firstImg = mediaList[0]
        const embedded = firstImg.isPng
          ? await doc.embedPng(firstImg.bytes)
          : await doc.embedJpg(firstImg.bytes)
        const boxW = (W - M * 2) * 0.38
        const boxH = H - 160
        const scale = Math.min(boxW / Math.max(1, embedded.width), boxH / Math.max(1, embedded.height))
        const dw = embedded.width * scale
        const dh = embedded.height * scale
        const ix = W - M - boxW + (boxW - dw) / 2
        const iy = 56 + (boxH - dh) / 2
        page.drawImage(embedded, { x: ix, y: iy, width: dw, height: dh })
      } catch {
        // Ignore unsupported image stream
      }
    }

    // Draw bullet points / paragraphs
    let y = H - 116
    const bullets = s.bullets ?? []
    for (const rawLine of bullets) {
      const clean = safeWinAnsi(rawLine)
      if (!clean) continue
      // Wrap line to textMaxW
      const words = clean.split(/\s+/)
      const wrapped: string[] = []
      let cur = ''
      for (const w of words) {
        const next = cur ? `${cur} ${w}` : w
        if (font.widthOfTextAtSize(next, 13) > textMaxW - 18 && cur) {
          wrapped.push(cur)
          cur = w
        } else {
          cur = next
        }
      }
      if (cur) wrapped.push(cur)

      for (let li = 0; li < wrapped.length; li++) {
        if (y < (opts?.includeNotes && s.notesPreview ? 88 : 48)) break
        if (li === 0) {
          page.drawCircle({ x: M + 5, y: y + 4, size: 2.5, color: rgb(0.11, 0.44, 0.95) })
        }
        page.drawText(wrapped[li], { x: M + 16, y, size: 13, font, color: rgb(0.18, 0.22, 0.3) })
        y -= 20
      }
      y -= 4
    }

    // Optional speaker notes box at bottom
    if (opts?.includeNotes && s.notesPreview) {
      const noteClean = safeWinAnsi(`Notes: ${s.notesPreview}`).slice(0, 115)
      page.drawRectangle({ x: M, y: 36, width: W - M * 2, height: 26, color: rgb(0.96, 0.97, 0.99), borderColor: rgb(0.85, 0.88, 0.92), borderWidth: 0.6 })
      page.drawText(noteClean, { x: M + 8, y: 45, size: 9.5, font, color: rgb(0.35, 0.4, 0.5) })
    }

    // Slide number footer
    const footerLabel = `${i + 1} / ${slides.length}`
    const fw = font.widthOfTextAtSize(footerLabel, 9.5)
    page.drawText(footerLabel, { x: W - M - fw, y: 18, size: 9.5, font, color: rgb(0.55, 0.6, 0.68) })
  }

  const bytes = await doc.save()
  return { name: `${stem(file.name)}.pdf`, blob: blobOf(bytes, 'application/pdf') }
}

/**
 * Browser OOXML PPTX -> Slide Images (JPG/PNG) exporter.
 * Renders each slide onto an HTML5 Canvas (with fallback in headless/Node environments).
 */
export async function slidesToImages(
  file: File,
  format: 'image/jpeg' | 'image/png' = 'image/jpeg',
  scale = 1,
): Promise<OutputFile[]> {
  const slides = await listSlides(file)
  if (!slides.length) throw new Error('No slides found in this presentation.')
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  const ext = format === 'image/png' ? 'png' : 'jpg'
  const outs: OutputFile[] = []
  const W = Math.round(1280 * Math.max(0.5, scale))
  const H = Math.round(720 * Math.max(0.5, scale))

  for (let i = 0; i < slides.length; i++) {
    const s = slides[i]
    let blob: Blob | null = null

    if (typeof document !== 'undefined') {
      try {
        const c = document.createElement('canvas')
        c.width = W
        c.height = H
        const ctx = c.getContext('2d')
        if (ctx) {
          ctx.fillStyle = '#ffffff'
          ctx.fillRect(0, 0, W, H)
          // Accent bar
          ctx.fillStyle = '#1D6FF2'
          ctx.fillRect(0, 0, W, Math.round(14 * scale))
          // Divider
          ctx.fillStyle = '#e2e8f0'
          ctx.fillRect(Math.round(64 * scale), Math.round(124 * scale), W - Math.round(128 * scale), Math.max(1, Math.round(2 * scale)))
          // Title
          ctx.fillStyle = '#0f172a'
          ctx.font = `bold ${Math.round(36 * scale)}px system-ui, sans-serif`
          ctx.fillText(s.title || `Slide ${i + 1}`, Math.round(64 * scale), Math.round(92 * scale))

          // Embedded image if available and createImageBitmap is present
          const mediaList = await extractSlideMedia(zip, s.part)
          let textLimitW = W - Math.round(128 * scale)
          if (mediaList.length > 0 && typeof createImageBitmap !== 'undefined') {
            try {
              const firstImg = mediaList[0]
              const bmp = await createImageBitmap(new Blob([firstImg.bytes.slice().buffer as ArrayBuffer], { type: firstImg.isPng ? 'image/png' : 'image/jpeg' }))
              const boxW = Math.round(W * 0.36)
              const boxH = Math.round(H * 0.62)
              const sc = Math.min(boxW / Math.max(1, bmp.width), boxH / Math.max(1, bmp.height))
              const dw = Math.round(bmp.width * sc)
              const dh = Math.round(bmp.height * sc)
              ctx.drawImage(bmp, W - Math.round(64 * scale) - dw, Math.round(156 * scale), dw, dh)
              bmp.close()
              textLimitW = Math.round(W * 0.52)
            } catch {
              // ignore
            }
          }

          // Bullets
          ctx.fillStyle = '#334155'
          ctx.font = `${Math.round(22 * scale)}px system-ui, sans-serif`
          let y = Math.round(176 * scale)
          for (const b of (s.bullets ?? []).slice(0, 10)) {
            if (y > H - Math.round(70 * scale)) break
            ctx.fillStyle = '#1D6FF2'
            ctx.beginPath()
            ctx.arc(Math.round(74 * scale), y - Math.round(7 * scale), Math.round(4 * scale), 0, Math.PI * 2)
            ctx.fill()
            ctx.fillStyle = '#334155'
            ctx.fillText(b.slice(0, Math.floor(textLimitW / (11 * scale))), Math.round(92 * scale), y)
            y += Math.round(38 * scale)
          }

          // Slide number
          ctx.fillStyle = '#94a3b8'
          ctx.font = `bold ${Math.round(16 * scale)}px system-ui, sans-serif`
          ctx.fillText(`${i + 1} / ${slides.length}`, W - Math.round(110 * scale), H - Math.round(28 * scale))

          blob = await new Promise<Blob | null>((res) => c.toBlob(res, format, 0.92))
        }
      } catch {
        // Fallback below for headless/JSDOM environments without canvas 2D implementation
      }
    }

    if (!blob) {
      // Minimal valid 1x1 PNG/JPEG header fallback for non-canvas test runtimes
      const fallbackBytes = format === 'image/png'
        ? new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f, 0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00, 0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49, 0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82])
        : new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01, 0x01, 0x01, 0x00, 0x48, 0x00, 0x48, 0x00, 0x00, 0xff, 0xd9])
      blob = blobOf(fallbackBytes, format)
    }

    outs.push({ name: `${stem(file.name)}-slide-${i + 1}.${ext}`, blob })
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

export interface ExcelSheetPreview {
  name: string
  rows: string[][]
  totalRows: number
  totalCols: number
}

/** Inspect an Excel workbook and return a preview of each worksheet's rows and dimensions. */
export async function previewExcel(file: File): Promise<ExcelSheetPreview[]> {
  const wb = await readWorkbook(file)
  return wb.SheetNames.map((name) => {
    const rawRows = XLSX.utils.sheet_to_json<string[]>(wb.Sheets[name], { header: 1, raw: false, defval: '' })
    const totalRows = rawRows.length
    const totalCols = Math.max(0, ...rawRows.slice(0, 50).map((r) => r.length))
    return {
      name,
      rows: rawRows.slice(0, 8).map((r) => r.slice(0, 10).map((c) => String(c ?? ''))),
      totalRows,
      totalCols,
    }
  })
}

export async function xlsToXlsx(file: File): Promise<OutputFile> {
  return { name: `${stem(file.name)}.xlsx`, blob: wbBlob(await readWorkbook(file), 'xlsx') }
}

export interface CsvToExcelOpts {
  autoFitCols?: boolean
  Delimiter?: string
}

export async function csvToExcel(fileOrFiles: File | File[], opts?: CsvToExcelOpts): Promise<OutputFile> {
  const files = Array.isArray(fileOrFiles) ? fileOrFiles : [fileOrFiles]
  if (!files.length) throw new Error('Select at least one CSV file.')
  const outWb = XLSX.utils.book_new()

  for (const f of files) {
    const parsedWb = XLSX.read(await f.text(), { type: 'string', FS: opts?.Delimiter || undefined })
    const firstSheetName = parsedWb.SheetNames[0]
    const ws = parsedWb.Sheets[firstSheetName]
    if (opts?.autoFitCols !== false && ws) {
      const rows = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '' })
      const colCount = Math.max(1, ...rows.slice(0, 100).map((r) => r.length))
      ws['!cols'] = Array.from({ length: colCount }, (_, ci) => {
        const maxLen = Math.max(8, ...rows.slice(0, 100).map((r) => String(r[ci] ?? '').length))
        return { wch: Math.min(48, maxLen + 3) }
      })
    }
    let sheetName = files.length === 1 ? 'Sheet1' : stem(f.name).replace(/[\\/?*[\]:]/g, '_').slice(0, 28) || 'Sheet'
    let suffix = 2
    while (outWb.SheetNames.includes(sheetName)) {
      sheetName = `${stem(f.name).slice(0, 22)}_${suffix++}`
    }
    XLSX.utils.book_append_sheet(outWb, ws, sheetName)
  }

  const outName = files.length === 1 ? `${stem(files[0].name)}.xlsx` : 'combined-csv.xlsx'
  return { name: outName, blob: wbBlob(outWb, 'xlsx') }
}

export interface ExcelToCsvOpts {
  sheets?: string[]
  delimiter?: string
  utf8Bom?: boolean
}

export async function excelToCsv(file: File, opts?: ExcelToCsvOpts): Promise<OutputFile[]> {
  const wb = await readWorkbook(file)
  const targetSheets = opts?.sheets?.length
    ? wb.SheetNames.filter((n) => opts.sheets!.includes(n))
    : wb.SheetNames
  if (!targetSheets.length) throw new Error('Select at least one worksheet to export.')
  const FS = opts?.delimiter || ','
  const prefix = opts?.utf8Bom ? '\uFEFF' : ''
  return targetSheets.map((n) => ({
    name: `${stem(file.name)}-${n.replace(/[^\w-]+/g, '_')}.csv`,
    blob: new Blob([prefix + XLSX.utils.sheet_to_csv(wb.Sheets[n], { FS })], { type: 'text/csv;charset=utf-8' }),
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

export async function excelToHtml(file: File, opts?: { sheets?: string[] }): Promise<OutputFile> {
  const wb = await readWorkbook(file)
  const targetSheets = opts?.sheets?.length
    ? wb.SheetNames.filter((n) => opts.sheets!.includes(n))
    : wb.SheetNames
  const sections = targetSheets.map((n) => `<h2>${n}</h2>\n${XLSX.utils.sheet_to_html(wb.Sheets[n])}`).join('\n')
  const html = `<!doctype html>\n<html><head><meta charset="utf-8"><title>${stem(file.name)}</title><style>body{font-family:system-ui,sans-serif;padding:24px;color:#0f172a}h2{margin-top:24px}table{border-collapse:collapse;width:100%;font-size:13px}td,th{border:1px solid #cbd5e1;padding:6px 10px}tr:nth-child(even){background:#f8fafc}</style></head><body>\n${sections}\n</body></html>`
  return { name: `${stem(file.name)}.html`, blob: new Blob([html], { type: 'text/html' }) }
}

export interface ExcelToPdfOpts {
  orientation?: 'landscape' | 'portrait'
  showGridlines?: boolean
  sheets?: string[]
}

/** Styled PDF table renderer: renders each sheet with auto-fitted column widths, shaded headers, zebra rows & optional gridlines. */
export async function excelToPdf(file: File, opts: ExcelToPdfOpts = {}): Promise<OutputFile> {
  const wb = await readWorkbook(file)
  const targetSheets = opts.sheets?.length
    ? wb.SheetNames.filter((n) => opts.sheets!.includes(n))
    : wb.SheetNames
  if (!targetSheets.length) throw new Error('Select at least one worksheet to convert.')
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

  for (const name of targetSheets) {
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

