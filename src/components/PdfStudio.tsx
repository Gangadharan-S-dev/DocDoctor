import { useEffect, useRef, useState } from 'react'
import { Eraser, Loader2, ZoomIn, ZoomOut, RotateCcw, ChevronLeft, ChevronRight, Pen, Type, Upload } from 'lucide-react'
import { renderPageImage, pdfPageCount } from '../processing/pdf'

const INK_COLORS = [
  { label: 'Charcoal', value: '#111827' },
  { label: 'Navy Blue', value: '#002D62' },
  { label: 'Audit Red', value: '#DC2626' },
]

const STROKE_WIDTHS = [
  { label: 'Fine', value: 1.5 },
  { label: 'Medium', value: 2.5 },
  { label: 'Bold', value: 4 },
]

const SCRIPT_FONTS = [
  { label: 'Casual Script', family: '"Caveat", cursive, sans-serif' },
  { label: 'Classic Handwriting', family: '"Brush Script MT", "Segoe Script", cursive' },
  { label: 'Formal Signature', family: '"Lucida Handwriting", "Segoe Print", cursive' },
]

/** Multi-mode signature pad: Draw freehand, Type with script fonts, or Upload an image. Emits a PNG data URL. */
export function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const [mode, setMode] = useState<'draw' | 'type' | 'upload'>('draw')
  const [color, setColor] = useState('#002D62')
  const [strokeWidth, setStrokeWidth] = useState(2.5)
  const [typedName, setTypedName] = useState('')
  const [fontFamily, setFontFamily] = useState(SCRIPT_FONTS[0].family)
  const [uploadedName, setUploadedName] = useState<string | null>(null)

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const dirty = useRef(false)

  // Configure draw canvas stroke
  useEffect(() => {
    if (mode !== 'draw' || !canvasRef.current) return
    const ctx = canvasRef.current.getContext('2d')
    if (ctx) {
      ctx.lineWidth = strokeWidth
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = color
    }
  }, [mode, color, strokeWidth])

  const pos = (e: React.PointerEvent) => {
    const c = canvasRef.current!
    const r = c.getBoundingClientRect()
    return {
      x: ((e.clientX - r.left) / r.width) * c.width,
      y: ((e.clientY - r.top) / r.height) * c.height,
    }
  }

  const emitDraw = () => {
    if (dirty.current && canvasRef.current) {
      onChange(canvasRef.current.toDataURL('image/png'))
    }
  }

  const clearCanvas = () => {
    if (canvasRef.current) {
      const c = canvasRef.current
      c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
      dirty.current = false
      onChange(null)
    }
  }

  // Generate typed signature when name/font/color change
  useEffect(() => {
    if (mode !== 'type') return
    if (!typedName.trim()) {
      onChange(null)
      return
    }
    const c = document.createElement('canvas')
    c.width = 600
    c.height = 180
    const ctx = c.getContext('2d')!
    ctx.clearRect(0, 0, c.width, c.height)
    ctx.fillStyle = color
    ctx.font = `italic 54px ${fontFamily}`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText(typedName.trim(), c.width / 2, c.height / 2)
    onChange(c.toDataURL('image/png'))
  }, [mode, typedName, fontFamily, color, onChange])

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadedName(file.name)
    const reader = new FileReader()
    reader.onload = () => {
      onChange(reader.result as string)
    }
    reader.readAsDataURL(file)
  }

  return (
    <div className="space-y-3">
      {/* Mode tabs */}
      <div className="flex items-center gap-1 border-b border-slate-200 pb-2">
        <button
          type="button"
          onClick={() => { setMode('draw'); onChange(null) }}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${mode === 'draw' ? 'bg-accent text-white' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          <Pen className="h-3.5 w-3.5" /> Draw
        </button>
        <button
          type="button"
          onClick={() => { setMode('type'); onChange(null) }}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${mode === 'type' ? 'bg-accent text-white' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          <Type className="h-3.5 w-3.5" /> Type
        </button>
        <button
          type="button"
          onClick={() => { setMode('upload'); onChange(null) }}
          className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition ${mode === 'upload' ? 'bg-accent text-white' : 'text-slate-600 hover:bg-slate-100'}`}
        >
          <Upload className="h-3.5 w-3.5" /> Upload Image
        </button>
      </div>

      {/* Style bar (for draw and type modes) */}
      {(mode === 'draw' || mode === 'type') && (
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-slate-500">Ink Color:</span>
            {INK_COLORS.map((c) => (
              <button
                key={c.value}
                type="button"
                onClick={() => setColor(c.value)}
                aria-label={c.label}
                title={c.label}
                className={`h-5 w-5 rounded-full ring-2 transition ${color === c.value ? 'ring-accent scale-110' : 'ring-transparent hover:scale-105'}`}
                style={{ backgroundColor: c.value }}
              />
            ))}
          </div>

          {mode === 'draw' && (
            <div className="flex items-center gap-1.5">
              <span className="font-semibold text-slate-500">Thickness:</span>
              {STROKE_WIDTHS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => setStrokeWidth(s.value)}
                  className={`rounded px-2 py-0.5 text-xs font-bold ${strokeWidth === s.value ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  {s.label}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Draw view */}
      {mode === 'draw' && (
        <div>
          <canvas
            ref={canvasRef}
            width={560}
            height={180}
            className="h-44 w-full cursor-crosshair touch-none rounded-xl border border-dashed border-slate-300 bg-white shadow-inner"
            aria-label="Draw your signature"
            onPointerDown={(e) => {
              drawing.current = true
              dirty.current = true
              const p = pos(e)
              const ctx = canvasRef.current!.getContext('2d')!
              ctx.lineWidth = strokeWidth
              ctx.strokeStyle = color
              ctx.beginPath()
              ctx.moveTo(p.x, p.y)
              ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
            }}
            onPointerMove={(e) => {
              if (!drawing.current) return
              const p = pos(e)
              const ctx = canvasRef.current!.getContext('2d')!
              ctx.lineTo(p.x, p.y)
              ctx.stroke()
            }}
            onPointerUp={() => {
              drawing.current = false
              emitDraw()
            }}
          />
          <button type="button" className="btn-ghost mt-2 !px-3 !py-1.5 text-xs" onClick={clearCanvas}>
            <Eraser className="h-3.5 w-3.5" /> Clear signature
          </button>
        </div>
      )}

      {/* Type view */}
      {mode === 'type' && (
        <div className="space-y-3">
          <input
            type="text"
            value={typedName}
            onChange={(e) => setTypedName(e.target.value)}
            placeholder="Type your signature here…"
            className="input text-base"
            maxLength={40}
          />
          <div className="flex flex-wrap gap-2">
            {SCRIPT_FONTS.map((f) => (
              <button
                key={f.label}
                type="button"
                onClick={() => setFontFamily(f.family)}
                className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition ${fontFamily === f.family ? 'border-accent bg-accent/10 text-accent ring-1 ring-accent' : 'border-slate-200 hover:bg-slate-50'}`}
              >
                {f.label}
              </button>
            ))}
          </div>
          {typedName && (
            <div className="flex h-28 items-center justify-center rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <span style={{ fontFamily, color, fontSize: '38px', fontStyle: 'italic' }}>
                {typedName}
              </span>
            </div>
          )}
        </div>
      )}

      {/* Upload view */}
      {mode === 'upload' && (
        <div>
          <label className="flex h-36 cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/70 p-4 text-center hover:border-accent hover:bg-accent-soft/40 transition">
            <Upload className="mb-2 h-6 w-6 text-slate-400" />
            <span className="text-xs font-bold text-ink-950">
              {uploadedName ? `Uploaded: ${uploadedName}` : 'Click to upload signature (PNG or JPG)'}
            </span>
            <span className="mt-1 text-[11px] text-slate-400">Transparent PNG recommended</span>
            <input type="file" accept="image/png,image/jpeg,image/webp" onChange={handleUpload} className="hidden" />
          </label>
        </div>
      )}
    </div>
  )
}

/** Renders one PDF page with page navigation; clicking sets placement coordinates (% from top-left). */
export function PagePlacement({
  file, page, x, y, onPick, onPageChange, stampPreview, stampText, textColor, textSize,
}: {
  file: File
  page: number
  x: number
  y: number
  onPick: (x: number, y: number) => void
  onPageChange?: (newPage: number) => void
  stampPreview?: string | null
  stampText?: string | null
  textColor?: string
  textSize?: number
}) {
  const [state, setState] = useState<{ file: File; page: number; img: string; done: boolean }>({ file, page, img: '', done: false })
  const [totalPages, setTotalPages] = useState<number | null>(null)
  const [zoom, setZoom] = useState(1)

  // Read total page count
  useEffect(() => {
    let alive = true
    file.arrayBuffer().then((b) => pdfPageCount(b)).then((count) => {
      if (alive) setTotalPages(count)
    }).catch(() => {})
    return () => { alive = false }
  }, [file])

  // Render current page
  useEffect(() => {
    let alive = true
    file.arrayBuffer().then((b) => renderPageImage(b, page))
      .then((url) => { if (alive) setState({ file, page, img: url, done: true }) })
      .catch(() => { if (alive) setState({ file, page, img: '', done: true }) })
    return () => { alive = false }
  }, [file, page])

  const current = state.file === file && state.page === page ? state : { file, page, img: '', done: false }
  const img = current.img
  const loading = !current.done

  const handlePrevPage = () => {
    if (page > 1 && onPageChange) onPageChange(page - 1)
  }
  const handleNextPage = () => {
    if (totalPages && page < totalPages && onPageChange) onPageChange(page + 1)
  }

  if (loading) {
    return <p className="flex items-center gap-2 py-8 text-sm font-semibold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Rendering page {page}…</p>
  }
  if (!img) {
    return <p className="py-6 text-sm font-semibold text-red-600">Could not render this page (the file may be encrypted).</p>
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-semibold text-slate-500">
        <div className="flex items-center gap-2">
          {totalPages && totalPages > 1 && onPageChange && (
            <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 shadow-sm">
              <button
                type="button"
                disabled={page <= 1}
                onClick={handlePrevPage}
                aria-label="Previous page"
                className="rounded p-0.5 hover:bg-slate-100 disabled:opacity-30"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="font-bold text-ink-950">Page {page} of {totalPages}</span>
              <button
                type="button"
                disabled={page >= totalPages}
                onClick={handleNextPage}
                aria-label="Next page"
                className="rounded p-0.5 hover:bg-slate-100 disabled:opacity-30"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          )}
          <span>Position: <strong className="text-ink-950">{x}%, {y}%</strong></span>
        </div>

        <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">
          <button type="button" onClick={() => setZoom((z) => Math.max(0.75, +(z - 0.25).toFixed(2)))} aria-label="Zoom out" className="rounded p-0.5 hover:bg-slate-200"><ZoomOut className="h-3.5 w-3.5" /></button>
          <span className="min-w-8 text-center text-[11px] font-bold text-ink-950">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((z) => Math.min(2, +(z + 0.25).toFixed(2)))} aria-label="Zoom in" className="rounded p-0.5 hover:bg-slate-200"><ZoomIn className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={() => setZoom(1)} aria-label="Reset zoom" className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-ink-950"><RotateCcw className="h-3 w-3" /></button>
        </div>
      </div>

      <div className="max-h-[520px] overflow-auto rounded-xl border border-slate-200 bg-slate-100/60 p-4">
        <div
          role="button" tabIndex={0} aria-label="Click to choose placement position"
          style={{ width: `${Math.round(zoom * 100)}%`, maxWidth: zoom === 1 ? '28rem' : 'none', margin: '0 auto' }}
          className="relative cursor-crosshair overflow-hidden rounded-xl shadow-md ring-1 ring-slate-300 transition-all select-none"
          onClick={(e) => {
            const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
            onPick(Math.round(((e.clientX - r.left) / r.width) * 100), Math.round(((e.clientY - r.top) / r.height) * 100))
          }}
        >
          <img src={img} alt={`Page ${page} preview`} className="block w-full pointer-events-none" />
          {stampPreview ? (
            <div
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded border border-dashed border-accent bg-white/70 p-1 shadow-md backdrop-blur-[1px]"
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              <img src={stampPreview} alt="Signature preview" className="max-h-16 max-w-44 object-contain" />
            </div>
          ) : stampText ? (
            <div
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded border border-dashed border-accent bg-white/80 px-2 py-0.5 font-bold shadow-md whitespace-nowrap"
              style={{ left: `${x}%`, top: `${y}%`, color: textColor || '#122036', fontSize: `${Math.max(11, Math.min(24, textSize || 14))}px` }}
            >
              {stampText}
            </div>
          ) : (
            <span className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-accent bg-white shadow-lg" style={{ left: `${x}%`, top: `${y}%` }} />
          )}
        </div>
      </div>
    </div>
  )
}
