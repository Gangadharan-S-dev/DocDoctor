import { useEffect, useState } from 'react'
import { Loader2, ArrowUp, ArrowDown, GripVertical } from 'lucide-react'
import { listSlides, sheetNames, listDocxBlocks, listDocxPages, type SlideInfo, type DocxBlock, type DocxPageInfo } from '../processing/office'

function useLoader<T>(load: () => Promise<T>, dep: File) {
  const [result, setResult] = useState<{ dep: File; data: T | null; error: string }>({ dep, data: null, error: '' })
  useEffect(() => {
    let alive = true
    load()
      .then((d) => { if (alive) setResult({ dep, data: d, error: '' }) })
      .catch(() => { if (alive) setResult({ dep, data: null, error: 'Could not read this file — it may be damaged or in an unsupported variant.' }) })
    return () => { alive = false }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dep])
  // While a new file is loading, the previous file's data must not show.
  return result.dep === dep ? result : { dep, data: null, error: '' }
}

/** Selection state keyed by file: switching files resets the selection without an effect. */
function useFileSelection<T>(file: File) {
  const [state, setState] = useState<{ file: File; sel: Set<T> }>({ file, sel: new Set() })
  const sel = state.file === file ? state.sel : new Set<T>()
  const toggle = (v: T) => setState((s) => {
    const base = s.file === file ? s.sel : new Set<T>()
    const next = new Set(base)
    if (next.has(v)) next.delete(v); else next.add(v)
    return { file, sel: next }
  })
  const setAll = (next: Set<T>) => setState({ file, sel: next })
  return { sel, toggle, setAll }
}

const Err = ({ msg }: { msg: string }) => <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 ring-1 ring-red-200">{msg}</p>
const Loading = ({ label }: { label: string }) => <p className="flex items-center gap-2 py-6 text-sm font-semibold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> {label}</p>

