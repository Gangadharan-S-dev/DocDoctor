import JSZip from 'jszip'
import type { OutputFile } from './download'
import { stem } from './download'

// ── ZIP (with configurable compression & WebCrypto AES-256-GCM encryption) ──
export interface ZipCreateOpts {
  level?: number
  password?: string
  archiveName?: string
}

export interface ZipEntryInfo {
  name: string
  uncompressedSize: number
  compressedSize: number
}

export interface ZipArchiveSummary {
  encrypted: boolean
  entries: ZipEntryInfo[]
}

const ENCRYPTED_MANIFEST = '__docdoctor_encrypted_v1__.json'
const ENCRYPTED_PAYLOAD = '__docdoctor_payload__.bin'

async function deriveAesKey(password: string, salt: Uint8Array, usage: KeyUsage[]): Promise<CryptoKey> {
  const enc = new TextEncoder()
  const baseKey = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveKey'])
  return crypto.subtle.deriveKey(
    { name: 'PBKDF2', salt: salt.buffer as ArrayBuffer, iterations: 100_000, hash: 'SHA-256' },
    baseKey,
    { name: 'AES-GCM', length: 256 },
    false,
    usage,
  )
}

export async function createZip(files: File[], opts?: ZipCreateOpts): Promise<OutputFile> {
  const zip = new JSZip()
  const seen = new Map<string, number>()
  for (const f of files) {
    let name = f.name
    const n = (seen.get(name) ?? 0) + 1
    seen.set(f.name, n)
    if (n > 1) name = `${stem(f.name)} (${n}).${f.name.split('.').pop()}`
    zip.file(name, f)
  }
  const level = opts?.level ?? 6
  const innerBlob = await zip.generateAsync({
    type: 'blob',
    compression: level === 0 ? 'STORE' : 'DEFLATE',
    compressionOptions: level === 0 ? undefined : { level },
  })
  const outName = opts?.archiveName?.trim()
    ? (opts.archiveName.trim().toLowerCase().endsWith('.zip') ? opts.archiveName.trim() : `${opts.archiveName.trim()}.zip`)
    : 'files.zip'

  if (opts?.password && opts.password.trim()) {
    const salt = crypto.getRandomValues(new Uint8Array(16))
    const iv = crypto.getRandomValues(new Uint8Array(12))
    const key = await deriveAesKey(opts.password, salt, ['encrypt'])
    const plainBytes = await innerBlob.arrayBuffer()
    const cipherBytes = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, plainBytes)

    const outer = new JSZip()
    outer.file(ENCRYPTED_MANIFEST, JSON.stringify({
      cipher: 'AES-256-GCM',
      kdf: 'PBKDF2-SHA256-100000',
      saltHex: [...salt].map((b) => b.toString(16).padStart(2, '0')).join(''),
      ivHex: [...iv].map((b) => b.toString(16).padStart(2, '0')).join(''),
      fileCount: files.length,
    }, null, 2))
    outer.file(ENCRYPTED_PAYLOAD, new Uint8Array(cipherBytes))
    const encryptedBlob = await outer.generateAsync({ type: 'blob', compression: 'STORE' })
    return { name: outName, blob: encryptedBlob }
  }

  return { name: outName, blob: innerBlob }
}

const safeName = (p: string) => p.replace(/\\/g, '/').split('/').filter((s) => s && s !== '..' && s !== '.').join('/') || 'file'

const MAX_TOTAL_UNCOMPRESSED = 500 * 1048576
const MAX_ENTRY_UNCOMPRESSED = 200 * 1048576

export async function listZipEntries(file: File): Promise<ZipArchiveSummary> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
  if (zip.file(ENCRYPTED_MANIFEST) && zip.file(ENCRYPTED_PAYLOAD)) {
    return { encrypted: true, entries: [] }
  }
  const entries = Object.entries(zip.files)
    .filter(([, e]) => !e.dir)
    .map(([path, entry]) => {
      const data = (entry as unknown as { _data?: { uncompressedSize?: number; compressedSize?: number } })._data
      return {
        name: safeName(path),
        uncompressedSize: data?.uncompressedSize ?? 0,
        compressedSize: data?.compressedSize ?? 0,
      }
    })
  return { encrypted: false, entries }
}

