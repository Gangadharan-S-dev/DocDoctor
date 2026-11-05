import { useEffect, useRef, useState } from 'react'
import { Eraser, Loader2 } from 'lucide-react'
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
export function PagePlacement({ file, page, x, y, onPick }: {
  file: File; page: number; x: number; y: number; onPick: (x: number, y: number) => void
}) {
  const [img, setImg] = useState('')
  const [loading, setLoading] = useState(true)
  useEffect(() => {
    let alive = true
    setLoading(true)
    file.arrayBuffer().then((b) => renderPageImage(b, page)).then((url) => { if (alive) { setImg(url); setLoading(false) } }).catch(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [file, page])
  if (loading) return <p className="flex items-center gap-2 py-8 text-sm font-semibold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Rendering page {page}…</p>
  if (!img) return <p className="py-6 text-sm font-semibold text-red-600">Could not render this page (the file may be encrypted).</p>
  return (
    <div
      role="button" tabIndex={0} aria-label="Click to choose placement position"
      className="relative mx-auto w-full max-w-md cursor-crosshair overflow-hidden rounded-xl ring-1 ring-slate-200"
      onClick={(e) => {
        const r = (e.currentTarget as HTMLDivElement).getBoundingClientRect()
        onPick(Math.round(((e.clientX - r.left) / r.width) * 100), Math.round(((e.clientY - r.top) / r.height) * 100))
      }}
    >
      <img src={img} alt={`Page ${page} preview`} className="block w-full" />
      <span className="pointer-events-none absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-[3px] border-accent bg-white shadow" style={{ left: `${x}%`, top: `${y}%` }} />
    </div>
  )
}
