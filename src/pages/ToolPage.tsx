import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import { ShieldCheck, FileCheck2, Clock3, Info, Loader2, Download, FolderDown, RotateCcw, AlertTriangle, Star, XCircle } from 'lucide-react'
import { TOOLS, categoryById, formatSize, isImplemented, isServerTool, serverEndpointFor, toolById, type Tool } from '../data/tools'
import UploadArea, { type PickedFile } from '../components/UploadArea'
import ToolCard from '../components/ToolCard'
import type { OutputFile } from '../processing/download'
import { downloadBlob, downloadZip } from '../processing/download'
import type { ImageMeta, ImgFormat } from '../processing/image'
import type { PageOp } from '../processing/pdf'
import type { FileMeta } from '../processing/text'
import { runTool } from './tool/runEngine'
import { OCR_LANGUAGES } from '../processing/ocr-languages'
import { isFavorite, pushRecent, toggleFavorite } from '../lib/prefs'
import { useI18n } from '../lib/i18n'

// Heavy engines and pickers load on demand, keeping the initial bundle small.
const PdfPageGrid = lazy(() => import('../components/PdfPageGrid'))
const SlidePicker = lazy(async () => ({ default: (await import('../components/OfficePickers')).SlidePicker }))
const SlideReorder = lazy(async () => ({ default: (await import('../components/OfficePickers')).SlideReorder }))
const SheetPicker = lazy(async () => ({ default: (await import('../components/OfficePickers')).SheetPicker }))
const DocxBlockPicker = lazy(async () => ({ default: (await import('../components/OfficePickers')).DocxBlockPicker }))
const SignaturePad = lazy(async () => ({ default: (await import('../components/PdfStudio')).SignaturePad }))
const PagePlacement = lazy(async () => ({ default: (await import('../components/PdfStudio')).PagePlacement }))
const PickerFallback = () => <p className="flex items-center gap-2 py-6 text-sm font-semibold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>

const GRID_TOOLS: Record<string, 'select' | 'organize'> = {
  'remove-pdf-pages': 'select', 'extract-pdf-pages': 'select', 'organize-pdf': 'organize',
}

export default function ToolPage() {
  const { id } = useParams()
  const tool = toolById(id ?? '')
  if (!tool) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-extrabold text-ink-950">Tool not found</h1>
        <p className="mt-2 text-slate-600">That tool doesn&apos;t exist in the registry.</p>
        <Link to="/tools" className="btn-accent mt-6">Browse all tools</Link>
      </div>
    )
  }
  return <ToolWorkspace key={tool.id} tool={tool} />
}