export interface ZipExtractOpts {
  password?: string
  filterNames?: string[]
}

export async function extractZip(file: File, opts?: ZipExtractOpts): Promise<OutputFile[]> {
  let zip = await JSZip.loadAsync(await file.arrayBuffer())

  // Check if this is an AES-256-GCM encrypted DocDoctor ZIP archive
  const manifestEntry = zip.file(ENCRYPTED_MANIFEST)
  const payloadEntry = zip.file(ENCRYPTED_PAYLOAD)
  if (manifestEntry && payloadEntry) {
    if (!opts?.password) {
      throw new Error('This ZIP archive is encrypted with AES-256. Enter the archive password to unlock and extract it.')
    }
    const manifest = JSON.parse(await manifestEntry.async('string')) as { saltHex: string; ivHex: string }
    const fromHex = (hex: string) => new Uint8Array((hex.match(/.{1,2}/g) ?? []).map((b) => parseInt(b, 16)))
    const salt = fromHex(manifest.saltHex)
    const iv = fromHex(manifest.ivHex)
    const key = await deriveAesKey(opts.password, salt, ['decrypt'])
    const cipherBuf = await payloadEntry.async('arraybuffer')
    let plainBuf: ArrayBuffer
    try {
      plainBuf = await crypto.subtle.decrypt({ name: 'AES-GCM', iv }, key, cipherBuf)
    } catch {
      throw new Error('Incorrect ZIP password — AES-256 authentication failed.')
    }
    zip = await JSZip.loadAsync(plainBuf)
  }

  const entries = Object.entries(zip.files).filter(([, e]) => !e.dir)
  if (entries.length > 200) throw new Error('Archive contains more than 200 files — extraction limit reached.')
  // Zip-bomb guard: refuse archives whose declared uncompressed size is absurd.
  let total = 0
  for (const [, entry] of entries) {
    const size = (entry as unknown as { _data?: { uncompressedSize?: number } })._data?.uncompressedSize ?? 0
    if (size > MAX_ENTRY_UNCOMPRESSED) throw new Error('An archive entry exceeds the 200 MB extraction limit.')
    total += size
    if (total > MAX_TOTAL_UNCOMPRESSED) throw new Error('Archive expands beyond the 500 MB extraction limit.')
  }
  const allowSet = opts?.filterNames?.length ? new Set(opts.filterNames) : null
  const outs: OutputFile[] = []
  for (const [path, entry] of entries) {
    const name = safeName(path)
    if (!name) continue
    if (allowSet && !allowSet.has(name)) continue
    outs.push({ name, blob: new Blob([await entry.async('blob')]) })
  }
  if (!outs.length) throw new Error('This archive contains no matching files.')
  return outs
}

