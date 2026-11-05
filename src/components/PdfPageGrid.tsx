import { useEffect, useState } from 'react'
import { RotateCw, Trash2, ArrowLeft, ArrowRight, Loader2 } from 'lucide-react'
import { renderThumbnails, type PageOp } from '../processing/pdf'

/** Visual page picker. mode 'select': toggle pages. mode 'organize': reorder/rotate/delete. */
export default function PdfPageGrid({ file, mode, onChange }: {
  file: File
  mode: 'select' | 'organize'
  onChange: (value: number[] | PageOp[]) => void
}) {
  const [thumbs, setThumbs] = useState<string[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [ops, setOps] = useState<PageOp[]>([])

  useEffect(() => {
    let alive = true
    setLoading(true); setError(''); setSelected(new Set()); setOps([])
    file.arrayBuffer()
      .then((b) => renderThumbnails(b))
      .then((urls) => { if (!alive) return; setThumbs(urls); setOps(urls.map((_, i) => ({ index: i, rotation: 0, deleted: false }))); setLoading(false) })
      .catch(() => { if (alive) { setError('Could not render this PDF (it may be encrypted or damaged).'); setLoading(false) } })
    return () => { alive = false }
  }, [file])

  useEffect(() => { if (mode === 'select') onChange([...selected].sort((a, b) => a - b)) }, [selected, mode]) // eslint-disable-line
  useEffect(() => { if (mode === 'organize') onChange(ops) }, [ops, mode]) // eslint-disable-line

  if (loading) return <p className="flex items-center gap-2 py-8 text-sm font-semibold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Rendering page thumbnails…</p>
  if (error) return <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 ring-1 ring-red-200">{error}</p>

  const toggle = (i: number) => setSelected((s) => { const n = new Set(s); if (n.has(i)) n.delete(i); else n.add(i); return n })
  const move = (pos: number, dir: -1 | 1) => setOps((o) => { const n = [...o]; const t = pos + dir; if (t < 0 || t >= n.length) return o; [n[pos], n[t]] = [n[t], n[pos]]; return n })

  return (
    <div>
      <p className="mb-3 text-sm font-semibold text-slate-600">
        {mode === 'select' ? `${selected.size} of ${thumbs.length} pages selected` : `${ops.filter((o) => !o.deleted).length} of ${thumbs.length} pages kept`}
        {mode === 'select' && thumbs.length > 0 && (
          <span className="ml-3 space-x-3">
            <button type="button" className="font-bold text-accent hover:underline" onClick={() => setSelected(new Set(thumbs.map((_, i) => i)))}>Select all</button>
            <button type="button" className="font-bold text-accent hover:underline" onClick={() => setSelected(new Set())}>Clear</button>
          </span>
        )}
      </p>
      <div className="grid grid-cols-3 gap-3 sm:grid-cols-4 md:grid-cols-5">
        {(mode === 'select' ? thumbs.map((_, i) => i) : ops.map((o) => o.index)).map((pageIdx, pos) => {
          const op = ops[pos]
          const isSel = mode === 'select' ? selected.has(pageIdx) : false
          const deleted = mode === 'organize' && op?.deleted
          return (
            <figure key={`${pageIdx}-${pos}`} className={`overflow-hidden rounded-xl border-2 bg-white transition ${isSel ? 'border-accent ring-4 ring-accent/15' : 'border-slate-200'} ${deleted ? 'opacity-40' : ''}`}>
              <button type="button" disabled={mode !== 'select'} onClick={() => toggle(pageIdx)} className="block w-full" aria-pressed={isSel} aria-label={`Page ${pageIdx + 1}`}>
                <img src={thumbs[pageIdx]} alt={`Page ${pageIdx + 1}`} className="aspect-[3/4] w-full object-cover object-top" style={mode === 'organize' && op ? { transform: `rotate(${op.rotation}deg)` } : undefined} />
              </button>
              <figcaption className="flex items-center justify-between px-2 py-1.5 text-[11px] font-bold text-slate-500">
                <span>Page {pageIdx + 1}</span>
                {mode === 'organize' && op && (
                  <span className="flex gap-0.5">
                    <button type="button" aria-label="Move left" className="rounded p-1 hover:bg-slate-100" onClick={() => move(pos, -1)}><ArrowLeft className="h-3.5 w-3.5" /></button>
                    <button type="button" aria-label="Move right" className="rounded p-1 hover:bg-slate-100" onClick={() => move(pos, 1)}><ArrowRight className="h-3.5 w-3.5" /></button>
                    <button type="button" aria-label="Rotate page" className="rounded p-1 hover:bg-slate-100" onClick={() => setOps((o) => o.map((x, i) => i === pos ? { ...x, rotation: (x.rotation + 90) % 360 } : x))}><RotateCw className="h-3.5 w-3.5" /></button>
                    <button type="button" aria-label={deleted ? 'Restore page' : 'Delete page'} className="rounded p-1 hover:bg-red-50 hover:text-red-600" onClick={() => setOps((o) => o.map((x, i) => i === pos ? { ...x, deleted: !x.deleted } : x))}><Trash2 className="h-3.5 w-3.5" /></button>
                  </span>
                )}
              </figcaption>
            </figure>
          )
        })}
      </div>
    </div>
  )
}
