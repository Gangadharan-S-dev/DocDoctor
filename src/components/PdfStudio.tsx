import { useEffect, useRef, useState } from 'react'
import { Eraser, Loader2, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react'
import { renderPageImage } from '../processing/pdf'

/** Freehand signature pad. Emits a PNG data URL whenever the drawing changes. */
export function SignaturePad({ onChange }: { onChange: (dataUrl: string | null) => void }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const drawing = useRef(false)
  const dirty = useRef(false)

  useEffect(() => {
    const c = ref.current!
    const ctx = c.getContext('2d')!
    ctx.lineWidth = 2.4; ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.strokeStyle = '#122036'
  }, [])

  const pos = (e: React.PointerEvent) => {
    const r = ref.current!.getBoundingClientRect()
    return { x: ((e.clientX - r.left) / r.width) * ref.current!.width, y: ((e.clientY - r.top) / r.height) * ref.current!.height }
  }
  const emit = () => { if (dirty.current) onChange(ref.current!.toDataURL('image/png')) }

  return (
    <div>
      <canvas
        ref={ref} width={560} height={180}
        className="h-44 w-full cursor-crosshair touch-none rounded-xl border border-dashed border-slate-300 bg-white"
        aria-label="Draw your signature"
        onPointerDown={(e) => { drawing.current = true; dirty.current = true; const p = pos(e); const ctx = ref.current!.getContext('2d')!; ctx.beginPath(); ctx.moveTo(p.x, p.y); (e.target as HTMLElement).setPointerCapture(e.pointerId) }}
        onPointerMove={(e) => { if (!drawing.current) return; const p = pos(e); const ctx = ref.current!.getContext('2d')!; ctx.lineTo(p.x, p.y); ctx.stroke() }}
        onPointerUp={() => { drawing.current = false; emit() }}
      />
      <button type="button" className="btn-ghost mt-2.5 !px-3.5 !py-2 text-xs" onClick={() => {
        const c = ref.current!; c.getContext('2d')!.clearRect(0, 0, c.width, c.height); dirty.current = false; onChange(null)
      }}><Eraser className="h-4 w-4" /> Clear signature</button>
    </div>
  )
}

/** Renders one PDF page; clicking sets placement coordinates (% from top-left). */
export function PagePlacement({
  file, page, x, y, onPick, stampPreview, stampText, textColor, textSize,
}: {
  file: File
  page: number
  x: number
  y: number
  onPick: (x: number, y: number) => void
  stampPreview?: string | null
  stampText?: string | null
  textColor?: string
  textSize?: number
}) {
  const [state, setState] = useState<{ file: File; page: number; img: string; done: boolean }>({ file, page, img: '', done: false })
  const [zoom, setZoom] = useState(1)

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
  if (loading) return <p className="flex items-center gap-2 py-8 text-sm font-semibold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Rendering page {page}…</p>
  if (!img) return <p className="py-6 text-sm font-semibold text-red-600">Could not render this page (the file may be encrypted).</p>

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
        <span>Click on the page to position ({x}%, {y}%)</span>
        <div className="flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-2 py-1">
          <button type="button" onClick={() => setZoom((z) => Math.max(0.75, +(z - 0.25).toFixed(2)))} aria-label="Zoom out" className="rounded p-0.5 hover:bg-slate-200"><ZoomOut className="h-3.5 w-3.5" /></button>
          <span className="min-w-8 text-center text-[11px] font-bold text-ink-950">{Math.round(zoom * 100)}%</span>
          <button type="button" onClick={() => setZoom((z) => Math.min(2, +(z + 0.25).toFixed(2)))} aria-label="Zoom in" className="rounded p-0.5 hover:bg-slate-200"><ZoomIn className="h-3.5 w-3.5" /></button>
          <button type="button" onClick={() => setZoom(1)} aria-label="Reset zoom" className="rounded p-0.5 text-slate-400 hover:bg-slate-200 hover:text-ink-950"><RotateCcw className="h-3 w-3" /></button>
        </div>
      </div>
      <div className="max-h-[500px] overflow-auto rounded-xl border border-slate-200 bg-slate-100/60 p-4">
        <div
          role="button" tabIndex={0} aria-label="Click to choose placement position"
          style={{ width: `${Math.round(zoom * 100)}%`, maxWidth: zoom === 1 ? '28rem' : 'none', margin: '0 auto' }}
          className="relative cursor-crosshair overflow-hidden rounded-xl shadow-md ring-1 ring-slate-300 transition-all"
          onClick={(e) => {
            const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
            onPick(Math.round(((e.clientX - r.left) / r.width) * 100), Math.round(((e.clientY - r.top) / r.height) * 100))
          }}
        >
          <img src={img} alt={`Page ${page} preview`} className="block w-full" />
          {stampPreview ? (
            <div
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded border border-dashed border-accent bg-white/70 p-1 shadow-md backdrop-blur-[1px]"
              style={{ left: `${x}%`, top: `${y}%` }}
            >
              <img src={stampPreview} alt="Signature preview" className="max-h-16 max-w-40 object-contain" />
            </div>
          ) : stampText ? (
            <div
              className="pointer-events-none absolute -translate-x-1/2 -translate-y-1/2 rounded border border-dashed border-accent bg-white/80 px-2 py-0.5 font-bold shadow-md"
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