// ── Text / HTML / Markdown ───────────────────────────────────────
export async function htmlToText(file: File): Promise<OutputFile> {
  const doc = new DOMParser().parseFromString(await file.text(), 'text/html')
  doc.querySelectorAll('script,style,noscript').forEach((el) => el.remove())
  const text = (doc.body?.innerText ?? doc.body?.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim()
  return { name: `${stem(file.name)}.txt`, blob: new Blob([text], { type: 'text/plain' }) }
}

export async function convertText(file: File, to: 'txt' | 'html' | 'md'): Promise<OutputFile> {
  const raw = await file.text()
  const from = file.name.toLowerCase().endsWith('.html') || file.name.toLowerCase().endsWith('.htm') ? 'html'
    : file.name.toLowerCase().endsWith('.md') || file.name.toLowerCase().endsWith('.markdown') ? 'md' : 'txt'
  if (from === to) return { name: file.name, blob: new Blob([raw], { type: 'text/plain' }) }
  // Normalize to HTML or plain text first.
  let html: string; let text: string
  if (from === 'html') {
    html = raw
    const doc = new DOMParser().parseFromString(raw, 'text/html')
    doc.querySelectorAll('script,style').forEach((el) => el.remove())
    text = (doc.body?.innerText ?? doc.body?.textContent ?? '').trim()
  } else if (from === 'md') {
    const { marked } = await import('marked')
    html = await marked.parse(raw)
    text = raw
  } else { text = raw; html = `<pre>${raw.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>` }

  if (to === 'txt') return { name: `${stem(file.name)}.txt`, blob: new Blob([text], { type: 'text/plain' }) }
  if (to === 'html') {
    const full = from === 'html' ? raw : `<!doctype html>\n<html><head><meta charset="utf-8"><title>${stem(file.name)}</title></head><body>\n${html}\n</body></html>`
    return { name: `${stem(file.name)}.html`, blob: new Blob([full], { type: 'text/html' }) }
  }
  // to markdown
  if (from === 'md') return { name: `${stem(file.name)}.md`, blob: new Blob([raw], { type: 'text/markdown' }) }
  const { default: TurndownService } = await import('turndown')
  const md = new TurndownService({ headingStyle: 'atx' }).turndown(html)
  return { name: `${stem(file.name)}.md`, blob: new Blob([md], { type: 'text/markdown' }) }
}

// ── JSON / XML ───────────────────────────────────────────────────
export interface FormatJsonOpts {
  sortKeys?: boolean
  filterKeyQuery?: string
}

function transformJsonNode(val: unknown, sortKeys?: boolean, filterKey?: string): unknown {
  if (Array.isArray(val)) {
    return val.map((item) => transformJsonNode(item, sortKeys, filterKey))
  }
  if (val !== null && typeof val === 'object') {
    const entries = Object.entries(val as Record<string, unknown>)
    const filtered = filterKey
      ? entries.filter(([k, v]) => k.toLowerCase().includes(filterKey) || (v !== null && typeof v === 'object'))
      : entries
    if (sortKeys) {
      filtered.sort(([a], [b]) => a.localeCompare(b))
    }
    const out: Record<string, unknown> = {}
    for (const [k, v] of filtered) {
      const child = transformJsonNode(v, sortKeys, filterKey)
      if (filterKey && !k.toLowerCase().includes(filterKey) && child !== null && typeof child === 'object' && !Array.isArray(child) && Object.keys(child as object).length === 0) {
        continue
      }
      out[k] = child
    }
    return out
  }
  return val
}

export function formatJson(text: string, minify: boolean, indent: number | string = 2, opts?: FormatJsonOpts): string {
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch (e) { throw new Error(`Invalid JSON: ${e instanceof Error ? e.message : 'parse error'}`, { cause: e }) }
  const q = opts?.filterKeyQuery?.trim().toLowerCase()
  if (opts?.sortKeys || q) {
    parsed = transformJsonNode(parsed, opts?.sortKeys, q || undefined)
  }
  return minify ? JSON.stringify(parsed) : JSON.stringify(parsed, null, indent === 'tab' ? '\t' : Number(indent) || 2)
}

/** Convert JSON array of objects (or single object) to CSV string. */
export function jsonToCsv(text: string, delimiter = ','): string {
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch (e) { throw new Error(`Invalid JSON: ${e instanceof Error ? e.message : 'parse error'}`, { cause: e }) }
  const arr: Record<string, unknown>[] = Array.isArray(parsed)
    ? parsed.map((it) => (it !== null && typeof it === 'object' && !Array.isArray(it) ? (it as Record<string, unknown>) : { value: it }))
    : parsed !== null && typeof parsed === 'object'
      ? [parsed as Record<string, unknown>]
      : [{ value: parsed }]
  if (!arr.length) return ''
  const headers = [...new Set(arr.flatMap((row) => Object.keys(row)))]
  const esc = (v: unknown) => {
    const s = v === null || v === undefined ? '' : typeof v === 'object' ? JSON.stringify(v) : String(v)
    return s.includes(delimiter) || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s
  }
  const lines = [
    headers.map(esc).join(delimiter),
    ...arr.map((row) => headers.map((h) => esc(row[h])).join(delimiter)),
  ]
  return lines.join('\n')
}

const escXml = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const validTag = (k: string) => /^[A-Za-z_][\w.-]*$/.test(k) ? k : 'item'

function jsonNode(key: string, val: unknown, indent: string): string {
  const tag = validTag(key)
  if (val === null) return `${indent}<${tag} nil="true"/>`
  if (Array.isArray(val)) return val.map((v) => jsonNode(key, v, indent)).join('\n') || `${indent}<${tag}/>`
  if (typeof val === 'object') {
    const inner = Object.entries(val as Record<string, unknown>).map(([k, v]) => jsonNode(k, v, indent + '  ')).join('\n')
    return inner ? `${indent}<${tag}>\n${inner}\n${indent}</${tag}>` : `${indent}<${tag}/>`
  }
  return `${indent}<${tag}>${escXml(String(val))}</${tag}>`
}

export function jsonToXml(text: string): string {
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch (e) { throw new Error(`Invalid JSON: ${e instanceof Error ? e.message : 'parse error'}`, { cause: e }) }
  const body = parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
    ? Object.entries(parsed as Record<string, unknown>).map(([k, v]) => jsonNode(k, v, '  ')).join('\n')
    : jsonNode('item', parsed, '  ')
  return `<?xml version="1.0" encoding="UTF-8"?>\n<root>\n${body}\n</root>`
}

export function formatXml(text: string): string {
  const doc = new DOMParser().parseFromString(text, 'application/xml')
  const err = doc.querySelector('parsererror')
  if (err) throw new Error(`Invalid XML: ${err.textContent?.split('\n')[0] ?? 'parse error'}`)
  // Pretty-print by re-indenting element lines.
  const compact = text.replace(/>\s+</g, '><').trim()
  let indent = 0
  return compact.split(/(?=<)/).filter(Boolean).map((chunk) => {
    if (/^<\//.test(chunk)) indent = Math.max(0, indent - 1)
    const line = '  '.repeat(indent) + chunk
    if (/^<[^!?/][^>]*[^/]>$/.test(chunk) && !/^<[^>]*>.*<\//.test(chunk)) indent++
    return line
  }).join('\n')
}

// ── CSV ──────────────────────────────────────────────────────────
export function parseCsv(text: string, delim = ','): string[][] {
  const rows: string[][] = []
  let row: string[] = [], cell = '', quoted = false
  const src = text.replace(/\r\n/g, '\n')
  for (let i = 0; i < src.length; i++) {
    const ch = src[i]
    if (quoted) {
      if (ch === '"') { if (src[i + 1] === '"') { cell += '"'; i++ } else quoted = false }
      else cell += ch
    } else if (ch === '"') quoted = true
    else if (ch === delim) { row.push(cell); cell = '' }
    else if (ch === '\n') { row.push(cell); rows.push(row); row = []; cell = '' }
    else cell += ch
  }
  if (cell.length || row.length) { row.push(cell); rows.push(row) }
  return rows.filter((r) => r.some((c) => c.trim() !== ''))
}

const csvCell = (s: string, d: string) => (s.includes(d) || s.includes('"') || s.includes('\n') ? `"${s.replace(/"/g, '""')}"` : s)

export type CsvAction = 'dedupe' | 'trim' | 'sort-asc' | 'sort-desc' | 'filter' | 'find-replace'

export interface CsvWorkbenchOpts {
  outDelimiter?: string
  sortCol?: number
  filterQuery?: string
  findText?: string
  replaceText?: string
  keepCols?: number[]
  trimAll?: boolean
  dedupeAll?: boolean
  renameCols?: Record<number, string>
}

export function csvTools(
  text: string,
  action: CsvAction,
  delimiter: string,
  opts?: CsvWorkbenchOpts,
): string {
  let rows = parseCsv(text, delimiter)
  if (!rows.length) return ''

  // Optional pipeline step 1: trim whitespace across all cells
  if (action === 'trim' || opts?.trimAll) {
    rows = rows.map((r) => r.map((c) => c.trim()))
  }

  // Optional pipeline step 2: deduplicate rows
  if (action === 'dedupe' || opts?.dedupeAll) {
    const seen = new Set<string>()
    rows = rows.filter((r) => {
      const k = r.join('\u0000')
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
  }

  // Primary action (sort / filter / find-replace)
  if (action === 'sort-asc' || action === 'sort-desc') {
    const col = opts?.sortCol ?? 0
    const dir = action === 'sort-asc' ? 1 : -1
    const [header, ...body] = rows
    body.sort((a, b) => {
      const va = (a[col] ?? '').trim()
      const vb = (b[col] ?? '').trim()
      const na = Number(va), nb = Number(vb)
      if (va !== '' && vb !== '' && !Number.isNaN(na) && !Number.isNaN(nb)) {
        return (na - nb) * dir
      }
      return va.localeCompare(vb, undefined, { numeric: true, sensitivity: 'base' }) * dir
    })
    rows = header ? [header, ...body] : body
  } else if (action === 'filter') {
    const q = (opts?.filterQuery ?? '').trim().toLowerCase()
    if (q) {
      const [header, ...body] = rows
      const filtered = body.filter((r) => r.some((c) => c.toLowerCase().includes(q)))
      rows = header ? [header, ...filtered] : filtered
    }
  } else if (action === 'find-replace') {
    const find = opts?.findText ?? ''
    const rep = opts?.replaceText ?? ''
    if (find) {
      rows = rows.map((r, ri) => (ri === 0 ? r : r.map((c) => c.split(find).join(rep))))
    }
  }

  // Optional column renaming on header row
  if (opts?.renameCols && rows.length > 0) {
    rows[0] = rows[0].map((hdr, ci) => {
      const custom = opts.renameCols?.[ci]?.trim()
      return custom ? custom : hdr
    })
  }

  // Optional column filtering / selection
  if (opts?.keepCols && opts.keepCols.length > 0) {
    const cols = opts.keepCols
    rows = rows.map((r) => cols.map((ci) => r[ci] ?? ''))
  }

  const outDelim = opts?.outDelimiter || delimiter
  return rows.map((r) => r.map((c) => csvCell(c, outDelim)).join(outDelim)).join('\n')
}

// ── Deep File Metadata Inspector & Sanitizer ─────────────────────
export interface FileMeta {
  name: string
  size: number
  type: string
  modified: string
  sha1: string
  sha256: string
  sha512: string
  kind?: 'pdf' | 'office' | 'archive' | 'other'
  canScrub?: boolean
  documentProps?: Record<string, string>
}

const toHex = (buf: ArrayBuffer) =>
  [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')

export async function fileMetadata(file: File): Promise<FileMeta> {
  const rawBuf = await file.arrayBuffer()
  const [h1, h256, h512] = await Promise.all([
    crypto.subtle.digest('SHA-1', rawBuf),
    crypto.subtle.digest('SHA-256', rawBuf),
    crypto.subtle.digest('SHA-512', rawBuf),
  ])

  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  const documentProps: Record<string, string> = {}
  let kind: FileMeta['kind'] = 'other'
  let canScrub = false

  if (ext === 'pdf' || file.type === 'application/pdf') {
    kind = 'pdf'
    try {
      const { PDFDocument } = await import('pdf-lib')
      const doc = await PDFDocument.load(rawBuf, { ignoreEncryption: true, updateMetadata: false })
      canScrub = !doc.isEncrypted
      documentProps['Page Count'] = `${doc.getPageCount()} pages`
      documentProps['Encrypted'] = doc.isEncrypted ? 'Yes (Password Protected)' : 'No'
      const title = doc.getTitle()
      const author = doc.getAuthor()
      const subject = doc.getSubject()
      const keywords = doc.getKeywords()
      const creator = doc.getCreator()
      const producer = doc.getProducer()
      const created = doc.getCreationDate()
      const modified = doc.getModificationDate()
      if (title) documentProps['Title'] = title
      if (author) documentProps['Author'] = author
      if (subject) documentProps['Subject'] = subject
      if (keywords) documentProps['Keywords'] = keywords
      if (creator) documentProps['Creator Application'] = creator
      if (producer) documentProps['PDF Producer'] = producer
      if (created) documentProps['Created Date'] = created.toLocaleString()
      if (modified) documentProps['Modified Date'] = modified.toLocaleString()
    } catch {
      documentProps['PDF Status'] = 'Encrypted or non-standard structure'
    }
  } else if (ext === 'docx' || ext === 'pptx' || ext === 'xlsx') {
    kind = 'office'
    canScrub = true
    try {
      const zip = await JSZip.loadAsync(rawBuf)
      const coreXml = await zip.file('docProps/core.xml')?.async('string')
      const appXml = await zip.file('docProps/app.xml')?.async('string')
      const pickTag = (xml: string | undefined, tag: string) =>
        xml?.match(new RegExp(`<[^>]*:?${tag}[^>]*>([^<]+)</`, 'i'))?.[1]?.trim()

      const title = pickTag(coreXml, 'title')
      const creator = pickTag(coreXml, 'creator')
      const lastModBy = pickTag(coreXml, 'lastModifiedBy')
      const revision = pickTag(coreXml, 'revision')
      const created = pickTag(coreXml, 'created')
      const modified = pickTag(coreXml, 'modified')
      const app = pickTag(appXml, 'Application')
      const company = pickTag(appXml, 'Company')
      const pages = pickTag(appXml, 'Pages')
      const words = pickTag(appXml, 'Words')
      const slides = pickTag(appXml, 'Slides')

      if (title) documentProps['Title'] = title
      if (creator) documentProps['Author / Creator'] = creator
      if (lastModBy) documentProps['Last Modified By'] = lastModBy
      if (company) documentProps['Company / Organization'] = company
      if (app) documentProps['Application'] = app
      if (revision) documentProps['Revision Number'] = revision
      if (pages) documentProps['Pages'] = pages
      if (words) documentProps['Word Count'] = words
      if (slides) documentProps['Slides'] = slides
      if (created) documentProps['Created'] = created
      if (modified) documentProps['Modified'] = modified
    } catch {
      // ignore
    }
  } else if (ext === 'zip' || file.type.includes('zip')) {
    kind = 'archive'
    try {
      const summary = await listZipEntries(file)
      documentProps['Archive Entries'] = `${summary.entries.length} files`
      documentProps['Encrypted'] = summary.encrypted ? 'Yes (AES-256)' : 'No'
    } catch {
      // ignore
    }
  }

  return {
    name: file.name,
    size: file.size,
    type: file.type || 'unknown (no MIME reported by browser)',
    modified: new Date(file.lastModified).toLocaleString(),
    sha1: toHex(h1),
    sha256: toHex(h256),
    sha512: toHex(h512),
    kind,
    canScrub,
    documentProps: Object.keys(documentProps).length > 0 ? documentProps : undefined,
  }
}

/**
 * Scrub author, creator, company, revision, and tracking metadata from PDF or Office (DOCX/PPTX/XLSX) files.
 */
export async function scrubFileMetadata(file: File): Promise<OutputFile> {
  const ext = (file.name.split('.').pop() ?? '').toLowerCase()
  const rawBuf = await file.arrayBuffer()

  if (ext === 'pdf' || file.type === 'application/pdf') {
    const { PDFDocument } = await import('pdf-lib')
    const doc = await PDFDocument.load(rawBuf)
    doc.setTitle('')
    doc.setAuthor('')
    doc.setSubject('')
    doc.setKeywords([])
    doc.setCreator('')
    doc.setProducer('')
    const out = await doc.save({ useObjectStreams: true })
    return {
      name: `${stem(file.name)}-sanitized.pdf`,
      blob: new Blob([out.buffer as ArrayBuffer], { type: 'application/pdf' }),
    }
  }

  if (ext === 'docx' || ext === 'pptx' || ext === 'xlsx') {
    const zip = await JSZip.loadAsync(rawBuf)
    const cleanCore = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <dc:title></dc:title>
  <dc:subject></dc:subject>
  <dc:creator></dc:creator>
  <cp:keywords></cp:keywords>
  <dc:description></dc:description>
  <cp:lastModifiedBy></cp:lastModifiedBy>
  <cp:revision>1</cp:revision>
</cp:coreProperties>`
    if (zip.file('docProps/core.xml')) {
      zip.file('docProps/core.xml', cleanCore)
    }
    const appEntry = zip.file('docProps/app.xml')
    if (appEntry) {
      let appXml = await appEntry.async('string')
      appXml = appXml
        .replace(/<Company>[\s\S]*?<\/Company>/gi, '<Company></Company>')
        .replace(/<Manager>[\s\S]*?<\/Manager>/gi, '<Manager></Manager>')
        .replace(/<Application>[\s\S]*?<\/Application>/gi, '<Application>DocDoctor</Application>')
      zip.file('docProps/app.xml', appXml)
    }
    const mime = ext === 'docx'
      ? 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
      : ext === 'pptx'
        ? 'application/vnd.openxmlformats-officedocument.presentationml.presentation'
        : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
    return { name: `${stem(file.name)}-sanitized.${ext}`, blob: new Blob([blob], { type: mime }) }
  }

  throw new Error('Metadata scrubbing is supported for PDF, DOCX, PPTX, and XLSX documents.')
}