/** Checkbox slide picker for remove/extract. Emits selected part names. */
export function SlidePicker({ file, onChange }: { file: File; onChange: (parts: string[]) => void }) {
  const { data: slides, error } = useLoader<SlideInfo[]>(() => listSlides(file), file)
  const { sel, toggle, setAll } = useFileSelection<string>(file)
  useEffect(() => { onChange([...sel]) }, [sel]) // eslint-disable-line
  if (error) return <Err msg={error} />
  if (!slides) return <Loading label="Reading slides…" />
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
        <span className="text-sm font-semibold text-slate-600">{sel.size} of {slides.length} slides selected</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setAll(new Set(slides.map((s) => s.part)))} className="text-accent hover:underline">Select all</button>
          <span className="text-slate-300">|</span>
          <button type="button" onClick={() => setAll(new Set(slides.map((s) => s.part).filter((p) => !sel.has(p))))} className="text-accent hover:underline">Invert</button>
          <span className="text-slate-300">|</span>
          <button type="button" onClick={() => setAll(new Set())} className="text-accent hover:underline">Clear</button>
        </div>
      </div>
      <ul className="grid gap-2 sm:grid-cols-2">
        {slides.map((s, i) => (
          <li key={s.part}>
            <label className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${sel.has(s.part) ? 'border-accent bg-accent-soft/60 ring-2 ring-accent/20' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
              <input type="checkbox" checked={sel.has(s.part)} onChange={() => toggle(s.part)} className="h-4 w-4 shrink-0 accent-[#1D6FF2]" />
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-orange-50 text-xs font-extrabold text-orange-600">{i + 1}</span>
              <span className="min-w-0 truncate text-sm font-bold text-ink-950" title={s.title}>{s.title}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Ordered slide list with drag-and-drop and move buttons for reorder. Emits parts in order. */
export function SlideReorder({ file, onChange }: { file: File; onChange: (parts: string[]) => void }) {
  const { data: slides, error } = useLoader<SlideInfo[]>(() => listSlides(file), file)
  const [moved, setMoved] = useState<{ src: SlideInfo[]; order: SlideInfo[] } | null>(null)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dropIdx, setDropIdx] = useState<number | null>(null)
  const order = moved && moved.src === slides ? moved.order : (slides ?? [])
  useEffect(() => { onChange(order.map((s) => s.part)) }, [order]) // eslint-disable-line
  if (error) return <Err msg={error} />
  if (!slides) return <Loading label="Reading slides…" />
  const move = (i: number, d: -1 | 1) => { const n = [...order]; const t = i + d; if (t < 0 || t >= n.length) return; [n[i], n[t]] = [n[t], n[i]]; setMoved({ src: slides, order: n }) }

  const handleDrop = (target: number) => {
    if (dragIdx === null || dragIdx === target) return
    const next = [...order]
    const [item] = next.splice(dragIdx, 1)
    next.splice(target, 0, item)
    setMoved({ src: slides, order: next })
    setDragIdx(null)
    setDropIdx(null)
  }

  return (
    <ol className="space-y-2">
      {order.map((s, i) => (
        <li
          key={s.part}
          draggable
          onDragStart={() => setDragIdx(i)}
          onDragOver={(e) => { e.preventDefault(); if (dropIdx !== i) setDropIdx(i) }}
          onDragLeave={() => setDropIdx(null)}
          onDrop={(e) => { e.preventDefault(); handleDrop(i) }}
          onDragEnd={() => { setDragIdx(null); setDropIdx(null) }}
          className={`flex items-center gap-3 rounded-xl border bg-white px-4 py-3 transition select-none ${
            dragIdx === i ? 'opacity-30 bg-slate-100' : ''
          } ${dropIdx === i && dragIdx !== i ? 'border-accent ring-2 ring-accent/20 bg-accent/5' : 'border-slate-200 hover:border-slate-300'}`}
        >
          <GripVertical className="h-4 w-4 cursor-grab active:cursor-grabbing text-slate-400" />
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-950 text-xs font-extrabold text-white">{i + 1}</span>
          <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink-950" title={s.title}>{s.title}</span>
          <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
          <button type="button" aria-label="Move down" disabled={i === order.length - 1} onClick={() => move(i, 1)} className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
        </li>
      ))}
    </ol>
  )
}

/** Checkbox picker over a DOCX's pages and content blocks. Emits block indexes to remove. */
export function DocxBlockPicker({ file, onChange }: { file: File; onChange: (indexes: number[]) => void }) {
  const { data: pages, error: pageErr } = useLoader<DocxPageInfo[]>(() => listDocxPages(file), file)
  const { data: blocks, error: blockErr } = useLoader<DocxBlock[]>(() => listDocxBlocks(file), file)
  const [viewMode, setViewMode] = useState<'pages' | 'blocks'>('pages')
  const [selPages, setSelPages] = useState<Set<number>>(new Set())
  const [selBlocks, setSelBlocks] = useState<Set<number>>(new Set())
  const [rangeInput, setRangeInput] = useState('')

  useEffect(() => {
    if (viewMode === 'pages') {
      if (!pages) return
      const doomedBlocks = new Set<number>()
      for (const p of pages) {
        if (selPages.has(p.pageNumber)) {
          p.blockIndices.forEach((idx) => doomedBlocks.add(idx))
        }
      }
      onChange([...doomedBlocks].sort((a, b) => a - b))
    } else {
      onChange([...selBlocks].sort((a, b) => a - b))
    }
  }, [viewMode, selPages, selBlocks, pages, onChange])

  const togglePage = (pageNum: number) => {
    setSelPages((prev) => {
      const next = new Set(prev)
      if (next.has(pageNum)) next.delete(pageNum); else next.add(pageNum)
      return next
    })
  }

  const toggleBlock = (blockIdx: number) => {
    setSelBlocks((prev) => {
      const next = new Set(prev)
      if (next.has(blockIdx)) next.delete(blockIdx); else next.add(blockIdx)
      return next
    })
  }

  const applyRange = (input: string) => {
    setRangeInput(input)
    if (!pages) return
    const next = new Set<number>()
    const parts = input.split(',').map((s) => s.trim()).filter(Boolean)
    for (const p of parts) {
      const m = p.match(/^(\d+)\s*-\s*(\d+)$/)
      if (m) {
        let a = parseInt(m[1]), b = parseInt(m[2])
        if (a > b) [a, b] = [b, a]
        for (let i = a; i <= b; i++) if (i >= 1 && i <= pages.length) next.add(i)
      } else if (/^\d+$/.test(p)) {
        const num = parseInt(p)
        if (num >= 1 && num <= pages.length) next.add(num)
      }
    }
    setSelPages(next)
  }

  const error = pageErr || blockErr
  if (error) return <Err msg={error} />
  if (!pages || !blocks) return <Loading label="Analyzing document pages and content…" />

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setViewMode('pages')}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              viewMode === 'pages' ? 'bg-accent text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Pages view ({pages.length} page{pages.length === 1 ? '' : 's'})
          </button>
          <button
            type="button"
            onClick={() => setViewMode('blocks')}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold transition ${
              viewMode === 'blocks' ? 'bg-accent text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Sections view ({blocks.length} blocks)
          </button>
        </div>
        <div className="flex items-center gap-2 text-xs">
          {viewMode === 'pages' ? (
            <>
              <button type="button" onClick={() => setSelPages(new Set(pages.map((p) => p.pageNumber)))} className="font-bold text-accent hover:underline">Select all</button>
              <span className="text-slate-300">|</span>
              <button type="button" onClick={() => { setSelPages(new Set()); setRangeInput('') }} className="font-bold text-accent hover:underline">Clear</button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setSelBlocks(new Set(blocks.map((b) => b.index)))} className="font-bold text-accent hover:underline">Select all</button>
              <span className="text-slate-300">|</span>
              <button type="button" onClick={() => setSelBlocks(new Set())} className="font-bold text-accent hover:underline">Clear</button>
            </>
          )}
        </div>
      </div>

      {viewMode === 'pages' && (
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex flex-1 items-center gap-2">
              <span className="text-xs font-bold text-slate-600 shrink-0">Enter page numbers to remove:</span>
              <input
                type="text"
                value={rangeInput}
                onChange={(e) => applyRange(e.target.value)}
                placeholder="e.g. 2, 4 or 2-3"
                className="input !py-1.5 text-xs font-mono max-w-xs"
              />
            </label>
            <span className="text-xs font-semibold text-slate-500">
              {selPages.size} of {pages.length} pages selected for removal
            </span>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {pages.map((p) => {
              const isSelected = selPages.has(p.pageNumber)
              return (
                <label
                  key={p.pageNumber}
                  className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition ${
                    isSelected ? 'border-red-300 bg-red-50/70 ring-2 ring-red-100' : 'border-slate-200 bg-white hover:border-slate-300 shadow-sm'
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={isSelected}
                    onChange={() => togglePage(p.pageNumber)}
                    className="mt-0.5 h-4 w-4 shrink-0 accent-[#E5484D]"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-extrabold text-ink-950">Page {p.pageNumber}</span>
                      <span className="flex items-center gap-1.5">
                        <span className="rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-600">{p.wordCount} words</span>
                        {p.hasExplicitBreak && (
                          <span className="rounded bg-blue-50 px-1.5 py-0.5 text-[10px] font-bold text-blue-600">Break</span>
                        )}
                      </span>
                    </div>
                    <p className="mt-1 line-clamp-2 text-xs text-slate-600" title={p.label}>
                      {p.label}
                    </p>
                  </div>
                </label>
              )
            })}
          </div>
        </div>
      )}

      {viewMode === 'blocks' && (
        <div>
          <p className="mb-2 text-xs font-semibold text-slate-500">{selBlocks.size} of {blocks.length} content blocks selected</p>
          <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
            {blocks.map((b) => (
              <li key={b.index}>
                <label className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2 text-xs transition ${selBlocks.has(b.index) ? 'border-red-300 bg-red-50/60 ring-2 ring-red-100' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
                  <input type="checkbox" checked={selBlocks.has(b.index)} onChange={() => toggleBlock(b.index)} className="h-4 w-4 shrink-0 accent-[#E5484D]" />
                  <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-extrabold uppercase ${b.kind === 'heading' ? 'bg-blue-50 text-blue-700' : b.kind === 'table' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{b.kind}</span>
                  <span className="min-w-0 truncate font-semibold text-ink-950" title={b.label}>{b.label}</span>
                </label>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

export const DocxPagePicker = DocxBlockPicker

/** Checkbox worksheet picker. Emits selected sheet names. */
export function SheetPicker({ file, onChange }: { file: File; onChange: (names: string[]) => void }) {
  const { data: names, error } = useLoader<string[]>(() => sheetNames(file), file)
  const { sel, toggle, setAll } = useFileSelection<string>(file)
  useEffect(() => { onChange([...sel]) }, [sel]) // eslint-disable-line
  if (error) return <Err msg={error} />
  if (!names) return <Loading label="Reading worksheets…" />
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 text-xs font-bold">
        <span className="text-sm font-semibold text-slate-600">{sel.size} of {names.length} worksheets selected</span>
        <div className="flex items-center gap-2">
          <button type="button" onClick={() => setAll(new Set(names))} className="text-accent hover:underline">Select all</button>
          <span className="text-slate-300">|</span>
          <button type="button" onClick={() => setAll(new Set())} className="text-accent hover:underline">Clear</button>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {names.map((n, i) => (
          <label key={n} className={`flex cursor-pointer items-center gap-2 rounded-xl border px-3.5 py-2 text-xs font-bold transition ${sel.has(n) ? 'border-accent bg-accent-soft text-accent-dark ring-2 ring-accent/20' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
            <input type="checkbox" checked={sel.has(n)} onChange={() => toggle(n)} className="h-4 w-4 accent-[#1D6FF2]" />
            <span className="text-slate-400 font-mono text-[10px]">#{i + 1}</span> {n}
          </label>
        ))}
      </div>
    </div>
  )
}
