import { useEffect, useState } from 'react'
import { RotateCw, Trash2, ArrowLeft, ArrowRight, Loader2, GripVertical, Eye, X, Undo2 } from 'lucide-react'
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
  const [density, setDensity] = useState<'compact' | 'standard' | 'large'>('standard')
  const [inspectIdx, setInspectIdx] = useState<number | null>(null)

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
  const invertSelection = () => {
    const next = new Set<number>()
    for (let i = 0; i < thumbs.length; i++) {
      if (!selected.has(i)) next.add(i)
    }
    setSelected(next)
  }
  const move = (pos: number, dir: -1 | 1) => setOps((o) => { const n = [...o]; const t = pos + dir; if (t < 0 || t >= n.length) return o; [n[pos], n[t]] = [n[t], n[pos]]; return n })
  const rotateAll = () => setOps((o) => o.map((op) => ({ ...op, rotation: (op.rotation + 90) % 360 })))
  const resetAll = () => setOps(() => thumbs.map((_, i) => ({ index: i, rotation: 0, deleted: false })))

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

  const gridClass = density === 'compact'
    ? 'grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2'
    : density === 'large'
      ? 'grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4'
      : 'grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-3'

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3 text-sm">
        <p className="font-semibold text-slate-600">
          {mode === 'select'
            ? `${selected.size} of ${thumbs.length} pages selected`
            : `${ops.filter((o) => !o.deleted).length} of ${thumbs.length} pages kept · Drag cards or use arrows to reorder`}
        </p>

        <div className="flex flex-wrap items-center gap-2">
          {mode === 'select' && thumbs.length > 0 && (
            <div className="flex items-center gap-2 text-xs font-bold">
              <button type="button" className="text-accent hover:underline" onClick={() => setSelected(new Set(thumbs.map((_, i) => i)))}>Select all</button>
              <span className="text-slate-300">|</span>
              <button type="button" className="text-accent hover:underline" onClick={invertSelection}>Invert</button>
              <span className="text-slate-300">|</span>
              <button type="button" className="text-accent hover:underline" onClick={() => setSelected(new Set())}>Clear</button>
            </div>
          )}

          {mode === 'organize' && thumbs.length > 0 && (
            <div className="flex items-center gap-1.5 text-xs font-bold">
              <button
                type="button"
                onClick={rotateAll}
                className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-700 hover:bg-slate-50 shadow-sm"
              >
                <RotateCw className="h-3 w-3 text-accent" /> Rotate all 90°
              </button>
              <button
                type="button"
                onClick={resetAll}
                className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-slate-700 hover:bg-slate-50 shadow-sm"
              >
                <Undo2 className="h-3 w-3 text-slate-400" /> Reset
              </button>
            </div>
          )}

          {/* Grid density buttons */}
          <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5 text-xs font-bold text-slate-600">
            <button
              type="button"
              onClick={() => setDensity('compact')}
              className={`rounded px-1.5 py-0.5 ${density === 'compact' ? 'bg-white text-ink-950 shadow-sm' : 'hover:text-ink-950'}`}
              title="Compact grid"
            >
              S
            </button>
            <button
              type="button"
              onClick={() => setDensity('standard')}
              className={`rounded px-1.5 py-0.5 ${density === 'standard' ? 'bg-white text-ink-950 shadow-sm' : 'hover:text-ink-950'}`}
              title="Standard grid"
            >
              M
            </button>
            <button
              type="button"
              onClick={() => setDensity('large')}
              className={`rounded px-1.5 py-0.5 ${density === 'large' ? 'bg-white text-ink-950 shadow-sm' : 'hover:text-ink-950'}`}
              title="Large grid"
            >
              L
            </button>
          </div>
        </div>
      </div>

      <div className={`grid ${gridClass}`}>
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
              className={`group relative overflow-hidden rounded-xl border-2 bg-white transition select-none ${
                isSel ? 'border-accent ring-4 ring-accent/15' : 'border-slate-200'
              } ${deleted ? 'opacity-40' : ''} ${
                mode === 'organize' ? 'cursor-grab active:cursor-grabbing hover:shadow-md' : ''
              } ${isDragging ? 'opacity-30 scale-95 border-dashed border-accent' : ''} ${
                isDropTarget ? 'ring-2 ring-accent border-accent scale-[1.02]' : ''
              }`}
            >
              <button
                type="button"
                disabled={mode !== 'select'}
                onClick={() => toggle(pageIdx)}
                className="block w-full text-left"
                aria-pressed={isSel}
                aria-label={`Page ${pageIdx + 1}`}
              >
                <img
                  src={thumbs[pageIdx]}
                  alt={`Page ${pageIdx + 1}`}
                  className="aspect-[3/4] w-full object-cover object-top"
                  style={mode === 'organize' && op ? { transform: `rotate(${op.rotation}deg)` } : undefined}
                />
              </button>

              {/* Inspect button overlay */}
              <button
                type="button"
                aria-label={`Inspect page ${pageIdx + 1}`}
                onClick={(e) => { e.stopPropagation(); setInspectIdx(pageIdx) }}
                className="absolute right-1.5 top-1.5 hidden rounded-md bg-white/90 p-1 text-slate-600 shadow backdrop-blur group-hover:block hover:bg-white hover:text-ink-950"
              >
                <Eye className="h-3.5 w-3.5" />
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

      {/* Inspect Page Modal */}
      {inspectIdx !== null && thumbs[inspectIdx] && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label={`Page ${inspectIdx + 1} preview`}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm"
          onClick={() => setInspectIdx(null)}
        >
          <div
            className="relative max-h-[90vh] max-w-2xl rounded-2xl bg-white p-4 shadow-2xl overflow-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between border-b border-slate-100 pb-2">
              <span className="font-display font-bold text-ink-950">Page {inspectIdx + 1} Preview</span>
              <button
                type="button"
                onClick={() => setInspectIdx(null)}
                aria-label="Close"
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-ink-950"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <img
              src={thumbs[inspectIdx]}
              alt={`Page ${inspectIdx + 1}`}
              className="max-h-[75vh] w-auto mx-auto rounded-lg object-contain ring-1 ring-slate-200"
            />
          </div>
        </div>
      )}
    </div>
  )
}
