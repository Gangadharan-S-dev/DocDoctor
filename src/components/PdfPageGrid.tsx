import { useEffect, useState } from 'react'
import { RotateCw, Trash2, ArrowLeft, ArrowRight, Loader2, GripVertical } from 'lucide-react'
import { renderThumbnails, type PageOp } from '../processing/pdf'

/** Visual page picker. mode 'select': toggle pages. mode 'organize': reorder/rotate/delete with drag-and-drop. */
export default function PdfPageGrid({ file, mode, onChange }: {
  file: File
  mode: 'select' | 'organize'
  onChange: (value: number[] | PageOp[]) => void
}) {
  const [loaded, setLoaded] = useState<{ file: File; thumbs: string[]; error: string }>({ file, thumbs: [], error: '' })
  const [selState, setSelState] = useState<{ file: File; sel: Set<number> }>({ file, sel: new Set() })
  const [opsState, setOpsState] = useState<{ file: File; ops: PageOp[] }>({ file, ops: [] })
  const [dragIndex, setDragIndex] = useState<number | null>(null)
  const [dropTarget, setDropTarget] = useState<number | null>(null)

  useEffect(() => {
    let alive = true
    file.arrayBuffer()
      .then((b) => renderThumbnails(b))
      .then((urls) => { if (alive) setLoaded({ file, thumbs: urls, error: '' }) })
      .catch(() => { if (alive) setLoaded({ file, thumbs: [], error: 'Could not render this PDF (it may be encrypted or damaged).' }) })
    return () => { alive = false }
  }, [file])

  const current = loaded.file === file ? loaded : { file, thumbs: [], error: '' }
  const thumbs = current.thumbs
  const error = current.error
  const loading = loaded.file !== file || (thumbs.length === 0 && !error)
  const selected = selState.file === file ? selState.sel : new Set<number>()
  const setSelected = (next: Set<number>) => setSelState({ file, sel: next })
  const defaultOps = thumbs.map((_, i) => ({ index: i, rotation: 0, deleted: false }))
  const ops = opsState.file === file && opsState.ops.length === thumbs.length ? opsState.ops : defaultOps
  const setOps = (fn: (o: PageOp[]) => PageOp[]) => setOpsState({ file, ops: fn(ops) })

  useEffect(() => { if (mode === 'select') onChange([...selected].sort((a, b) => a - b)) }, [selected, mode]) // eslint-disable-line
  useEffect(() => { if (mode === 'organize') onChange(ops) }, [ops, mode]) // eslint-disable-line

  if (loading) return <p className="flex items-center gap-2 py-8 text-sm font-semibold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> Rendering page thumbnails…</p>
  if (error) return <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 ring-1 ring-red-200">{error}</p>

  const toggle = (i: number) => { const n = new Set(selected); if (n.has(i)) n.delete(i); else n.add(i); setSelected(n) }
  const move = (pos: number, dir: -1 | 1) => setOps((o) => { const n = [...o]; const t = pos + dir; if (t < 0 || t >= n.length) return o; [n[pos], n[t]] = [n[t], n[pos]]; return n })

  const handleDragStart = (e: React.DragEvent, idx: number) => {
    setDragIndex(idx)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', String(idx))
  }
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dropTarget !== idx) setDropTarget(idx)
  }
  const handleDrop = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault()
    if (dragIndex === null || dragIndex === targetIdx) {
      setDragIndex(null)
      setDropTarget(null)
      return
    }
    setOps((o) => {
      const next = [...o]
      const [item] = next.splice(dragIndex, 1)
      next.splice(targetIdx, 0, item)
      return next
    })
    setDragIndex(null)
    setDropTarget(null)
  }
  const handleDragEnd = () => {
    setDragIndex(null)
    setDropTarget(null)
  }

  return (
    <div>
      <p className="mb-3 text-sm font-semibold text-slate-600">
        {mode === 'select'
          ? `${selected.size} of ${thumbs.length} pages selected`
          : `${ops.filter((o) => !o.deleted).length} of ${thumbs.length} pages kept · Drag cards or use arrows to reorder`}
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
          const isDragging = mode === 'organize' && dragIndex === pos
          const isDropTarget = mode === 'organize' && dropTarget === pos && dragIndex !== pos

          return (
            <figure
              key={`${pageIdx}-${pos}`}
              draggable={mode === 'organize'}
              onDragStart={(e) => mode === 'organize' && handleDragStart(e, pos)}
              onDragOver={(e) => mode === 'organize' && handleDragOver(e, pos)}
              onDragLeave={() => setDropTarget(null)}
              onDrop={(e) => mode === 'organize' && handleDrop(e, pos)}
              onDragEnd={handleDragEnd}
              className={`overflow-hidden rounded-xl border-2 bg-white transition select-none ${
                isSel ? 'border-accent ring-4 ring-accent/15' : 'border-slate-200'
              } ${deleted ? 'opacity-40' : ''} ${
                mode === 'organize' ? 'cursor-grab active:cursor-grabbing hover:shadow-md' : ''
              } ${isDragging ? 'opacity-30 scale-95 border-dashed border-accent' : ''} ${
                isDropTarget ? 'ring-2 ring-accent border-accent scale-[1.02]' : ''
              }`}
            >
              <button type="button" disabled={mode !== 'select'} onClick={() => toggle(pageIdx)} className="block w-full" aria-pressed={isSel} aria-label={`Page ${pageIdx + 1}`}>
                <img src={thumbs[pageIdx]} alt={`Page ${pageIdx + 1}`} className="aspect-[3/4] w-full object-cover object-top" style={mode === 'organize' && op ? { transform: `rotate(${op.rotation}deg)` } : undefined} />
              </button>
              <figcaption className="flex items-center justify-between px-2 py-1.5 text-[11px] font-bold text-slate-500">
                <span className="flex items-center gap-1">
                  {mode === 'organize' && <GripVertical className="h-3 w-3 text-slate-400" />}
                  Page {pageIdx + 1}
                </span>
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
