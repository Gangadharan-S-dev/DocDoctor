import JSZip from 'jszip'
import type { OutputFile } from './download'
import { stem } from './download'

// ── ZIP ──────────────────────────────────────────────────────────
export async function createZip(files: File[]): Promise<OutputFile> {
  const zip = new JSZip()
  const seen = new Map<string, number>()
  for (const f of files) {
    let name = f.name
    const n = (seen.get(name) ?? 0) + 1
    seen.set(f.name, n)
    if (n > 1) name = `${stem(f.name)} (${n}).${f.name.split('.').pop()}`
    zip.file(name, f)
  }
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  return { name: 'files.zip', blob }
}

const safeName = (p: string) => p.replace(/\\/g, '/').split('/').filter((s) => s && s !== '..' && s !== '.').join('/') || 'file'

const MAX_TOTAL_UNCOMPRESSED = 500 * 1048576
const MAX_ENTRY_UNCOMPRESSED = 200 * 1048576

export async function extractZip(file: File): Promise<OutputFile[]> {
  const zip = await JSZip.loadAsync(await file.arrayBuffer())
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
  const outs: OutputFile[] = []
  for (const [path, entry] of entries) {
    const name = safeName(path)
    if (!name) continue
    outs.push({ name, blob: new Blob([await entry.async('blob')]) })
  }
  if (!outs.length) throw new Error('This archive contains no files.')
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
  let html = '', text = ''
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
export function formatJson(text: string, minify: boolean): string {
  let parsed: unknown
  try { parsed = JSON.parse(text) } catch (e) { throw new Error(`Invalid JSON: ${e instanceof Error ? e.message : 'parse error'}`) }
  return minify ? JSON.stringify(parsed) : JSON.stringify(parsed, null, 2)
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
  try { parsed = JSON.parse(text) } catch (e) { throw new Error(`Invalid JSON: ${e instanceof Error ? e.message : 'parse error'}`) }
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

export function csvTools(text: string, action: 'dedupe' | 'trim', delimiter: string): string {
  let rows = parseCsv(text)
  if (action === 'trim') rows = rows.map((r) => r.map((c) => c.trim()))
  if (action === 'dedupe') {
    const seen = new Set<string>()
    rows = rows.filter((r) => { const k = r.join('\u0000'); if (seen.has(k)) return false; seen.add(k); return true })
  }
  return rows.map((r) => r.map((c) => csvCell(c, delimiter)).join(delimiter)).join('\n')
}

// ── Generic file metadata ────────────────────────────────────────
export interface FileMeta { name: string; size: number; type: string; modified: string; sha256: string }

export async function fileMetadata(file: File): Promise<FileMeta> {
  const buf = await crypto.subtle.digest('SHA-256', await file.arrayBuffer())
  const sha256 = [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('')
  return {
    name: file.name,
    size: file.size,
    type: file.type || 'unknown (no MIME reported by browser)',
    modified: new Date(file.lastModified).toLocaleString(),
    sha256,
  }
}