function ToolWorkspace({ tool }: { tool: Tool }) {
  const cat = categoryById(tool.category)
  const Icon = tool.icon
  const live = isImplemented(tool)
  const related = useMemo(() => TOOLS.filter((t) => t.category === tool.category && t.id !== tool.id).slice(0, 4), [tool])
  const [files, setFiles] = useState<PickedFile[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [results, setResults] = useState<OutputFile[]>([])
  const [gridValue, setGridValue] = useState<number[] | PageOp[]>([])
  const [meta, setMeta] = useState<ImageMeta | null>(null)
  const [dims, setDims] = useState<{ w: number; h: number } | null>(null)

  // Settings
  const [quality, setQuality] = useState(80)
  const [format, setFormat] = useState<'keep' | ImgFormat>('keep')
  const [width, setWidth] = useState(0)
  const [height, setHeight] = useState(0)
  const [lock, setLock] = useState(true)
  const [crop, setCrop] = useState({ x: 0, y: 0, w: 100, h: 100 })
  const [angle, setAngle] = useState(90)
  const [flipH, setFlipH] = useState(true)
  const [flipV, setFlipV] = useState(false)
  const [wmText, setWmText] = useState('DocDoctor')
  const [wmOpacity, setWmOpacity] = useState(0.35)
  const [pageSize, setPageSize] = useState<'fit' | 'a4'>('fit')
  const [ranges, setRanges] = useState('1')
  const [level, setLevel] = useState<'less' | 'recommended' | 'extreme'>('recommended')
  const [pos, setPos] = useState<'bottom-center' | 'bottom-right' | 'bottom-left'>('bottom-center')
  const [scale, setScale] = useState(2)
  const [slideSel, setSlideSel] = useState<string[]>([])
  const [slideOrder, setSlideOrder] = useState<string[]>([])
  const [sheetSel, setSheetSel] = useState<string[]>([])
  const [splitMode, setSplitMode] = useState<'heading' | 'paragraphs'>('heading')
  const [txtTo, setTxtTo] = useState<'txt' | 'html' | 'md'>('html')
  const [jsonMinify, setJsonMinify] = useState(false)
  const [csvAction, setCsvAction] = useState<'dedupe' | 'trim'>('dedupe')
  const [editText, setEditText] = useState('')
  const [fileMeta, setFileMeta] = useState<FileMeta | null>(null)
  const [pdfText, setPdfText] = useState('')
  const [pdfPage, setPdfPage] = useState(1)
  const [pdfX, setPdfX] = useState(12)
  const [pdfY, setPdfY] = useState(12)
  const [pdfSize, setPdfSize] = useState(16)
  const [pdfColor, setPdfColor] = useState('#122036')
  const [sigData, setSigData] = useState<string | null>(null)
  const [signPos, setSignPos] = useState<'bottom-right' | 'bottom-left' | 'center' | 'custom'>('bottom-right')
  const [serverOk, setServerOk] = useState<boolean | null>(null)
  const [compressorOk, setCompressorOk] = useState<boolean | null>(null)
  const [compressorName, setCompressorName] = useState<string | null>(null)
  const [imgFormat, setImgFormat] = useState<'jpg' | 'png'>('jpg')
  const [pwd, setPwd] = useState('')
  const [pwd2, setPwd2] = useState('')
  const [blockSel, setBlockSel] = useState<number[]>([])
  const [ocrLang, setOcrLang] = useState('eng')
  const [ocrFormat, setOcrFormat] = useState<'txt' | 'pdf' | 'docx' | 'both'>('txt')
  const [previewText, setPreviewText] = useState('')
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null)
  const [fav, setFav] = useState(() => isFavorite(tool.id))
  const abortRef = useRef<AbortController | null>(null)
  const { t } = useI18n()

  useEffect(() => { pushRecent(tool.id) }, [tool.id])

  const first = files[0]?.file
  const totalIn = files.reduce((s, f) => s + f.file.size, 0)
  const totalOut = results.reduce((s, r) => s + r.blob.size, 0)

  // Changing the file set invalidates results and per-file derived state.
  const handleFilesChange = (next: PickedFile[]) => {
    setFiles(next)
    setResults([]); setError(''); setMeta(null); setDims(null); setFileMeta(null); setPreviewText('')
  }

  // Load image dimensions / metadata when the first file changes.
  useEffect(() => {
    if (!first) return
    let alive = true
    if (tool.id === 'file-metadata') { import('../processing/text').then((m) => m.fileMetadata(first)).then((v) => { if (alive) setFileMeta(v) }).catch(() => { if (alive) setError('Could not read this file.') }); return () => { alive = false } }
    if (tool.id === 'edit-word') { import('../processing/office').then((m) => m.wordExtractText(first)).then((v) => { if (alive) setEditText(v) }).catch(() => { if (alive) setError('Could not extract text — please use a .docx file.') }); return () => { alive = false } }
    if (!first.type.startsWith('image/')) return
    import('../processing/image').then((m) => m.imageMetadata(first)).then((m) => {
      if (!alive) return
      setMeta(m); setDims({ w: m.width, h: m.height }); setWidth(m.width); setHeight(m.height)
    }).catch(() => {})
    return () => { alive = false }
  }, [first]) // eslint-disable-line react-hooks/exhaustive-deps

  // Probe the optional conversion service for server-backed/upgradable tools.
  useEffect(() => {
    if (!serverEndpointFor(tool) && tool.id !== 'compress-pdf') return
    let alive = true
    const base = (import.meta.env.VITE_API_URL as string | undefined) ?? ''
    fetch(`${base}/api/health`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error('bad health'))))
      .then((h: { libreOffice?: boolean; pdfCompressor?: boolean; compressor?: string | null }) => {
        if (!alive) return
        setServerOk(!!h.libreOffice)
        setCompressorOk(!!h.pdfCompressor)
        setCompressorName(h.compressor ?? null)
      })
      .catch(() => { if (alive) { setServerOk(false); setCompressorOk(false) } })
    return () => { alive = false }
  }, [tool])

  async function runServer() {
    if (!first || busy) return
    setBusy(true); setError(''); setResults([])
    try {
      const base = (import.meta.env.VITE_API_URL as string | undefined) ?? ''
      const form = new FormData()
      form.append('file', first)
      if (tool.id === 'slides-to-images') form.append('format', imgFormat)
      if (tool.id === 'compress-pdf') form.append('level', level)
      const endpoint = tool.id === 'compress-pdf' ? 'compress-pdf' : serverEndpointFor(tool)
      if (!endpoint) throw new Error('This tool has no server conversion.')
      const res = await fetch(`${base}/api/convert/${endpoint}`, { method: 'POST', body: form })
      if (!res.ok) {
        const body = await res.json().catch(() => ({})) as { error?: string }
        throw new Error(body.error ?? `Conversion server returned ${res.status}.`)
      }
      const blob = await res.blob()
      if (!blob.size) throw new Error('The server returned an empty file.')
      const name = tool.id === 'slides-to-images'
        ? `${first.name.replace(/\.[^.]+$/, '')}-slides.zip`
        : tool.id === 'compress-pdf'
          ? `${first.name.replace(/\.[^.]+$/, '')}-compressed.pdf`
          : `${first.name.replace(/\.[^.]+$/, '')}.pdf`
      setResults([{ name, blob }])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Server conversion failed.')
    } finally { setBusy(false) }
  }

  // Text preview for textual outputs (JSON/XML/HTML/TXT/CSV results).
  // previewText is cleared by run()/handleFilesChange, so stale text never shows.
  useEffect(() => {
    const r = results[0]
    if (!r || !/\.(txt|html|json|xml|csv|md)$/i.test(r.name)) return
    let alive = true
    r.blob.text().then((text) => { if (alive) setPreviewText(text.slice(0, 4000)) }).catch(() => { if (alive) setPreviewText('') })
    return () => { alive = false }
  }, [results])

  const onWidth = (v: number) => { setWidth(v); if (lock && dims) setHeight(Math.max(1, Math.round((v * dims.h) / dims.w))) }
  const onHeight = (v: number) => { setHeight(v); if (lock && dims) setWidth(Math.max(1, Math.round((v * dims.w) / dims.h))) }

  async function run() {
    if (!files.length || busy) return
    const controller = new AbortController()
    abortRef.current = controller
    setBusy(true); setError(''); setResults([]); setProgress(null); setPreviewText('')
    try {
      const out = await runTool({
        tool,
        files: files.map((f) => f.file),
        signal: controller.signal,
        onProgress: (done, total) => setProgress({ done, total }),
        settings: {
          quality, format, width, height, crop, angle, flipH, flipV, wmText, wmOpacity,
          wmFontSize: Math.max(24, Math.round((dims?.w ?? 800) / 18)),
          pageSize, ranges, level, pos, scale, slideSel, slideOrder, sheetSel, splitMode,
          txtTo, jsonMinify, csvAction, editText, pdfText, pdfPage, pdfX, pdfY, pdfSize,
          pdfColor, sigData, signPos, pwd, pwd2, blockSel, gridValue, ocrLang, ocrFormat,
        },
      })
      if (!out.length || out.some((o) => o.blob.size === 0)) throw new Error('Processing produced an empty file. Please try different settings.')
      setResults(out)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') setError('Processing cancelled.')
      else setError(e instanceof Error ? e.message : 'Processing failed. The file may be damaged, encrypted, or in an unsupported variant.')
    } finally { setBusy(false); setProgress(null); abortRef.current = null }
  }

  const savings = results.length && totalIn ? Math.round((1 - totalOut / totalIn) * 100) : null
  const outUrls = useMemo(() => results.map((r) => (r.blob.type.startsWith('image/') ? URL.createObjectURL(r.blob) : null)), [results])
  useEffect(() => () => { outUrls.forEach((u) => { if (u) URL.revokeObjectURL(u) }) }, [outUrls])
  const inUrl = useMemo(() => (first && first.type.startsWith('image/') ? URL.createObjectURL(first) : null), [first])
  useEffect(() => () => { if (inUrl) URL.revokeObjectURL(inUrl) }, [inUrl])

  const slider = (label: string, v: number, set: (n: number) => void, min: number, max: number, suffix = '') => (
    <label className="block">
      <span className="mb-1.5 flex justify-between text-sm font-bold text-ink-950">{label}<span className="text-accent">{v}{suffix}</span></span>
      <input type="range" min={min} max={max} value={v} onChange={(e) => set(+e.target.value)} className="w-full accent-[#1D6FF2]" />
    </label>
  )
  const sel = (label: string, v: string, set: (s: never) => void, opts: [string, string][]) => (
    <label className="block">
      <span className="mb-1.5 block text-sm font-bold text-ink-950">{label}</span>
      <select value={v} onChange={(e) => set(e.target.value as never)} className="input">
        {opts.map(([val, lab]) => <option key={val} value={val}>{lab}</option>)}
      </select>
    </label>
  )

  return (
    <div className="mx-auto max-w-5xl px-4 py-10 sm:px-6">
      <nav aria-label="Breadcrumb" className="text-sm font-semibold text-slate-500">
        <Link to="/" className="hover:text-accent">Home</Link> <span aria-hidden>/</span>{' '}
        <Link to={`/category/${cat.id}`} className="hover:text-accent">{cat.name}</Link> <span aria-hidden>/</span> {tool.name}
      </nav>

      <div className="mt-5 flex items-start gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl" style={{ background: cat.soft, color: cat.color }}><Icon className="h-7 w-7" /></span>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <h1 className="font-display text-3xl font-extrabold text-ink-950 sm:text-4xl">{tool.name}</h1>
            <button type="button" aria-label={fav ? 'Remove from favorites' : 'Add to favorites'} aria-pressed={fav}
              onClick={() => { toggleFavorite(tool.id); setFav(!fav) }}
              className={`rounded-lg p-2 transition hover:bg-amber-50 ${fav ? 'text-amber-500' : 'text-slate-300 hover:text-amber-500'}`}>
              <Star className={`h-6 w-6 ${fav ? 'fill-amber-400 text-amber-500' : ''}`} />
            </button>
          </div>
          <p className="mt-1.5 max-w-2xl text-slate-600">{tool.description}</p>
          <p className="mt-3 flex flex-wrap gap-2">
            <span className="chip">Accepts: {tool.acceptLabel}</span>
            <span className="chip">Max {tool.maxSizeMB} MB{tool.multiple ? ' · Batch supported' : ''}</span>
            <span className="chip">{live ? 'Runs 100% in your browser' : `Engine: ${tool.engine}`}</span>
          </p>
        </div>
      </div>

      <section className="card mt-8 p-5 sm:p-7" aria-label={`${tool.name} workspace`}>
        <UploadArea tool={tool} files={files} onChange={handleFilesChange} />

        {tool.id === 'image-metadata' && meta && (
          <dl className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {[['File', meta.name], ['Dimensions', `${meta.width} × ${meta.height} px`], ['Format', meta.type], ['Size', formatSize(meta.size)]].map(([k, v]) => (
              <div key={k} className="rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200/70"><dt className="text-[11px] font-extrabold uppercase tracking-wide text-slate-400">{k}</dt><dd className="mt-0.5 truncate text-sm font-bold text-ink-950" title={v}>{v}</dd></div>
            ))}
            <p className="text-xs text-slate-500 sm:col-span-2 lg:col-span-4">Basic properties are read locally in your browser. Deep EXIF parsing arrives with the server engine.</p>
          </dl>
        )}

        {first && GRID_TOOLS[tool.id] && (
          <div className="mt-6 border-t border-slate-100 pt-5">
            <Suspense fallback={<PickerFallback />}><PdfPageGrid file={first} mode={GRID_TOOLS[tool.id]} onChange={setGridValue} /></Suspense>
          </div>
        )}

        {first && (tool.id === 'remove-slides' || tool.id === 'extract-slides') && (
          <div className="mt-6 border-t border-slate-100 pt-5"><Suspense fallback={<PickerFallback />}><SlidePicker file={first} onChange={setSlideSel} /></Suspense></div>
        )}
        {first && tool.id === 'reorder-slides' && (
          <div className="mt-6 border-t border-slate-100 pt-5"><Suspense fallback={<PickerFallback />}><SlideReorder file={first} onChange={setSlideOrder} /></Suspense></div>
        )}
        {first && tool.id === 'remove-worksheets' && (
          <div className="mt-6 border-t border-slate-100 pt-5"><Suspense fallback={<PickerFallback />}><SheetPicker file={first} onChange={setSheetSel} /></Suspense></div>
        )}

        {first && tool.id === 'edit-pdf' && (
          <div className="mt-6 border-t border-slate-100 pt-5">
            <p className="mb-3 text-sm font-bold text-ink-950">Click the page to place your text</p>
            <Suspense fallback={<PickerFallback />}>
              <PagePlacement file={first} page={pdfPage} x={pdfX} y={pdfY} onPick={(x, y) => { setPdfX(x); setPdfY(y) }} stampText={pdfText || 'Text here'} textColor={pdfColor} textSize={pdfSize} />
            </Suspense>
          </div>
        )}
        {first && tool.id === 'sign-pdf' && (
          <div className="mt-6 border-t border-slate-100 pt-5 space-y-6">
            <div>
              <p className="mb-3 text-sm font-bold text-ink-950">Draw your signature</p>
              <Suspense fallback={<PickerFallback />}><SignaturePad onChange={setSigData} /></Suspense>
            </div>
            {sigData && (
              <div className="border-t border-slate-100 pt-5">
                <p className="mb-3 text-sm font-bold text-ink-950">Click on the page to place your signature</p>
                <Suspense fallback={<PickerFallback />}>
                  <PagePlacement file={first} page={pdfPage} x={pdfX} y={pdfY} onPick={(x, y) => { setPdfX(x); setPdfY(y); setSignPos('custom') }} stampPreview={sigData} />
                </Suspense>
              </div>
            )}
          </div>
        )}

        {first && (tool.id === 'remove-word-pages' || tool.id === 'docx-page-remover') && (
          <div className="mt-6 border-t border-slate-100 pt-5">
            <p className="mb-1.5 text-sm font-bold text-ink-950">Select pages or sections to remove</p>
            <p className="mb-4 text-xs font-semibold text-slate-500">Pick pages visually or enter page ranges to remove from your Word document. Content is safely removed without affecting remaining styles.</p>
            <Suspense fallback={<PickerFallback />}><DocxBlockPicker file={first} onChange={setBlockSel} /></Suspense>
          </div>
        )}

        {tool.id === 'file-metadata' && fileMeta && (
          <dl className="mt-6 grid gap-3 sm:grid-cols-2">
            {[['File name', fileMeta.name], ['Size', formatSize(fileMeta.size)], ['Type', fileMeta.type], ['Last modified', fileMeta.modified], ['SHA-256', fileMeta.sha256]].map(([k, v]) => (
              <div key={k} className={`rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200/70 ${k === 'SHA-256' ? 'sm:col-span-2' : ''}`}><dt className="text-[11px] font-extrabold uppercase tracking-wide text-slate-400">{k}</dt><dd className="mt-0.5 break-all text-sm font-bold text-ink-950">{v}</dd></div>
            ))}
            <p className="text-xs text-slate-500 sm:col-span-2">Computed locally in your browser — the file is never uploaded. Hash lets you verify file integrity anywhere.</p>
          </dl>
        )}

        {tool.id === 'edit-word' && first && (
          <div className="mt-6 border-t border-slate-100 pt-5">
            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-ink-950">Document text — edit freely, one paragraph per line. Start a line with # for a heading.</span>
              <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={14} className="input font-mono !text-[13px] leading-relaxed" placeholder="Extracting text…" />
            </label>
            <p className="mt-2 text-xs font-semibold text-amber-700">Heads-up: the rebuilt DOCX uses clean, simple formatting — original fonts, images and tables are not carried into the edited file.</p>
          </div>
        )}

        {files.length > 0 && live && tool.id !== 'image-metadata' && tool.id !== 'file-metadata' && (
          <div className="mt-6 space-y-4 border-t border-slate-100 pt-5">
            {/* Tool-specific settings */}
            {tool.id === 'compress-image' && <div className="grid gap-4 sm:grid-cols-2">{slider('Quality', quality, setQuality, 10, 100, '%')}{sel('Output format', format, setFormat, [['keep', 'Keep original format'], ['image/jpeg', 'JPG (smallest)'], ['image/png', 'PNG (lossless)'], ['image/webp', 'WebP (modern)']])}<p className="text-xs text-slate-500 sm:col-span-2">Lower quality = smaller file. PNG output ignores quality (lossless).</p></div>}
            {tool.id === 'resize-image' && (
              <div className="grid gap-4 sm:grid-cols-3">
                <label className="block"><span className="mb-1.5 block text-sm font-bold">Width (px)</span><input type="number" min={1} value={width || ''} onChange={(e) => onWidth(+e.target.value)} className="input" /></label>
                <label className="block"><span className="mb-1.5 block text-sm font-bold">Height (px)</span><input type="number" min={1} value={height || ''} onChange={(e) => onHeight(+e.target.value)} className="input" /></label>
                <label className="flex items-end gap-2 pb-3 text-sm font-bold"><input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} className="h-4 w-4 accent-[#1D6FF2]" /> Keep aspect ratio</label>
                {dims && <p className="text-xs text-slate-500 sm:col-span-3">Original: {dims.w} × {dims.h} px</p>}
              </div>
            )}
            {tool.id === 'crop-image' && <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{slider('Start X %', crop.x, (v) => setCrop({ ...crop, x: v }), 0, 90)}{slider('Start Y %', crop.y, (v) => setCrop({ ...crop, y: v }), 0, 90)}{slider('Width %', crop.w, (v) => setCrop({ ...crop, w: v }), 10, 100)}{slider('Height %', crop.h, (v) => setCrop({ ...crop, h: v }), 10, 100)}</div>}
            {tool.id === 'webp-converter' && sel('Convert to', format === 'keep' ? 'image/webp' : format, setFormat, [['image/webp', 'WebP'], ['image/jpeg', 'JPG'], ['image/png', 'PNG']])}
            {(tool.id === 'rotate-image' || tool.id === 'rotate-pdf') && sel('Rotation', String(angle), (v: string) => setAngle(+v), [['90', '90° clockwise'], ['180', '180°'], ['270', '270° clockwise']])}
            {tool.id === 'flip-image' && <div className="flex gap-6"><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={flipH} onChange={(e) => setFlipH(e.target.checked)} className="h-4 w-4 accent-[#1D6FF2]" /> Flip horizontally</label><label className="flex items-center gap-2 text-sm font-bold"><input type="checkbox" checked={flipV} onChange={(e) => setFlipV(e.target.checked)} className="h-4 w-4 accent-[#1D6FF2]" /> Flip vertically</label></div>}
            {(tool.id === 'image-watermark' || tool.id === 'pdf-watermark') && <div className="grid gap-4 sm:grid-cols-2"><label className="block"><span className="mb-1.5 block text-sm font-bold">Watermark text</span><input value={wmText} onChange={(e) => setWmText(e.target.value)} className="input" maxLength={60} /></label>{slider('Opacity', Math.round(wmOpacity * 100), (v) => setWmOpacity(v / 100), 5, 90, '%')}</div>}
            {tool.id === 'image-to-pdf' && sel('Page size', pageSize, setPageSize, [['fit', 'Fit page to image'], ['a4', 'A4 with margins']])}
            {tool.id === 'split-pdf' && <label className="block"><span className="mb-1.5 block text-sm font-bold">Pages to extract</span><input value={ranges} onChange={(e) => setRanges(e.target.value)} className="input" placeholder="e.g. 1-3, 5 — separate outputs with ; e.g. 1-2; 3-4" /><span className="mt-1 block text-xs font-medium text-slate-500">Use ranges like 1-3, 5. Separate groups with a semicolon to create multiple files.</span></label>}
            {tool.id === 'compress-pdf' && <div>{sel('Compression level', level, setLevel, [['extreme', 'Extreme — smallest, rasterizes pages'], ['recommended', 'Recommended — balanced'], ['less', 'Less — lightest touch']])}<p className="mt-2 text-xs text-slate-500">Recommended rebuilds the PDF losslessly and strips metadata. Extreme rasterizes each page to a downsampled image — the biggest shrink for scans, but page text is no longer selectable. Real before/after sizes are always shown below.</p></div>}
            {(tool.id === 'ocr-pdf' || tool.id === 'image-ocr') && (
              <div className="grid gap-4 sm:grid-cols-2">
                {sel('OCR language', ocrLang, setOcrLang, OCR_LANGUAGES.map((l) => [l.code, l.label] as [string, string]))}
                {sel('Output', ocrFormat, setOcrFormat as never, [['txt', 'Plain text (.txt)'], ['pdf', 'Searchable PDF'], ['docx', 'Editable Word document (.docx)'], ['both', 'Both text + searchable PDF']])}
                <p className="text-xs font-semibold text-slate-500 sm:col-span-2">OCR runs entirely on your device. The first run downloads the selected language model (a few MB) once and caches it; your file itself is never uploaded. Searchable PDFs carry an invisible text layer over the page image — best for Latin scripts; other scripts are fully included in the text output. Best results on clean, high-contrast scans.</p>
              </div>
            )}
            {tool.id === 'pdf-page-numbers' && sel('Position', pos, setPos, [['bottom-center', 'Bottom center'], ['bottom-right', 'Bottom right'], ['bottom-left', 'Bottom left']])}
            {(tool.id === 'pdf-to-jpg' || tool.id === 'pdf-to-png' || tool.id === 'pdf-to-image') && sel('Render quality', String(scale), (v: string) => setScale(+v), [['1', 'Standard (72 dpi)'], ['2', 'High (144 dpi)'], ['3', 'Print (216 dpi)']])}
            {tool.id === 'split-word' && <div>{sel('Split by', splitMode, setSplitMode, [['heading', 'Heading 1 sections'], ['paragraphs', 'Every 15 paragraphs']])}<p className="mt-2 text-xs text-slate-500">Word pagination depends on fonts and rendering, so splitting uses document structure — headings or paragraph blocks — never guessed page breaks.</p></div>}
            {(tool.id === 'txt-converter' || tool.id === 'markdown-converter') && sel('Convert to', txtTo, setTxtTo, [['html', 'HTML'], ['txt', 'Plain text (TXT)'], ['md', 'Markdown']])}
            {tool.id === 'json-formatter' && sel('Mode', jsonMinify ? 'min' : 'pretty', (v: string) => setJsonMinify(v === 'min'), [['pretty', 'Pretty-print (2 spaces)'], ['min', 'Minify']])}
            {tool.id === 'csv-tools' && sel('Action', csvAction, setCsvAction, [['dedupe', 'Remove duplicate rows'], ['trim', 'Trim whitespace in every cell']])}
            {tool.id === 'merge-word' && <p className="text-xs font-semibold text-slate-500">Documents are appended in upload order with a page break between them. Styles and numbering come from the first document; complex elements from later files may simplify.</p>}
            {tool.id === 'merge-presentations' && <p className="text-xs font-semibold text-slate-500">Slides are appended in upload order using the first deck&apos;s theme. Charts and embedded objects from later decks may not survive — check the result before relying on it.</p>}
            {(tool.id === 'xlsx-to-pdf' || tool.id === 'excel-to-pdf') && <p className="text-xs font-semibold text-slate-500">Produces a clean, values-only PDF table (up to 200 rows per sheet). Print areas, colors and charts are not carried over.</p>}
            {(tool.id === 'compress-docx' || tool.id === 'compress-powerpoint' || tool.id === 'compress-excel') && <p className="text-xs text-slate-500">Repacks the file at maximum compression without changing content. Already-compressed media inside may not shrink further — real sizes are shown after processing.</p>}
            {tool.id === 'edit-pdf' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block"><span className="mb-1.5 block text-sm font-bold">Text to add</span><input value={pdfText} onChange={(e) => setPdfText(e.target.value)} className="input" placeholder="e.g. Approved 2026" maxLength={120} /></label>
                <label className="block"><span className="mb-1.5 block text-sm font-bold">Page (1-based)</span><input type="number" min={1} value={pdfPage} onChange={(e) => setPdfPage(Math.max(1, +e.target.value || 1))} className="input" /></label>
                {slider('Font size', pdfSize, setPdfSize, 8, 48, ' pt')}
                <label className="block"><span className="mb-1.5 block text-sm font-bold">Color</span><input type="color" value={pdfColor} onChange={(e) => setPdfColor(e.target.value)} className="h-[46px] w-full cursor-pointer rounded-xl border border-slate-200 bg-white px-2" /></label>
                <p className="text-xs text-slate-500 sm:col-span-2">Position: {pdfX}% across, {pdfY}% down — adjust by clicking the page preview above.</p>
              </div>
            )}
            {tool.id === 'sign-pdf' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block"><span className="mb-1.5 block text-sm font-bold">Page (1-based)</span><input type="number" min={1} value={pdfPage} onChange={(e) => setPdfPage(Math.max(1, +e.target.value || 1))} className="input" /></label>
                {sel('Signature position', signPos, setSignPos as never, [
                  ['custom', 'Custom placement (click on page above)'],
                  ['bottom-right', 'Bottom right'],
                  ['bottom-left', 'Bottom left'],
                  ['center', 'Center'],
                ])}
                <p className="text-xs text-slate-500 sm:col-span-2">
                  {signPos === 'custom' ? `Signature placed at ${pdfX}% across, ${pdfY}% down on page ${pdfPage}. Click the preview above to reposition.` : `Using ${signPos.replace('-', ' ')} preset position.`}
                </p>
              </div>
            )}
            {(tool.id === 'pdf-to-powerpoint' || tool.id === 'pdf-to-pptx') && <div>{sel('Slide image quality', String(scale), (v: string) => setScale(+v), [['1', 'Standard (72 dpi)'], ['2', 'High (144 dpi)'], ['3', 'Print (216 dpi)']])}<p className="mt-2 text-xs text-slate-500">Each PDF page becomes a full-slide image — text inside slides is not editable. For editable text, use PDF to Word instead.</p></div>}
            {tool.id === 'compare-pdf' && <p className="text-xs font-semibold text-slate-500">Upload two PDF documents to compare them side-by-side. DocDoctor generates a split-view comparison document showing page-by-page differences along with a text match summary.</p>}
            {tool.id === 'repair-pdf' && <p className="text-xs font-semibold text-slate-500">Attempts recovery by rebuilding the document structure. Files that cannot be opened at all (truncated, heavily corrupted) cannot be repaired — you&apos;ll get a clear error instead of a fake success.</p>}
            {(tool.id === 'pdf-to-word' || tool.id === 'pdf-to-docx') && <p className="text-xs font-semibold text-slate-500">Text-based conversion: selectable text is rebuilt as an editable document. Original layout, columns and images are simplified; scanned PDFs need OCR (not run here).</p>}
            {tool.id === 'pdf-to-excel' && <p className="text-xs font-semibold text-slate-500">Extracts selectable text into spreadsheet rows, one sheet per page. Borderless tables and scanned PDFs may not align perfectly — check the result.</p>}
            {(tool.id === 'word-to-pdf' || tool.id === 'docx-to-pdf') && <p className="text-xs font-semibold text-amber-700">Text-flow PDF: content is re-typeset cleanly — original fonts, page breaks and images from the DOCX are not preserved. Use it for readable/printable output, not archival fidelity.</p>}
            {tool.id === 'epub-to-pdf' && <p className="text-xs font-semibold text-slate-500">Chapter text is extracted in reading order and flowed into a clean PDF. Book styling and images are not carried over.</p>}
            {(tool.id === 'remove-word-pages' || tool.id === 'docx-page-remover') && <p className="text-xs font-semibold text-slate-500">Selected pages and sections will be removed from the DOCX file while preserving all other styles, headers, footers and tables.</p>}
            {tool.id === 'protect-pdf' && (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block"><span className="mb-1.5 block text-sm font-bold">Password (min 4 characters)</span><input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} className="input" autoComplete="new-password" placeholder="Choose a password" /></label>
                <label className="block"><span className="mb-1.5 block text-sm font-bold">Confirm password</span><input type="password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} className="input" autoComplete="new-password" placeholder="Repeat it" /></label>
                <p className="text-xs text-slate-500 sm:col-span-2">AES-256 encryption, applied and verified in your browser — the password never leaves this tab. There is no recovery if you forget it.</p>
              </div>
            )}
            {tool.id === 'unlock-pdf' && (
              <div>
                <label className="block max-w-md"><span className="mb-1.5 block text-sm font-bold">Document password</span><input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} className="input" autoComplete="off" placeholder="Enter the correct password" /></label>
                <p className="mt-2 text-xs font-semibold text-slate-500">Only the correct password works. DocDoctor does not bypass, guess or crack PDF encryption — use this only on files you own or are authorized to unlock.</p>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold text-slate-600">Total input: <strong className="text-ink-950">{formatSize(totalIn)}</strong></span>
              <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500"><FileCheck2 className="h-4 w-4 text-teal2" /> Validated · processed locally, never uploaded</span>
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <button type="button" onClick={run} disabled={busy} className="btn-accent w-full sm:w-auto">
                {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> {t('common.processing')}</> : tool.name}
              </button>
              {busy && (
                <button type="button" onClick={() => abortRef.current?.abort()} className="btn-ghost !py-2.5">
                  <XCircle className="h-4 w-4" /> {t('common.cancel')}
                </button>
              )}
              {busy && progress && progress.total > 1 && (
                <span className="flex min-w-44 flex-1 items-center gap-2" role="status">
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-slate-200">
                    <span className="block h-full rounded-full bg-accent transition-all" style={{ width: `${Math.round((progress.done / progress.total) * 100)}%` }} />
                  </span>
                  <span className="text-xs font-bold text-slate-500">{progress.done}/{progress.total}</span>
                </span>
              )}
            </div>
          </div>
        )}

        {files.length > 0 && live && serverOk && serverEndpointFor(tool) && !isServerTool(tool) && (
          <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-accent/30 bg-accent-soft/50 px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-ink-950">LibreOffice server conversion available</p>
              <p className="text-xs font-semibold text-slate-500">Full layout fidelity (fonts, images, page breaks) instead of the simplified browser conversion above. Your file is processed in an isolated temp folder and deleted immediately after.</p>
            </div>
            <button type="button" onClick={runServer} disabled={busy} className="btn-primary !py-2.5">
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Converting…</> : 'Convert with LibreOffice'}
            </button>
          </div>
        )}

        {files.length > 0 && tool.id === 'compress-pdf' && compressorOk && (
          <div className="mt-6 flex flex-wrap items-center gap-3 rounded-2xl border border-accent/30 bg-accent-soft/50 px-5 py-4">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-ink-950">Server compression available{compressorName ? ` — ${compressorName}` : ''}</p>
              <p className="text-xs font-semibold text-slate-500">Real Ghostscript/qpdf compression on the server: images are downsampled at your chosen level while text stays selectable — unlike the browser Extreme mode, which rasterizes pages. Your file is processed in an isolated temp folder and deleted immediately after.</p>
            </div>
            <button type="button" onClick={runServer} disabled={busy} className="btn-primary !py-2.5">
              {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Compressing…</> : 'Compress on server'}
            </button>
          </div>
        )}

        {files.length > 0 && isServerTool(tool) && (
          <div className="mt-6 border-t border-slate-100 pt-5">
            {serverOk === null && <p className="flex items-center gap-2 text-sm font-semibold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Checking conversion server…</p>}
            {serverOk === false && (
              <p className="flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">
                <Info className="mt-0.5 h-4 w-4 shrink-0" />
                <span>This tool renders with LibreOffice on the DocDoctor conversion server, which isn&apos;t available right now — either the service isn&apos;t running or LibreOffice isn&apos;t installed. To enable it: install LibreOffice from libreoffice.org (or <code className="rounded bg-amber-100 px-1.5 py-0.5 text-[13px]">winget install --id TheDocumentFoundation.LibreOffice</code>), then run <code className="rounded bg-amber-100 px-1.5 py-0.5 text-[13px]">npm --prefix server start</code> and reload this page. Custom install location? Set <code className="rounded bg-amber-100 px-1.5 py-0.5 text-[13px]">LIBREOFFICE_PATH</code> to soffice.exe first. Nothing here fakes a result in the meantime.</span>
              </p>
            )}
            {serverOk && (
              <div className="space-y-4">
                {tool.id === 'slides-to-images' && sel('Image format', imgFormat, setImgFormat, [['jpg', 'JPG'], ['png', 'PNG']])}
                <p className="text-xs font-semibold text-slate-500">Your file is uploaded to the conversion server, processed in an isolated temp folder, and deleted immediately after. Max retention 30 minutes.</p>
                <button type="button" onClick={runServer} disabled={busy} className="btn-accent w-full sm:w-auto">
                  {busy ? <><Loader2 className="h-4 w-4 animate-spin" /> Converting on server…</> : tool.name}
                </button>
              </div>
            )}
          </div>
        )}

        {files.length > 0 && !live && !isServerTool(tool) && (
          <p className="mt-6 flex items-start gap-2 rounded-xl bg-amber-50 px-4 py-3 text-sm font-semibold text-amber-800 ring-1 ring-amber-200">
            <Info className="mt-0.5 h-4 w-4 shrink-0" />
            <span>Upload and validation work now. The {tool.engine} engine for this tool ships in Phase {tool.phase} — processing unlocks only when the real engine is tested end-to-end.</span>
          </p>
        )}

        {error && (
          <p role="alert" className="mt-5 flex items-start gap-2 rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 ring-1 ring-red-200">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" /> {error}
          </p>
        )}

        {results.length > 0 && (
          <div className="mt-6 rounded-2xl border border-teal-200 bg-teal-50/60 p-5" role="status">
            <p className="font-display text-base font-bold text-ink-950">Done — {results.length} file{results.length > 1 ? 's' : ''} ready</p>
            <p className="mt-1 text-sm text-slate-600">
              {formatSize(totalIn)} → <strong className="text-ink-950">{formatSize(totalOut)}</strong>
              {savings !== null && savings > 0 && <span className="ml-2 font-bold text-teal-700">Saved {savings}%</span>}
              {savings !== null && savings <= 0 && <span className="ml-2 font-semibold text-slate-500">(no size reduction for this file/settings)</span>}
            </p>
            {inUrl && outUrls[0] && results.length === 1 && (
              <div className="mt-4 grid grid-cols-2 gap-3">
                <figure><img src={inUrl} alt="Original" className="max-h-56 w-full rounded-xl object-contain bg-white ring-1 ring-slate-200" /><figcaption className="mt-1 text-center text-xs font-bold text-slate-500">Original · {formatSize(totalIn)}</figcaption></figure>
                <figure><img src={outUrls[0]} alt="Processed" className="max-h-56 w-full rounded-xl object-contain bg-white ring-1 ring-slate-200" /><figcaption className="mt-1 text-center text-xs font-bold text-slate-500">Processed · {formatSize(totalOut)}</figcaption></figure>
              </div>
            )}
            {previewText && (
              <figure className="mt-4">
                <figcaption className="mb-1.5 text-xs font-extrabold uppercase tracking-wide text-slate-400">Preview — {results[0].name}</figcaption>
                <pre className="max-h-64 overflow-auto rounded-xl bg-ink-950 p-4 text-xs leading-relaxed text-slate-100">{previewText}</pre>
              </figure>
            )}
            <ul className="mt-4 space-y-2">
              {results.map((r, i) => (
                <li key={r.name + i} className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-slate-200/80">
                  {outUrls[i] && <img src={outUrls[i]!} alt="" className="h-10 w-10 rounded-lg object-cover" />}
                  <span className="min-w-0 flex-1"><span className="block truncate text-sm font-bold text-ink-950">{r.name}</span><span className="text-xs text-slate-500">{formatSize(r.blob.size)}</span></span>
                  <button type="button" onClick={() => downloadBlob(r.blob, r.name)} className="btn-ghost !px-3.5 !py-2 text-xs"><Download className="h-4 w-4" /> Download</button>
                </li>
              ))}
            </ul>
            <div className="mt-4 flex flex-wrap gap-2.5">
              {results.length > 1 && <button type="button" onClick={() => downloadZip(results, `${tool.id}-results.zip`)} className="btn-accent !py-2.5"><FolderDown className="h-4 w-4" /> Download all as ZIP</button>}
              <button type="button" onClick={() => handleFilesChange([])} className="btn-ghost !py-2.5"><RotateCcw className="h-4 w-4" /> Start another</button>
            </div>
          </div>
        )}
      </section>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        {[
          { icon: ShieldCheck, t: 'Private by default', d: live ? 'Phase 2 tools run entirely in your browser — files never leave your device.' : 'Isolated temp folders; nothing stored permanently.' },
          { icon: Clock3, t: 'Auto-delete', d: 'Server-processed files are deleted after processing, max retention 60 minutes.' },
          { icon: FileCheck2, t: 'Validated output', d: 'Success is only reported after the output file is verified non-empty.' },
        ].map((f) => (
          <div key={f.t} className="card p-5"><f.icon className="h-5 w-5 text-teal2" /><p className="mt-2.5 text-sm font-bold text-ink-950">{f.t}</p><p className="mt-1 text-sm text-slate-500">{f.d}</p></div>
        ))}
      </div>

      {related.length > 0 && (
        <section className="mt-12" aria-labelledby="related">
          <h2 id="related" className="font-display text-xl font-extrabold text-ink-950">Related tools</h2>
          <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{related.map((t) => <ToolCard key={t.id} tool={t} />)}</div>
        </section>
      )}
    </div>
  )
}
