import { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useParams } from 'react-router'
import {
  ShieldCheck, FileCheck2, Clock3, Info, Loader2, Download, FolderDown,
  RotateCcw, AlertTriangle, Star, XCircle, Copy, Check, Eye, X, SplitSquareVertical,
  RotateCw, FlipHorizontal, FlipVertical, Camera, MapPin
} from 'lucide-react'
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
const VisualCrop = lazy(() => import('../components/VisualCrop'))
const BeforeAfterSlider = lazy(() => import('../components/BeforeAfterSlider'))

const PickerFallback = () => <p className="flex items-center gap-2 py-6 text-sm font-semibold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Loading…</p>

const GRID_TOOLS: Record<string, 'select' | 'organize'> = {
  'remove-pdf-pages': 'select', 'extract-pdf-pages': 'select', 'organize-pdf': 'organize',
}

const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b))

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
  const [quality, setQuality] = useState(72)
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
  const [wmType, setWmType] = useState<'text' | 'image'>('text')
  const [wmLogoUrl, setWmLogoUrl] = useState<string | null>(null)
  const [wmPos, setWmPos] = useState<'bottom-right' | 'center' | 'tile' | 'top-left' | 'bottom-left'>('bottom-right')
  const [pageSize, setPageSize] = useState<'fit' | 'a4' | 'letter'>('fit')
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
  const [pdfEditMode, setPdfEditMode] = useState<'text' | 'redact'>('text')
  const [pdfFont, setPdfFont] = useState<'Helvetica' | 'TimesRoman' | 'Courier'>('Helvetica')
  const [pdfRedactW, setPdfRedactW] = useState(120)
  const [pdfRedactH, setPdfRedactH] = useState(24)
  const [sigData, setSigData] = useState<string | null>(null)
  const [sigWidth, setSigWidth] = useState(170)
  const [signPos, setSignPos] = useState<'bottom-right' | 'bottom-left' | 'center' | 'custom'>('bottom-right')
  const [excelOrientation, setExcelOrientation] = useState<'landscape' | 'portrait'>('landscape')

  // Upgrades: page numbers, watermark, icons, JSON, CSV
  const [pdfNumFormat, setPdfNumFormat] = useState('Page {n} of {total}')
  const [pdfNumStart, setPdfNumStart] = useState(1)
  const [pdfNumSize, setPdfNumSize] = useState(10)
  const [pdfNumColor, setPdfNumColor] = useState('#1e293b')
  const [pdfNumSkipCover, setPdfNumSkipCover] = useState(false)

  const [pdfWmAngle, setPdfWmAngle] = useState(-30)
  const [pdfWmColor, setPdfWmColor] = useState('#73738c')
  const [pdfWmSize, setPdfWmSize] = useState(48)

  const [icoSizes, setIcoSizes] = useState<number[]>([16, 24, 32, 48, 64])
  const [jsonIndent, setJsonIndent] = useState<number | 'tab'>(2)
  const [jsonValidation, setJsonValidation] = useState<{ ok: boolean; msg: string } | null>(null)

  const [csvDelim, setCsvDelim] = useState(',')
  const [csvPreviewRows, setCsvPreviewRows] = useState<string[][]>([])
  const [zipSearch, setZipSearch] = useState('')

  // Image upgrades state
  const [imgMaxEdge, setImgMaxEdge] = useState<number>(0)
  const [targetSizeKB, setTargetSizeKB] = useState<number>(0)
  const [resizeMode, setResizeMode] = useState<'stretch' | 'contain' | 'cover'>('stretch')
  const [smoothing, setSmoothing] = useState<'high' | 'pixelated'>('high')
  const [cropCircular, setCropCircular] = useState(false)
  const [imgBgColor, setImgBgColor] = useState('#ffffff')
  const [rotBgColor, setRotBgColor] = useState('#ffffff')
  const [rotFineAngle, setRotFineAngle] = useState(0)
  const [wmColor, setWmColor] = useState('#ffffff')
  const [wmAngle, setWmAngle] = useState(0)
  const [wmLogoScale, setWmLogoScale] = useState(0.28)
  const [imgPdfMargin, setImgPdfMargin] = useState<'none' | 'compact' | 'standard'>('standard')
  const [imgPdfOrientation, setImgPdfOrientation] = useState<'auto' | 'portrait' | 'landscape'>('auto')

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
  const [imgCompareMode, setImgCompareMode] = useState<'slider' | 'side'>('slider')
  const [customNames, setCustomNames] = useState<Record<number, string>>({})
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null)
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null)

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
    setCustomNames({}); setPdfPreviewUrl(null); setCopiedIdx(null); setWmLogoUrl(null)
    setJsonValidation(null); setCsvPreviewRows([])
  }

  // Load image dimensions / metadata when the first file changes.
  useEffect(() => {
    if (!first) return
    let alive = true
    if (tool.id === 'file-metadata') {
      import('../processing/text').then((m) => m.fileMetadata(first)).then((v) => { if (alive) setFileMeta(v) }).catch(() => { if (alive) setError('Could not read this file.') })
      return () => { alive = false }
    }
    if (tool.id === 'edit-word') {
      import('../processing/office').then((m) => m.wordExtractText(first)).then((v) => { if (alive) setEditText(v) }).catch(() => { if (alive) setError('Could not extract text — please use a .docx file.') })
      return () => { alive = false }
    }
    if (!first.type.startsWith('image/')) return
    import('../processing/image').then((m) => m.imageMetadata(first)).then((m) => {
      if (!alive) return
      setMeta(m); setDims({ w: m.width, h: m.height }); setWidth(m.width); setHeight(m.height)
    }).catch(() => {})
    return () => { alive = false }
  }, [first]) // eslint-disable-line react-hooks/exhaustive-deps

  // JSON validation and CSV preview when first file changes
  useEffect(() => {
    if (!first) return
    let alive = true
    if (tool.id === 'json-formatter' || tool.id === 'json-to-xml') {
      first.text().then((txt) => {
        if (!alive) return
        try {
          JSON.parse(txt)
          setJsonValidation({ ok: true, msg: 'Valid JSON format' })
        } catch (e) {
          setJsonValidation({ ok: false, msg: e instanceof Error ? e.message : 'Invalid JSON' })
        }
      }).catch(() => {})
    }
    if (tool.id === 'csv-tools') {
      first.text().then((txt) => {
        if (!alive) return
        import('../processing/text').then((m) => {
          const rows = m.parseCsv(txt, csvDelim).slice(0, 8)
          if (alive) setCsvPreviewRows(rows)
        })
      }).catch(() => {})
    }
    return () => { alive = false }
  }, [first, tool.id, csvDelim])

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
    setBusy(true); setError(''); setResults([]); setProgress(null); setPreviewText(''); setCustomNames({})
    try {
      const out = await runTool({
        tool,
        files: files.map((f) => f.file),
        signal: controller.signal,
        onProgress: (done, total) => setProgress({ done, total }),
        settings: {
          quality, format, width, height, crop, angle: rotFineAngle || angle, flipH, flipV, wmText, wmOpacity,
          wmFontSize: Math.max(24, Math.round((dims?.w ?? 800) / 18)),
          wmPos, wmLogoUrl, pageSize, ranges, level, pos, scale, slideSel, slideOrder, sheetSel, splitMode,
          txtTo, jsonMinify, csvAction, editText, pdfText, pdfPage, pdfX, pdfY, pdfSize,
          pdfColor, pdfEditMode, pdfFont, pdfRedactW, pdfRedactH, sigData, sigWidth, signPos,
          pwd, pwd2, blockSel, gridValue, ocrLang, ocrFormat, excelOrientation,
          pdfNumFormat, pdfNumStart, pdfNumSize, pdfNumColor, pdfNumSkipCover,
          pdfWmAngle, pdfWmColor, pdfWmSize, icoSizes, jsonIndent, csvDelim,
          maxEdge: imgMaxEdge || undefined,
          targetSizeKB: targetSizeKB || undefined,
          resizeMode,
          smoothing,
          cropCircular,
          imgBgColor,
          rotBgColor,
          wmColor,
          wmAngle,
          wmLogoScale,
          imgPdfMargin,
          imgPdfOrientation,
        },
      })
      if (!out.length || out.some((o) => o.blob.size === 0)) throw new Error('Processing produced an empty file. Please try different settings.')
      setResults(out)
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') setError('Processing cancelled.')
      else setError(e instanceof Error ? e.message : 'Processing failed. The file may be damaged, encrypted, or in an unsupported variant.')
    } finally { setBusy(false); setProgress(null); abortRef.current = null }
  }

  const runRef = useRef(run)
  const filesRef = useRef(files)
  const busyRef = useRef(busy)

  useEffect(() => {
    runRef.current = run
    filesRef.current = files
    busyRef.current = busy
  })

  // Keyboard shortcut: Ctrl+Enter / Cmd+Enter to run, Escape to close preview modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPdfPreviewUrl(null)
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault()
        if (filesRef.current.length > 0 && !busyRef.current) runRef.current()
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  const pwdStrength = useMemo(() => {
    if (!pwd) return { score: 0, label: '', color: '' }
    let score = 0
    if (pwd.length >= 8) score += 1
    if (pwd.length >= 12) score += 1
    if (/[a-z]/.test(pwd) && /[A-Z]/.test(pwd)) score += 1
    if (/\d/.test(pwd)) score += 1
    if (/[^A-Za-z0-9]/.test(pwd)) score += 1
    if (score <= 2) return { score: 33, label: 'Weak', color: 'bg-red-500' }
    if (score <= 4) return { score: 66, label: 'Medium', color: 'bg-amber-500' }
    return { score: 100, label: 'Strong', color: 'bg-emerald-500' }
  }, [pwd])

  const aspectRatio = useMemo(() => {
    if (!dims || dims.w <= 0 || dims.h <= 0) return null
    const d = gcd(dims.w, dims.h)
    const rw = dims.w / d
    const rh = dims.h / d
    const mp = ((dims.w * dims.h) / 1000000).toFixed(1)
    const orientation = dims.w > dims.h ? 'Landscape' : dims.w < dims.h ? 'Portrait' : 'Square'
    const ratio = dims.w / dims.h
    let common = `${rw}:${rh}`
    if (Math.abs(ratio - 16 / 9) < 0.02) common = '16:9'
    else if (Math.abs(ratio - 4 / 3) < 0.02) common = '4:3'
    else if (Math.abs(ratio - 1) < 0.01) common = '1:1'
    else if (Math.abs(ratio - 9 / 16) < 0.02) common = '9:16'
    return { common, mp, orientation }
  }, [dims])

  const savings = results.length && totalIn ? Math.round((1 - totalOut / totalIn) * 100) : null
  const outUrls = useMemo(() => results.map((r) => (r.blob.type.startsWith('image/') ? URL.createObjectURL(r.blob) : null)), [results])
  useEffect(() => () => { outUrls.forEach((u) => { if (u) URL.revokeObjectURL(u) }) }, [outUrls])

  const outPdfUrls = useMemo(() => results.map((r) => (r.blob.type === 'application/pdf' ? URL.createObjectURL(r.blob) : null)), [results])
  useEffect(() => () => { outPdfUrls.forEach((u) => { if (u) URL.revokeObjectURL(u) }) }, [outPdfUrls])

  const inUrl = useMemo(() => (first && first.type.startsWith('image/') ? URL.createObjectURL(first) : null), [first])
  useEffect(() => () => { if (inUrl) URL.revokeObjectURL(inUrl) }, [inUrl])

  const copyImage = async (blob: Blob, idx: number) => {
    try {
      let pngBlob = blob
      if (blob.type !== 'image/png') {
        const bmp = await createImageBitmap(blob)
        const c = document.createElement('canvas')
        c.width = bmp.width; c.height = bmp.height
        const ctx = c.getContext('2d')!
        ctx.drawImage(bmp, 0, 0)
        bmp.close()
        pngBlob = await new Promise<Blob>((resolve) => c.toBlob((b) => resolve(b || blob), 'image/png'))
      }
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': pngBlob })])
      setCopiedIdx(idx)
      setTimeout(() => setCopiedIdx(null), 2000)
    } catch {
      setError('Could not copy image to clipboard in this browser.')
    }
  }

  const handleStripExif = async () => {
    if (!first) return
    try {
      const { stripExif } = await import('../processing/image')
      const out = await stripExif(first)
      downloadBlob(out.blob, out.name)
    } catch {
      setError('Failed to strip metadata.')
    }
  }

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

  const displayedResults = useMemo(() => {
    if (!zipSearch.trim()) return results
    const q = zipSearch.toLowerCase()
    return results.filter((r) => r.name.toLowerCase().includes(q))
  }, [results, zipSearch])

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
          <div className="mt-6 space-y-4">
            {inUrl && (
              <div className="flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
                <div className="flex items-center gap-3 min-w-0">
                  <img src={inUrl} alt={meta.name} className="h-16 w-16 rounded-xl object-cover ring-1 ring-slate-200" />
                  <div className="min-w-0">
                    <div className="font-bold text-ink-950 truncate">{meta.name}</div>
                    <div className="text-slate-500 text-xs mt-0.5">{meta.width} × {meta.height} px · {formatSize(meta.size)}</div>
                    {(meta.exif?.make || meta.exif?.model) && (
                      <div className="text-slate-600 text-xs mt-0.5 font-semibold flex items-center gap-1">
                        <Camera className="h-3.5 w-3.5 text-accent" /> {meta.exif.make || ''} {meta.exif.model || ''}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleStripExif}
                  className="btn-accent !py-2 !px-3 text-xs flex items-center gap-1.5 shrink-0"
                  title="Export a clean copy with all EXIF and GPS tracking scrubbed"
                >
                  <ShieldCheck className="h-4 w-4" /> Download Sanitized
                </button>
              </div>
            )}

            <dl className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['File', meta.name],
                ['Dimensions', `${meta.width} × ${meta.height} px`],
                ['Aspect Ratio', aspectRatio ? `${aspectRatio.common} (${aspectRatio.orientation})` : 'N/A'],
                ['Resolution', aspectRatio ? `${aspectRatio.mp} Megapixels` : 'N/A'],
                ['Format', meta.type],
                ['Size', formatSize(meta.size)],
                ['Camera', meta.exif?.make || meta.exif?.model ? `${meta.exif?.make || ''} ${meta.exif?.model || ''}`.trim() : 'N/A in EXIF'],
                ['Date Captured', meta.exif?.dateTimeOriginal || 'N/A in EXIF'],
                ['Shutter Speed', meta.exif?.exposureTime || 'N/A'],
                ['Aperture', meta.exif?.fNumber || 'N/A'],
                ['ISO Sensitivity', meta.exif?.iso ? `ISO ${meta.exif.iso}` : 'N/A'],
                ['Focal Length', meta.exif?.focalLength || 'N/A'],
              ].map(([k, v]) => (
                <div key={k} className="rounded-xl bg-slate-50 px-4 py-3 ring-1 ring-slate-200/70">
                  <dt className="text-[11px] font-extrabold uppercase tracking-wide text-slate-400">{k}</dt>
                  <dd className="mt-0.5 truncate text-sm font-bold text-ink-950" title={v}>{v}</dd>
                </div>
              ))}
            </dl>

            {meta.exif?.gpsLatitude !== undefined && meta.exif?.gpsLongitude !== undefined && (
              <div className="flex items-start gap-2.5 rounded-xl border border-amber-300 bg-amber-50 p-4 text-xs text-amber-900">
                <MapPin className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
                <div>
                  <strong className="block text-sm font-bold text-amber-950">GPS Location Coordinates Embedded</strong>
                  <span>Latitude: {meta.exif.gpsLatitude}°, Longitude: {meta.exif.gpsLongitude}° {meta.exif.gpsAltitude !== undefined ? `· Altitude: ${meta.exif.gpsAltitude}m` : ''}. Anyone with this photo can determine where it was taken. Click &quot;Download Sanitized&quot; above to scrub all location tracking.</span>
                </div>
              </div>
            )}
            <p className="text-xs text-slate-500">Metadata and EXIF headers are read locally in your browser — your image is never uploaded to any server.</p>
          </div>
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
            <p className="mb-3 text-sm font-bold text-ink-950">
              {pdfEditMode === 'redact' ? 'Click the page to position your redaction/whiteout box' : 'Click the page to place your text'}
            </p>
            <Suspense fallback={<PickerFallback />}>
              <PagePlacement
                file={first}
                page={pdfPage}
                x={pdfX}
                y={pdfY}
                onPick={(x, y) => { setPdfX(x); setPdfY(y) }}
                onPageChange={(p) => setPdfPage(p)}
                stampText={pdfEditMode === 'redact' ? (pdfColor === '#000000' ? '████' : '░░░░') : (pdfText || 'Text here')}
                textColor={pdfColor}
                textSize={pdfSize}
              />
            </Suspense>
          </div>
        )}

        {first && tool.id === 'sign-pdf' && (
          <div className="mt-6 border-t border-slate-100 pt-5 space-y-6">
            <div>
              <p className="mb-3 text-sm font-bold text-ink-950">Create your signature</p>
              <Suspense fallback={<PickerFallback />}><SignaturePad onChange={setSigData} /></Suspense>
            </div>
            {sigData && (
              <div className="border-t border-slate-100 pt-5">
                <p className="mb-3 text-sm font-bold text-ink-950">Click on the page to place your signature</p>
                <Suspense fallback={<PickerFallback />}>
                  <PagePlacement
                    file={first}
                    page={pdfPage}
                    x={pdfX}
                    y={pdfY}
                    onPick={(x, y) => { setPdfX(x); setPdfY(y); setSignPos('custom') }}
                    onPageChange={(p) => setPdfPage(p)}
                    stampPreview={sigData}
                  />
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
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
              <span className="text-sm font-bold text-ink-950">Document Text Editor</span>
              <div className="flex items-center gap-3 text-xs font-semibold text-slate-500">
                <span>{editText.split(/\s+/).filter(Boolean).length} words</span>
                <span>·</span>
                <span>{editText.length} characters</span>
              </div>
            </div>
            <div className="mb-2 flex flex-wrap gap-1.5 border border-slate-200 bg-slate-50 p-1.5 rounded-xl">
              <button type="button" onClick={() => setEditText((t) => t + (t && !t.endsWith('\n') ? '\n' : '') + '# Heading 1\n')} className="rounded px-2.5 py-1 text-xs font-bold bg-white text-slate-700 shadow-sm hover:bg-slate-100">+ H1</button>
              <button type="button" onClick={() => setEditText((t) => t + (t && !t.endsWith('\n') ? '\n' : '') + '## Heading 2\n')} className="rounded px-2.5 py-1 text-xs font-bold bg-white text-slate-700 shadow-sm hover:bg-slate-100">+ H2</button>
              <button type="button" onClick={() => setEditText((t) => t + (t && !t.endsWith('\n') ? '\n' : '') + '- Bullet item\n')} className="rounded px-2.5 py-1 text-xs font-bold bg-white text-slate-700 shadow-sm hover:bg-slate-100">• Bullet</button>
              <button type="button" onClick={() => setEditText((t) => t + (t && !t.endsWith('\n') ? '\n' : '') + '---\n')} className="rounded px-2.5 py-1 text-xs font-bold bg-white text-slate-700 shadow-sm hover:bg-slate-100">--- Divider</button>
              <button type="button" onClick={() => setEditText('')} className="ml-auto rounded px-2.5 py-1 text-xs font-bold text-red-600 hover:bg-red-50">Clear</button>
            </div>
            <textarea value={editText} onChange={(e) => setEditText(e.target.value)} rows={14} className="input font-mono !text-[13px] leading-relaxed" placeholder="Extracting text…" />
            <p className="mt-2 text-xs font-semibold text-amber-700">Heads-up: the rebuilt DOCX uses clean, simple formatting — original fonts, images and tables are not carried into the edited file.</p>
          </div>
        )}

        {files.length > 0 && live && tool.id !== 'image-metadata' && tool.id !== 'file-metadata' && (
          <div className="mt-6 space-y-4 border-t border-slate-100 pt-5">
            {/* Tool-specific settings */}
            {tool.id === 'compress-image' && (
              <div className="space-y-4">
                {inUrl && dims && (
                  <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
                    <img src={inUrl} alt="Source" className="h-16 w-16 rounded-xl object-cover ring-1 ring-slate-200" />
                    <div className="min-w-0 flex-1 text-xs">
                      <div className="font-bold text-ink-950 truncate">{first?.name}</div>
                      <div className="text-slate-500 mt-0.5">
                        Original: <strong>{formatSize(first?.size ?? 0)}</strong> · {dims.w} × {dims.h} px {aspectRatio && `· ${aspectRatio.mp} MP (${aspectRatio.common})`}
                      </div>
                      <div className="mt-1 flex items-center gap-2">
                        <span className="inline-flex items-center rounded-md bg-emerald-50 px-2 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                          <ShieldCheck className="mr-1 h-3 w-3" /> EXIF metadata auto-stripped for web privacy
                        </span>
                      </div>
                    </div>
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  {slider('Quality', quality, setQuality, 10, 100, '%')}
                  {sel('Output format', format, setFormat, [['keep', 'Keep original format'], ['image/jpeg', 'JPG (smallest)'], ['image/png', 'PNG (lossless)'], ['image/webp', 'WebP (modern)']])}
                  {sel('Max Edge Downscaling', String(imgMaxEdge), (v: string) => setImgMaxEdge(+v), [
                    ['0', 'Original Dimensions (No scale down)'],
                    ['2560', '2560 px (2K QHD)'],
                    ['1920', '1920 px (Full HD — Recommended)'],
                    ['1280', '1280 px (720p HD)'],
                    ['800', '800 px (Compact Web)'],
                  ])}
                  <label className="block">
                    <span className="mb-1.5 flex justify-between text-sm font-bold text-ink-950">
                      Target File Size Limit
                      <span className="text-accent">{targetSizeKB ? `Under ${targetSizeKB} KB` : 'No Ceiling'}</span>
                    </span>
                    <div className="flex gap-1.5">
                      <input
                        type="number"
                        min={0}
                        step={50}
                        placeholder="e.g. 200"
                        value={targetSizeKB || ''}
                        onChange={(e) => setTargetSizeKB(Math.max(0, +e.target.value))}
                        className="input !py-1 text-xs"
                      />
                      {[100, 200, 500].map((kb) => (
                        <button
                          key={kb}
                          type="button"
                          onClick={() => setTargetSizeKB(kb)}
                          className={`rounded-lg border px-2 py-1 text-xs font-bold transition ${targetSizeKB === kb ? 'bg-accent text-white' : 'bg-white text-slate-600 hover:bg-slate-50'}`}
                        >
                          {kb}KB
                        </button>
                      ))}
                    </div>
                  </label>
                  <p className="text-xs text-slate-500 sm:col-span-2">
                    Downscaling large 12–24MP phone photos can shrink file size by 85–95% before compression. Setting a target size automatically tunes quality and resolution to meet upload requirements (visas, job forms, portals).
                  </p>
                </div>
              </div>
            )}

            {tool.id === 'resize-image' && (
              <div className="space-y-4">
                {inUrl && dims && (
                  <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
                    <img src={inUrl} alt="Source" className="h-16 w-16 rounded-xl object-cover ring-1 ring-slate-200" />
                    <div className="min-w-0 flex-1 text-xs">
                      <div className="font-bold text-ink-950 truncate">{first?.name}</div>
                      <div className="text-slate-500 mt-0.5">
                        Original: {dims.w} × {dims.h} px &nbsp;→&nbsp; <strong className="text-accent">Target: {width || dims.w} × {height || dims.h} px</strong>
                      </div>
                      <div className="text-slate-500 mt-0.5 text-[11px]">
                        Mode: <strong className="text-ink-950">{resizeMode === 'contain' ? 'Fit Inside (Padded)' : resizeMode === 'cover' ? 'Fill & Center-Crop' : 'Exact Stretch'}</strong> · Smoothing: <strong className="text-ink-950">{smoothing === 'high' ? 'Smooth (Bicubic)' : 'Crisp (Pixel Art)'}</strong>
                      </div>
                    </div>
                  </div>
                )}
                {dims && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-bold text-slate-500">Quick Scale:</span>
                    {[0.25, 0.5, 0.75, 1, 1.5, 2].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => {
                          setWidth(Math.round(dims.w * pct))
                          setHeight(Math.round(dims.h * pct))
                        }}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"
                      >
                        {pct * 100}%
                      </button>
                    ))}
                    <span className="text-slate-300">|</span>
                    <span className="text-xs font-bold text-slate-500">Standard:</span>
                    {[
                      { label: '1080p FHD', w: 1920, h: 1080 },
                      { label: '720p HD', w: 1280, h: 720 },
                      { label: 'Square', w: 1080, h: 1080 },
                      { label: 'Banner', w: 1200, h: 630 },
                    ].map((s) => (
                      <button
                        key={s.label}
                        type="button"
                        onClick={() => {
                          setWidth(s.w)
                          setHeight(s.h)
                        }}
                        className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-700 shadow-sm hover:bg-slate-50"
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="block"><span className="mb-1.5 block text-sm font-bold">Width (px)</span><input type="number" min={1} value={width || ''} onChange={(e) => onWidth(+e.target.value)} className="input" /></label>
                  <label className="block"><span className="mb-1.5 block text-sm font-bold">Height (px)</span><input type="number" min={1} value={height || ''} onChange={(e) => onHeight(+e.target.value)} className="input" /></label>
                  <label className="flex items-end gap-2 pb-3 text-sm font-bold"><input type="checkbox" checked={lock} onChange={(e) => setLock(e.target.checked)} className="h-4 w-4 accent-[#1D6FF2]" /> Keep aspect ratio</label>
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  {sel('Fitting Policy', resizeMode, setResizeMode as never, [
                    ['stretch', 'Exact Stretch (Direct W × H)'],
                    ['contain', 'Fit / Contain (Proportional with padding)'],
                    ['cover', 'Fill / Cover (Center-crop to fill)'],
                  ])}
                  {sel('Resampling Smoothing', smoothing, setSmoothing as never, [
                    ['high', 'Smooth / Bicubic (Photos & Scans)'],
                    ['pixelated', 'Crisp / Nearest-Neighbor (Pixel Art & Icons)'],
                  ])}
                  {resizeMode === 'contain' && (
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-bold">Padding Color</span>
                      <input type="color" value={imgBgColor} onChange={(e) => setImgBgColor(e.target.value)} className="h-[46px] w-full cursor-pointer rounded-xl border border-slate-200 bg-white px-2" />
                    </label>
                  )}
                </div>
              </div>
            )}

            {tool.id === 'crop-image' && inUrl && (
              <div className="space-y-4">
                <Suspense fallback={<PickerFallback />}>
                  <VisualCrop
                    imageUrl={inUrl}
                    crop={crop}
                    onChange={setCrop}
                    circular={cropCircular}
                    onCircularChange={setCropCircular}
                    imageDims={dims}
                  />
                </Suspense>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  {slider('Start X %', crop.x, (v) => setCrop({ ...crop, x: v }), 0, 90)}
                  {slider('Start Y %', crop.y, (v) => setCrop({ ...crop, y: v }), 0, 90)}
                  {slider('Width %', crop.w, (v) => setCrop({ ...crop, w: v }), 10, 100)}
                  {slider('Height %', crop.h, (v) => setCrop({ ...crop, h: v }), 10, 100)}
                </div>
              </div>
            )}

            {(tool.id === 'webp-converter' || tool.id === 'jpg-to-png' || tool.id === 'png-to-jpg' || tool.id === 'jpg-to-webp' || tool.id === 'png-to-webp') && (
              <div className="space-y-4">
                {inUrl && dims && (
                  <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-3 shadow-sm">
                    <img src={inUrl} alt="Source" className="h-16 w-16 rounded-xl object-cover ring-1 ring-slate-200" />
                    <div className="min-w-0 flex-1 text-xs">
                      <div className="font-bold text-ink-950 truncate">{first?.name}</div>
                      <div className="text-slate-500 mt-0.5">
                        Original: {formatSize(first?.size ?? 0)} · {dims.w} × {dims.h} px
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 font-bold text-accent">
                        Target format: <span className="uppercase">{tool.id.includes('to-png') ? 'PNG (Lossless)' : tool.id.includes('to-jpg') ? 'JPG' : tool.id.includes('to-webp') ? 'WebP' : (format === 'keep' ? 'WebP' : format.split('/')[1])}</span>
                      </div>
                    </div>
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  {tool.id === 'webp-converter' && sel('Convert to', format === 'keep' ? 'image/webp' : format, setFormat, [['image/webp', 'WebP'], ['image/jpeg', 'JPG'], ['image/png', 'PNG']])}
                  {slider('Compression Quality', quality, setQuality, 10, 100, '%')}
                  {(tool.id === 'png-to-jpg' || (tool.id === 'webp-converter' && format === 'image/jpeg')) && (
                    <label className="block sm:col-span-2">
                      <span className="mb-1.5 block text-sm font-bold">Background Fill Color (for transparent pixels)</span>
                      <div className="flex items-center gap-3">
                        <input type="color" value={imgBgColor} onChange={(e) => setImgBgColor(e.target.value)} className="h-10 w-20 cursor-pointer rounded-xl border border-slate-200 bg-white px-2" />
                        <div className="flex gap-2">
                          {[['#ffffff', 'White'], ['#000000', 'Black'], ['#f8fafc', 'Light Slate']].map(([c, lbl]) => (
                            <button
                              key={c}
                              type="button"
                              onClick={() => setImgBgColor(c)}
                              className={`rounded-lg border px-2.5 py-1 text-xs font-bold transition ${imgBgColor === c ? 'border-accent bg-accent/10 text-accent ring-1 ring-accent' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
                            >
                              {lbl}
                            </button>
                          ))}
                        </div>
                      </div>
                    </label>
                  )}
                </div>
              </div>
            )}

            {(tool.id === 'rotate-image' || tool.id === 'flip-image') && (
              <div className="space-y-4">
                {inUrl && (
                  <div>
                    <span className="mb-2 block text-xs font-bold text-slate-500">Live Orientation Preview</span>
                    <div className="flex h-56 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-900/5 p-4 shadow-inner">
                      <img
                        src={inUrl}
                        alt="Orientation preview"
                        className="max-h-48 max-w-full object-contain transition-transform duration-300"
                        style={{
                          transform: `rotate(${tool.id === 'rotate-image' ? (rotFineAngle || angle) : 0}deg) scaleX(${tool.id === 'flip-image' && flipH ? -1 : 1}) scaleY(${tool.id === 'flip-image' && flipV ? -1 : 1})`,
                        }}
                      />
                    </div>
                  </div>
                )}
                {tool.id === 'rotate-image' && (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-xs font-bold text-slate-500">Quick Rotate:</span>
                      {[
                        { label: '90° Clockwise', val: 90 },
                        { label: '180° Half Turn', val: 180 },
                        { label: '270° (90° CCW)', val: 270 },
                      ].map((btn) => (
                        <button
                          key={btn.val}
                          type="button"
                          onClick={() => { setAngle(btn.val); setRotFineAngle(0) }}
                          className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-xs font-bold transition ${angle === btn.val && rotFineAngle === 0 ? 'border-accent bg-accent/10 text-accent ring-1 ring-accent' : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'}`}
                        >
                          <RotateCw className="h-3.5 w-3.5" /> {btn.label}
                        </button>
                      ))}
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                      {slider('Fine Straightening Angle', rotFineAngle, setRotFineAngle, -45, 45, '°')}
                      <label className="block">
                        <span className="mb-1.5 block text-sm font-bold">Corner Padding Background</span>
                        <div className="flex items-center gap-3">
                          <input type="color" value={rotBgColor} onChange={(e) => setRotBgColor(e.target.value)} className="h-10 w-20 cursor-pointer rounded-xl border border-slate-200 bg-white px-2" />
                          <span className="text-xs text-slate-500">Color used to fill newly exposed corners when rotated</span>
                        </div>
                      </label>
                    </div>
                  </div>
                )}
                {tool.id === 'flip-image' && (
                  <div className="flex flex-wrap gap-4 pt-1">
                    <button
                      type="button"
                      onClick={() => setFlipH(!flipH)}
                      className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold transition ${flipH ? 'border-accent bg-accent/10 text-accent ring-1 ring-accent' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                    >
                      <FlipHorizontal className="h-4 w-4" /> Flip Horizontally (Mirror Left-Right)
                    </button>
                    <button
                      type="button"
                      onClick={() => setFlipV(!flipV)}
                      className={`flex items-center gap-2 rounded-xl border px-4 py-2.5 text-xs font-bold transition ${flipV ? 'border-accent bg-accent/10 text-accent ring-1 ring-accent' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
                    >
                      <FlipVertical className="h-4 w-4" /> Flip Vertically (Upside Down)
                    </button>
                  </div>
                )}
              </div>
            )}

            {tool.id === 'rotate-pdf' && sel('Rotation', String(angle), (v: string) => setAngle(+v), [['90', '90° clockwise'], ['180', '180°'], ['270', '270° clockwise']])}

            {tool.id === 'image-watermark' && (
              <div className="space-y-4">
                {/* Live Watermark Preview on Canvas */}
                {inUrl && (
                  <div>
                    <span className="mb-2 block text-xs font-bold text-slate-500 uppercase tracking-wide">Live Watermark Preview</span>
                    <div className="relative mx-auto flex h-64 items-center justify-center overflow-hidden rounded-2xl border border-slate-200 bg-slate-900/10 p-3 shadow-inner">
                      <img src={inUrl} alt="Watermark preview" className="max-h-56 max-w-full rounded-lg object-contain" />
                      {wmType === 'text' && wmText && (
                        <div
                          className="pointer-events-none absolute font-bold select-none text-center"
                          style={{
                            color: wmColor,
                            opacity: wmOpacity,
                            fontSize: `${Math.max(14, Math.min(36, (dims?.w ? dims.w / 25 : 24)))}px`,
                            ...(wmPos === 'center' ? { top: '50%', left: '50%', transform: `translate(-50%, -50%) rotate(${wmAngle}deg)` }
                              : wmPos === 'top-left' ? { top: '20px', left: '20px', transform: `rotate(${wmAngle}deg)` }
                              : wmPos === 'bottom-left' ? { bottom: '20px', left: '20px', transform: `rotate(${wmAngle}deg)` }
                              : wmPos === 'tile' ? { inset: '10px', display: 'flex', flexWrap: 'wrap', gap: '24px', justifyContent: 'center', alignItems: 'center' }
                              : { bottom: '20px', right: '20px', transform: `rotate(${wmAngle}deg)` }
                            ),
                            textShadow: '0 1px 4px rgba(0,0,0,0.6)',
                          }}
                        >
                          {wmPos === 'tile' ? Array(8).fill(wmText).join('  •  ') : wmText}
                        </div>
                      )}
                      {wmType === 'image' && wmLogoUrl && (
                        <img
                          src={wmLogoUrl}
                          alt="Logo preview"
                          className="pointer-events-none absolute select-none object-contain"
                          style={{
                            opacity: wmOpacity,
                            width: `${Math.round(wmLogoScale * 100)}%`,
                            maxHeight: '40%',
                            ...(wmPos === 'center' ? { top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }
                              : wmPos === 'top-left' ? { top: '20px', left: '20px' }
                              : wmPos === 'bottom-left' ? { bottom: '20px', left: '20px' }
                              : { bottom: '20px', right: '20px' }
                            ),
                          }}
                        />
                      )}
                    </div>
                  </div>
                )}

                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                  <button
                    type="button"
                    onClick={() => setWmType('text')}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${wmType === 'text' ? 'bg-accent text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    Text Watermark
                  </button>
                  <button
                    type="button"
                    onClick={() => setWmType('image')}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${wmType === 'image' ? 'bg-accent text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    Logo / Image Watermark
                  </button>
                </div>

                {wmType === 'text' ? (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <label className="block sm:col-span-2 lg:col-span-1">
                      <span className="mb-1.5 block text-sm font-bold">Watermark Text</span>
                      <input value={wmText} onChange={(e) => setWmText(e.target.value)} className="input" maxLength={60} />
                    </label>
                    <label className="block">
                      <span className="mb-1.5 block text-sm font-bold">Text Color</span>
                      <input type="color" value={wmColor} onChange={(e) => setWmColor(e.target.value)} className="h-[46px] w-full cursor-pointer rounded-xl border border-slate-200 bg-white px-2" />
                    </label>
                    {sel('Rotation Angle', String(wmAngle), (v: string) => setWmAngle(+v), [
                      ['0', 'Horizontal (0°)'],
                      ['-30', 'Diagonal (-30°)'],
                      ['-45', 'Diagonal (-45°)'],
                    ])}
                    {slider('Opacity', Math.round(wmOpacity * 100), (v) => setWmOpacity(v / 100), 5, 95, '%')}
                    {sel('Watermark Position', wmPos, setWmPos as never, [
                      ['bottom-right', 'Bottom Right'],
                      ['bottom-left', 'Bottom Left'],
                      ['top-left', 'Top Left'],
                      ['center', 'Center'],
                      ['tile', 'Tiled diagonally'],
                    ])}
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <label className="block sm:col-span-2 lg:col-span-1">
                      <span className="mb-1.5 block text-sm font-bold">Upload Logo (PNG / JPG)</span>
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => {
                          const f = e.target.files?.[0]
                          if (f) {
                            const reader = new FileReader()
                            reader.onload = () => setWmLogoUrl(reader.result as string)
                            reader.readAsDataURL(f)
                          }
                        }}
                        className="input !py-2 text-xs"
                      />
                    </label>
                    {slider('Logo Scale', Math.round(wmLogoScale * 100), (v) => setWmLogoScale(v / 100), 10, 50, '%')}
                    {slider('Opacity', Math.round(wmOpacity * 100), (v) => setWmOpacity(v / 100), 5, 100, '%')}
                    {sel('Position', wmPos, setWmPos as never, [
                      ['bottom-right', 'Bottom Right'],
                      ['bottom-left', 'Bottom Left'],
                      ['top-left', 'Top Left'],
                      ['center', 'Center'],
                      ['tile', 'Tiled across image'],
                    ])}
                  </div>
                )}
              </div>
            )}

            {tool.id === 'pdf-watermark' && (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block"><span className="mb-1.5 block text-sm font-bold">Watermark text</span><input value={wmText} onChange={(e) => setWmText(e.target.value)} className="input" maxLength={60} /></label>
                  {slider('Opacity', Math.round(wmOpacity * 100), (v) => setWmOpacity(v / 100), 5, 90, '%')}
                </div>
                <div className="grid gap-4 sm:grid-cols-3">
                  {sel('Angle', String(pdfWmAngle), (v: string) => setPdfWmAngle(+v), [
                    ['-30', 'Diagonal (-30°)'],
                    ['-45', 'Diagonal (-45°)'],
                    ['0', 'Horizontal (0°)'],
                  ])}
                  {slider('Font Size', pdfWmSize, setPdfWmSize, 20, 72, ' pt')}
                  {sel('Color Theme', pdfWmColor, setPdfWmColor, [
                    ['#73738c', 'Subtle Gray'],
                    ['#dc2626', 'Confidential Red'],
                    ['#002d62', 'Corporate Navy'],
                    ['#1e293b', 'Dark Slate'],
                  ])}
                </div>
              </div>
            )}

            {tool.id === 'ico-converter' && (
              <div className="space-y-4">
                {inUrl && (
                  <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
                    <span className="mb-2 block text-xs font-bold text-slate-500 uppercase tracking-wide">Live Favicon Mockup</span>
                    <div className="grid gap-3 sm:grid-cols-2">
                      {/* Browser Tab Mockup */}
                      <div className="rounded-xl border border-slate-300 bg-white shadow-sm overflow-hidden">
                        <div className="flex items-center gap-2 border-b border-slate-200 bg-slate-100 px-3 py-2 text-xs">
                          <span className="flex gap-1.5">
                            <span className="h-2.5 w-2.5 rounded-full bg-red-400" />
                            <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
                            <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
                          </span>
                          <div className="ml-2 flex items-center gap-1.5 rounded-t-lg bg-white px-3 py-1 font-semibold text-slate-700 shadow-sm border-t border-x border-slate-200 text-[11px]">
                            <img src={inUrl} alt="" className="h-4 w-4 rounded-sm object-cover" />
                            <span className="truncate max-w-28">{first?.name.replace(/\.[^.]+$/, '') || 'My Website'}</span>
                          </div>
                        </div>
                        <div className="p-3 text-[11px] text-slate-400 italic text-center">16×16 Browser Tab Preview</div>
                      </div>

                      {/* Desktop / Taskbar Mockup */}
                      <div className="flex items-center justify-around rounded-xl border border-slate-200 bg-white p-3 shadow-sm">
                        <div className="flex flex-col items-center gap-1">
                          <img src={inUrl} alt="" className="h-8 w-8 rounded-lg object-cover shadow-sm ring-1 ring-slate-200" />
                          <span className="text-[10px] font-bold text-slate-500">32×32 Taskbar</span>
                        </div>
                        <div className="flex flex-col items-center gap-1">
                          <img src={inUrl} alt="" className="h-12 w-12 rounded-xl object-cover shadow-md ring-1 ring-slate-200" />
                          <span className="text-[10px] font-bold text-slate-500">48×48 Desktop</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div>
                  <span className="mb-2 block text-sm font-bold text-ink-950">Icon sizes to embed</span>
                  <div className="flex flex-wrap gap-2">
                    {[
                      { size: 16, label: '16×16 (Browser favicon)' },
                      { size: 24, label: '24×24 (Taskbar)' },
                      { size: 32, label: '32×32 (Standard Desktop)' },
                      { size: 48, label: '48×48 (Windows Explorer)' },
                      { size: 64, label: '64×64 (High-res)' },
                      { size: 128, label: '128×128 (Large)' },
                      { size: 256, label: '256×256 (HiDPI / Retina)' },
                    ].map((item) => {
                      const checked = icoSizes.includes(item.size)
                      return (
                        <label key={item.size} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3 py-1.5 text-xs font-bold transition ${checked ? 'border-accent bg-accent/10 text-accent ring-1 ring-accent' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}>
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => {
                              if (checked) {
                                if (icoSizes.length > 1) setIcoSizes(icoSizes.filter((s) => s !== item.size))
                              } else {
                                setIcoSizes([...icoSizes, item.size].sort((a, b) => a - b))
                              }
                            }}
                            className="h-3.5 w-3.5 accent-[#1D6FF2]"
                          />
                          {item.label}
                        </label>
                      )
                    })}
                  </div>
                </div>
              </div>
            )}

            {tool.id === 'image-to-pdf' && (
              <div className="space-y-4">
                {files.length > 0 && (
                  <div className="space-y-2">
                    <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">
                      PDF Page Sequence ({files.length} page{files.length > 1 ? 's' : ''})
                    </span>
                    <div className="flex gap-2.5 overflow-x-auto pb-2">
                      {files.map((f, i) => (
                        <div key={f.id} className="relative flex-shrink-0 w-24 rounded-xl border border-slate-200 bg-white p-1.5 shadow-sm text-center">
                          <div className="h-20 w-full overflow-hidden rounded-lg bg-slate-100 flex items-center justify-center">
                            {f.file.type.startsWith('image/') && (
                              <img src={URL.createObjectURL(f.file)} alt="" className="h-full w-full object-cover" />
                            )}
                          </div>
                          <span className="mt-1 block text-[10px] font-bold text-slate-600 truncate">Page {i + 1}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-3">
                  {sel('Page size', pageSize, setPageSize as never, [
                    ['fit', 'Fit page to image (Preserve exact aspect ratio)'],
                    ['a4', 'Standard A4 (595 × 842 pt)'],
                    ['letter', 'US Letter (612 × 792 pt)'],
                  ])}
                  {sel('Page Margin', imgPdfMargin, setImgPdfMargin as never, [
                    ['none', 'No margins (Full Bleed)'],
                    ['compact', 'Compact margins (18 pt)'],
                    ['standard', 'Standard margins (36 pt)'],
                  ])}
                  {sel('Orientation', imgPdfOrientation, setImgPdfOrientation as never, [
                    ['auto', 'Auto-detect per image'],
                    ['portrait', 'Force Portrait'],
                    ['landscape', 'Force Landscape'],
                  ])}
                </div>
              </div>
            )}

            {tool.id === 'split-pdf' && (
              <div className="space-y-3">
                <label className="block">
                  <span className="mb-1.5 block text-sm font-bold">Pages to extract</span>
                  <input value={ranges} onChange={(e) => setRanges(e.target.value)} className="input font-mono" placeholder="e.g. 1-3, 5 — separate outputs with ; e.g. 1-2; 3-4" />
                  <span className="mt-1 block text-xs font-medium text-slate-500">Use ranges like 1-3, 5. Separate groups with a semicolon to create multiple files.</span>
                </label>
                <div className="flex flex-wrap items-center gap-1.5 text-xs font-bold">
                  <span className="text-slate-400 mr-1">Presets:</span>
                  <button type="button" onClick={() => setRanges('1; 2; 3; 4; 5')} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-slate-700 hover:bg-slate-50 shadow-sm">Every page</button>
                  <button type="button" onClick={() => setRanges('1-2; 3-4; 5-6')} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-slate-700 hover:bg-slate-50 shadow-sm">Every 2 pages</button>
                  <button type="button" onClick={() => setRanges('1, 3, 5, 7, 9')} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-slate-700 hover:bg-slate-50 shadow-sm">Odd pages</button>
                  <button type="button" onClick={() => setRanges('2, 4, 6, 8, 10')} className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-slate-700 hover:bg-slate-50 shadow-sm">Even pages</button>
                </div>
              </div>
            )}

            {tool.id === 'compress-pdf' && (
              <div>
                {sel('Compression level', level, setLevel, [
                  ['recommended', 'Recommended (Balanced — optimizes images & metadata)'],
                  ['extreme', 'Extreme (Smallest — 60%–80% shrink, web resolution)'],
                  ['less', 'Light (Lightest touch — lossless vector optimization)'],
                ])}
                <p className="mt-2 text-xs text-slate-500">
                  <strong>Recommended</strong> keeps selectable vector text and fonts 100% crisp while downsampling photo streams. Vector-only PDFs (resumes, contracts) naturally compress around ~10% losslessly to prevent blurring. For large scans, presentations, or strict portal upload limits, switch to <strong>Extreme</strong> to rasterize pages to compact 72 DPI web resolution.
                </p>
              </div>
            )}
            {(tool.id === 'ocr-pdf' || tool.id === 'image-ocr') && (
              <div className="grid gap-4 sm:grid-cols-2">
                {sel('OCR language', ocrLang, setOcrLang, OCR_LANGUAGES.map((l) => [l.code, l.label] as [string, string]))}
                {sel('Output', ocrFormat, setOcrFormat as never, [['txt', 'Plain text (.txt)'], ['pdf', 'Searchable PDF'], ['docx', 'Editable Word document (.docx)'], ['both', 'Both text + searchable PDF']])}
                <p className="text-xs font-semibold text-slate-500 sm:col-span-2">OCR runs entirely on your device. The first run downloads the selected language model (a few MB) once and caches it; your file itself is never uploaded. Searchable PDFs carry an invisible text layer over the page image — best for Latin scripts; other scripts are fully included in the text output. Best results on clean, high-contrast scans.</p>
              </div>
            )}

            {tool.id === 'pdf-page-numbers' && (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  {sel('Numbering Format', pdfNumFormat, setPdfNumFormat, [
                    ['Page {n} of {total}', 'Page {n} of {total}'],
                    ['{n} / {total}', '{n} / {total}'],
                    ['Page {n}', 'Page {n}'],
                    ['{n}', '{n}'],
                  ])}
                  {sel('Position', pos, setPos, [
                    ['bottom-center', 'Bottom Center'],
                    ['bottom-right', 'Bottom Right'],
                    ['bottom-left', 'Bottom Left'],
                  ])}
                </div>
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-bold">Start Numbering At</span>
                    <input type="number" min={1} value={pdfNumStart} onChange={(e) => setPdfNumStart(Math.max(1, +e.target.value || 1))} className="input" />
                  </label>
                  {slider('Font Size', pdfNumSize, setPdfNumSize, 8, 18, ' pt')}
                  {sel('Font Color', pdfNumColor, setPdfNumColor, [
                    ['#1e293b', 'Dark Slate'],
                    ['#64748b', 'Muted Gray'],
                    ['#000000', 'Solid Black'],
                  ])}
                  <label className="flex items-center gap-2 pt-6 text-sm font-bold">
                    <input type="checkbox" checked={pdfNumSkipCover} onChange={(e) => setPdfNumSkipCover(e.target.checked)} className="h-4 w-4 accent-[#1D6FF2]" />
                    Skip Cover Page (No number on page 1)
                  </label>
                </div>
              </div>
            )}

            {(tool.id === 'pdf-to-jpg' || tool.id === 'pdf-to-png' || tool.id === 'pdf-to-image') && sel('Render quality', String(scale), (v: string) => setScale(+v), [['1', 'Standard (72 dpi)'], ['2', 'High (144 dpi)'], ['3', 'Print (216 dpi)']])}
            {tool.id === 'split-word' && <div>{sel('Split by', splitMode, setSplitMode, [['heading', 'Heading 1 sections'], ['paragraphs', 'Every 15 paragraphs']])}<p className="mt-2 text-xs text-slate-500">Word pagination depends on fonts and rendering, so splitting uses document structure — headings or paragraph blocks — never guessed page breaks.</p></div>}
            {(tool.id === 'txt-converter' || tool.id === 'markdown-converter') && sel('Convert to', txtTo, setTxtTo, [['html', 'HTML'], ['txt', 'Plain text (TXT)'], ['md', 'Markdown']])}

            {tool.id === 'json-formatter' && (
              <div className="space-y-4">
                {jsonValidation && (
                  <div className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold ${jsonValidation.ok ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' : 'bg-red-50 text-red-800 border border-red-200'}`}>
                    {jsonValidation.ok ? <Check className="h-4 w-4 text-emerald-600" /> : <AlertTriangle className="h-4 w-4 text-red-600" />}
                    {jsonValidation.msg}
                  </div>
                )}
                <div className="grid gap-4 sm:grid-cols-2">
                  {sel('Formatting Style', jsonMinify ? 'min' : String(jsonIndent), (v: string) => {
                    if (v === 'min') setJsonMinify(true)
                    else { setJsonMinify(false); setJsonIndent(v === 'tab' ? 'tab' : +v) }
                  }, [
                    ['2', '2 Spaces (Standard Pretty-print)'],
                    ['4', '4 Spaces (Expanded)'],
                    ['tab', 'Tab Indentation'],
                    ['min', 'Minify (Remove all whitespace)'],
                  ])}
                </div>
              </div>
            )}

            {tool.id === 'csv-tools' && (
              <div className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  {sel('Action', csvAction, setCsvAction, [['dedupe', 'Remove duplicate rows'], ['trim', 'Trim whitespace in every cell']])}
                  {sel('Delimiter', csvDelim, setCsvDelim, [
                    [',', 'Comma ( , ) — Standard CSV'],
                    [';', 'Semicolon ( ; ) — European CSV'],
                    ['\t', 'Tab ( \\t ) — TSV'],
                    ['|', 'Pipe ( | )'],
                  ])}
                </div>
                {csvPreviewRows.length > 0 && (
                  <div>
                    <span className="mb-1.5 block text-xs font-extrabold uppercase tracking-wide text-slate-400">Data Table Preview (First {csvPreviewRows.length} Rows)</span>
                    <div className="max-h-48 overflow-auto rounded-xl border border-slate-200 bg-white shadow-sm">
                      <table className="w-full border-collapse text-left text-xs">
                        <tbody>
                          {csvPreviewRows.map((row, ri) => (
                            <tr key={ri} className={ri === 0 ? 'bg-slate-50 font-bold border-b border-slate-200' : 'border-b border-slate-100 hover:bg-slate-50/50'}>
                              {row.slice(0, 8).map((cell, ci) => (
                                <td key={ci} className="truncate px-3 py-1.5 border-r border-slate-100 max-w-40">{cell}</td>
                              ))}
                              {row.length > 8 && <td className="px-2 py-1.5 text-slate-400 font-bold">+{row.length - 8} more cols</td>}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}

            {tool.id === 'merge-word' && <p className="text-xs font-semibold text-slate-500">Documents are appended in upload order with a page break between them. You can reorder them in the list above before merging.</p>}
            {tool.id === 'merge-presentations' && <p className="text-xs font-semibold text-slate-500">Slides are appended in upload order using the first deck&apos;s theme. Reorder your decks in the list above before processing.</p>}
            {(tool.id === 'xlsx-to-pdf' || tool.id === 'excel-to-pdf') && (
              <div className="space-y-3">
                {sel('Page Orientation', excelOrientation, setExcelOrientation as never, [
                  ['landscape', 'Landscape (Recommended — wider tables)'],
                  ['portrait', 'Portrait (Standard vertical page)'],
                ])}
                <p className="text-xs font-semibold text-slate-500">Produces a clean, values-only PDF table (up to 200 rows per sheet). Landscape orientation provides extra columns.</p>
              </div>
            )}
            {(tool.id === 'compress-docx' || tool.id === 'compress-powerpoint' || tool.id === 'compress-excel') && <p className="text-xs text-slate-500">Repacks the file at maximum compression without changing content. Already-compressed media inside may not shrink further — real sizes are shown after processing.</p>}
            {tool.id === 'edit-pdf' && (
              <div className="space-y-4">
                <div className="flex items-center gap-2 border-b border-slate-200 pb-2">
                  <button
                    type="button"
                    onClick={() => setPdfEditMode('text')}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${pdfEditMode === 'text' ? 'bg-accent text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    Add Text
                  </button>
                  <button
                    type="button"
                    onClick={() => { setPdfEditMode('redact'); setPdfColor('#ffffff') }}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${pdfEditMode === 'redact' ? 'bg-accent text-white' : 'text-slate-600 hover:bg-slate-100'}`}
                  >
                    Redact / Whiteout Box
                  </button>
                </div>

                {pdfEditMode === 'text' ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    <label className="block"><span className="mb-1.5 block text-sm font-bold">Text to add</span><input value={pdfText} onChange={(e) => setPdfText(e.target.value)} className="input" placeholder="e.g. Approved 2026" maxLength={120} /></label>
                    {sel('Font', pdfFont, setPdfFont as never, [
                      ['Helvetica', 'Helvetica (Clean Sans)'],
                      ['TimesRoman', 'Times Roman (Serif)'],
                      ['Courier', 'Courier (Monospace)'],
                    ])}
                    {slider('Font size', pdfSize, setPdfSize, 8, 48, ' pt')}
                    <label className="block"><span className="mb-1.5 block text-sm font-bold">Color</span><input type="color" value={pdfColor} onChange={(e) => setPdfColor(e.target.value)} className="h-[46px] w-full cursor-pointer rounded-xl border border-slate-200 bg-white px-2" /></label>
                  </div>
                ) : (
                  <div className="grid gap-4 sm:grid-cols-3">
                    {slider('Box Width', pdfRedactW, setPdfRedactW, 20, 300, ' px')}
                    {slider('Box Height', pdfRedactH, setPdfRedactH, 10, 100, ' px')}
                    <label className="block"><span className="mb-1.5 block text-sm font-bold">Box Color</span><input type="color" value={pdfColor} onChange={(e) => setPdfColor(e.target.value)} className="h-[46px] w-full cursor-pointer rounded-xl border border-slate-200 bg-white px-2" /></label>
                    <p className="text-xs text-slate-500 sm:col-span-3">Whiteout covers unwanted text; black creates a formal redaction block. Click the preview above to position.</p>
                  </div>
                )}
              </div>
            )}
            {tool.id === 'sign-pdf' && (
              <div className="grid gap-4 sm:grid-cols-2">
                {sel('Signature position', signPos, setSignPos as never, [
                  ['custom', 'Custom placement (click on page above)'],
                  ['bottom-right', 'Bottom right'],
                  ['bottom-left', 'Bottom left'],
                  ['center', 'Center'],
                ])}
                {slider('Signature Width', sigWidth, setSigWidth, 80, 320, ' px')}
                <p className="text-xs text-slate-500 sm:col-span-2">
                  {signPos === 'custom' ? `Signature placed at ${pdfX}% across, ${pdfY}% down on page ${pdfPage}. Click or flip pages on the preview above to reposition.` : `Using ${signPos.replace('-', ' ')} preset position.`}
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
              <div className="space-y-3">
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-bold">Password (min 4 characters)</span>
                    <input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} className="input" autoComplete="new-password" placeholder="Choose a password" />
                  </label>
                  <label className="block">
                    <span className="mb-1.5 block text-sm font-bold">Confirm password</span>
                    <input type="password" value={pwd2} onChange={(e) => setPwd2(e.target.value)} className="input" autoComplete="new-password" placeholder="Repeat it" />
                  </label>
                </div>
                {pwd && (
                  <div>
                    <div className="flex items-center justify-between text-xs font-bold mb-1">
                      <span className="text-slate-500">Password Strength:</span>
                      <span className={pwdStrength.score === 100 ? 'text-emerald-600' : pwdStrength.score === 66 ? 'text-amber-600' : 'text-red-600'}>
                        {pwdStrength.label}
                      </span>
                    </div>
                    <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-200">
                      <div className={`h-full transition-all duration-300 ${pwdStrength.color}`} style={{ width: `${pwdStrength.score}%` }} />
                    </div>
                  </div>
                )}
                <p className="text-xs text-slate-500">AES-256 encryption, applied and verified in your browser — the password never leaves this tab. There is no recovery if you forget it.</p>
              </div>
            )}
            {tool.id === 'unlock-pdf' && (
              <div>
                <label className="block max-w-md"><span className="mb-1.5 block text-sm font-bold">Document password</span><input type="password" value={pwd} onChange={(e) => setPwd(e.target.value)} className="input" autoComplete="off" placeholder="Enter the correct password" /></label>
                <p className="mt-2 text-xs font-semibold text-slate-500">Only the correct password works. DocDoctor does not bypass, guess or crack PDF encryption — use this only on files you own or are authorized to unlock.</p>
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-semibold text-slate-600">Total input: <strong className="text-ink-950">{formatSize(totalIn)}</strong></span>
                <span className="inline-flex items-center gap-1.5 text-xs font-semibold text-slate-500"><FileCheck2 className="h-4 w-4 text-teal2" /> Validated · processed locally</span>
              </div>
              <span className="text-[11px] font-semibold text-slate-400 hidden sm:inline-block">Tip: Press <kbd className="rounded bg-slate-100 px-1.5 py-0.5 border text-slate-700">Ctrl+Enter</kbd> to run</span>
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
              {savings !== null && savings <= 0 && (
                <span className="ml-2 font-semibold text-slate-500">
                  {tool.id.startsWith('compress-')
                    ? '(File is already at optimal compression — preserved at original size)'
                    : '(no size reduction for this file/settings)'}
                </span>
              )}
            </p>

            {/* Interactive Before/After image comparison */}
            {inUrl && outUrls[0] && results.length === 1 && (
              <div className="mt-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-500">Visual Quality Comparison</span>
                  <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-bold shadow-sm">
                    <button
                      type="button"
                      onClick={() => setImgCompareMode('slider')}
                      className={`flex items-center gap-1 rounded px-2.5 py-1 ${imgCompareMode === 'slider' ? 'bg-accent text-white shadow-sm' : 'text-slate-600 hover:text-ink-950'}`}
                    >
                      <SplitSquareVertical className="h-3.5 w-3.5" /> Slider
                    </button>
                    <button
                      type="button"
                      onClick={() => setImgCompareMode('side')}
                      className={`flex items-center gap-1 rounded px-2.5 py-1 ${imgCompareMode === 'side' ? 'bg-accent text-white shadow-sm' : 'text-slate-600 hover:text-ink-950'}`}
                    >
                      Side by Side
                    </button>
                  </div>
                </div>

                {imgCompareMode === 'slider' ? (
                  <Suspense fallback={<PickerFallback />}>
                    <BeforeAfterSlider
                      originalUrl={inUrl}
                      processedUrl={outUrls[0]}
                      originalLabel={`Original · ${formatSize(totalIn)}`}
                      processedLabel={`Processed · ${formatSize(totalOut)}`}
                    />
                  </Suspense>
                ) : (
                  <div className="grid grid-cols-2 gap-3">
                    <figure><img src={inUrl} alt="Original" className="max-h-56 w-full rounded-xl object-contain bg-white ring-1 ring-slate-200" /><figcaption className="mt-1 text-center text-xs font-bold text-slate-500">Original · {formatSize(totalIn)}</figcaption></figure>
                    <figure><img src={outUrls[0]} alt="Processed" className="max-h-56 w-full rounded-xl object-contain bg-white ring-1 ring-slate-200" /><figcaption className="mt-1 text-center text-xs font-bold text-slate-500">Processed · {formatSize(totalOut)}</figcaption></figure>
                  </div>
                )}
              </div>
            )}

            {previewText && (
              <figure className="mt-4">
                <figcaption className="mb-1.5 text-xs font-extrabold uppercase tracking-wide text-slate-400">Preview — {results[0].name}</figcaption>
                <pre className="max-h-64 overflow-auto rounded-xl bg-ink-950 p-4 text-xs leading-relaxed text-slate-100">{previewText}</pre>
              </figure>
            )}

            {results.length > 5 && (
              <div className="mt-4">
                <input
                  type="text"
                  value={zipSearch}
                  onChange={(e) => setZipSearch(e.target.value)}
                  placeholder="Filter results by filename…"
                  className="input !py-1.5 text-xs"
                />
              </div>
            )}

            <ul className="mt-4 space-y-2">
              {displayedResults.map((r, i) => {
                const displayName = customNames[i] ?? r.name
                const isPdf = r.blob.type === 'application/pdf' || r.name.toLowerCase().endsWith('.pdf')
                const isImage = r.blob.type.startsWith('image/')
                return (
                  <li key={r.name + i} className="flex flex-wrap items-center gap-3 rounded-xl bg-white px-4 py-3 ring-1 ring-slate-200/80 shadow-sm">
                    {outUrls[i] && <img src={outUrls[i]!} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-slate-200" />}
                    <div className="min-w-0 flex-1">
                      <input
                        type="text"
                        value={displayName}
                        onChange={(e) => setCustomNames((prev) => ({ ...prev, [i]: e.target.value }))}
                        title="Click to rename before download"
                        className="w-full truncate rounded border border-transparent px-1.5 py-0.5 text-sm font-bold text-ink-950 hover:border-slate-300 focus:border-accent focus:bg-white"
                      />
                      <span className="block px-1.5 text-xs text-slate-500">{formatSize(r.blob.size)}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {isImage && (
                        <button
                          type="button"
                          onClick={() => copyImage(r.blob, i)}
                          title="Copy image to clipboard"
                          className="btn-ghost !px-3 !py-2 text-xs"
                        >
                          {copiedIdx === i ? <><Check className="h-4 w-4 text-emerald-600" /> Copied</> : <><Copy className="h-4 w-4" /> Copy</>}
                        </button>
                      )}

                      {isPdf && outPdfUrls[i] && (
                        <button
                          type="button"
                          onClick={() => setPdfPreviewUrl(outPdfUrls[i])}
                          title="Quick preview PDF in browser"
                          className="btn-ghost !px-3 !py-2 text-xs"
                        >
                          <Eye className="h-4 w-4" /> Preview
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => downloadBlob(r.blob, displayName)}
                        className="btn-ghost !px-3.5 !py-2 text-xs"
                      >
                        <Download className="h-4 w-4" /> Download
                      </button>
                    </div>
                  </li>
                )
              })}
            </ul>

            <div className="mt-4 flex flex-wrap gap-2.5">
              {results.length > 1 && (
                <button
                  type="button"
                  onClick={() => {
                    const renamed = results.map((r, i) => ({ ...r, name: customNames[i] ?? r.name }))
                    downloadZip(renamed, `${tool.id}-results.zip`)
                  }}
                  className="btn-accent !py-2.5"
                >
                  <FolderDown className="h-4 w-4" /> Download all as ZIP
                </button>
              )}
              <button type="button" onClick={() => handleFilesChange([])} className="btn-ghost !py-2.5"><RotateCcw className="h-4 w-4" /> Start another</button>
            </div>
          </div>
        )}
      </section>

      {/* In-tab PDF Preview Modal */}
      {pdfPreviewUrl && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="PDF Preview"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setPdfPreviewUrl(null)}
        >
          <div
            className="relative flex h-[85vh] w-full max-w-4xl flex-col rounded-2xl bg-white p-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2">
              <span className="font-display font-bold text-ink-950">PDF Document Preview</span>
              <button
                type="button"
                onClick={() => setPdfPreviewUrl(null)}
                aria-label="Close"
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-ink-950"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <iframe
              src={pdfPreviewUrl}
              className="h-full w-full rounded-xl border border-slate-200"
              title="PDF Preview Frame"
            />
          </div>
        </div>
      )}

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
