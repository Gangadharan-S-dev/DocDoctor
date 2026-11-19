import { useEffect, useState } from 'react'
import {
  Loader2, ArrowUp, ArrowDown, GripVertical, Eye, X, Scissors, Trash2,
  AlignLeft, AlignCenter, AlignRight, Bold, Italic, Table2, FileText, Image as ImageIcon, CheckCircle2,
} from 'lucide-react'
import {
  listSlides, sheetNames, listDocxBlocks, listDocxPages, listEditableDocxNodes, previewSplitWord,
  type SlideInfo, type DocxBlock, type DocxPageInfo, type EditableDocxNode, type SplitWordOpts, type SplitWordPartPreview,
} from '../processing/office'

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
      <ul className="grid gap-2.5 sm:grid-cols-2">
        {slides.map((s, i) => (
          <li key={s.part}>
            <label className={`flex cursor-pointer items-start gap-3 rounded-xl border p-3.5 transition ${sel.has(s.part) ? 'border-accent bg-accent-soft/60 ring-2 ring-accent/20' : 'border-slate-200 bg-white hover:border-slate-300 shadow-sm'}`}>
              <input type="checkbox" checked={sel.has(s.part)} onChange={() => toggle(s.part)} className="mt-1 h-4 w-4 shrink-0 accent-[#1D6FF2]" />
              <div className="flex h-12 w-16 shrink-0 flex-col justify-between overflow-hidden rounded-lg border border-orange-200 bg-gradient-to-br from-orange-50 to-white p-1.5 shadow-inner">
                <span className="h-1 w-full rounded-full bg-orange-400" />
                <span className="text-[10px] font-extrabold text-orange-700">#{i + 1}</span>
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-bold text-ink-950" title={s.title}>{s.title}</span>
                  <div className="flex shrink-0 items-center gap-1">
                    {(s.imageCount ?? 0) > 0 && (
                      <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold text-teal-700 ring-1 ring-teal-200/60">
                        {s.imageCount} img
                      </span>
                    )}
                    {s.notesPreview && (
                      <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700" title={s.notesPreview}>
                        Notes
                      </span>
                    )}
                  </div>
                </div>
                {s.snippet && (
                  <p className="mt-0.5 line-clamp-1 text-xs text-slate-500" title={s.snippet}>{s.snippet}</p>
                )}
              </div>
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
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="truncate text-sm font-bold text-ink-950" title={s.title}>{s.title}</span>
              {(s.imageCount ?? 0) > 0 && (
                <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold text-teal-700">{s.imageCount} img</span>
              )}
              {s.notesPreview && (
                <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] font-bold text-amber-700" title={s.notesPreview}>Notes</span>
              )}
            </div>
            {s.snippet && <p className="truncate text-xs text-slate-500">{s.snippet}</p>}
          </div>
          <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
          <button type="button" aria-label="Move down" disabled={i === order.length - 1} onClick={() => move(i, 1)} className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
        </li>
      ))}
    </ol>
  )
}

/** Visual Mini-Page & Section Studio over a DOCX's pages and content blocks. */
export function DocxBlockPicker({
  file,
  onChange,
  actionMode = 'remove',
  onActionModeChange,
}: {
  file: File
  onChange: (indexes: number[]) => void
  actionMode?: 'remove' | 'keep'
  onActionModeChange?: (mode: 'remove' | 'keep') => void
}) {
  const { data: pages, error: pageErr } = useLoader<DocxPageInfo[]>(() => listDocxPages(file), file)
  const { data: blocks, error: blockErr } = useLoader<DocxBlock[]>(() => listDocxBlocks(file), file)
  const [viewMode, setViewMode] = useState<'pages' | 'blocks'>('pages')
  const [selPages, setSelPages] = useState<Set<number>>(new Set())
  const [selBlocks, setSelBlocks] = useState<Set<number>>(new Set())
  const [rangeInput, setRangeInput] = useState('')
  const [inspectPage, setInspectPage] = useState<DocxPageInfo | null>(null)

  useEffect(() => {
    if (viewMode === 'pages') {
      if (!pages) return
      const chosenBlocks = new Set<number>()
      for (const p of pages) {
        if (selPages.has(p.pageNumber)) {
          p.blockIndices.forEach((idx) => chosenBlocks.add(idx))
        }
      }
      onChange([...chosenBlocks].sort((a, b) => a - b))
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

  const blankPageNums = pages.filter((p) => p.isBlank).map((p) => p.pageNumber)
  const isKeep = actionMode === 'keep'

  return (
    <div className="space-y-4">
      {/* Top Toolbar: View Switcher + Remove vs Keep Mode + Quick Selection */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-2.5">
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm">
            <button
              type="button"
              onClick={() => setViewMode('pages')}
              className={`rounded-lg px-3 py-1.5 text-xs font-extrabold transition ${
                viewMode === 'pages' ? 'bg-accent text-white shadow-sm' : 'text-slate-600 hover:text-ink-950'
              }`}
            >
              Visual Pages ({pages.length})
            </button>
            <button
              type="button"
              onClick={() => setViewMode('blocks')}
              className={`rounded-lg px-3 py-1.5 text-xs font-extrabold transition ${
                viewMode === 'blocks' ? 'bg-accent text-white shadow-sm' : 'text-slate-600 hover:text-ink-950'
              }`}
            >
              Blocks &amp; Tables ({blocks.length})
            </button>
          </div>

          {onActionModeChange && (
            <div className="flex rounded-xl border border-slate-200 bg-white p-0.5 shadow-sm">
              <button
                type="button"
                onClick={() => onActionModeChange('remove')}
                className={`rounded-lg px-3 py-1.5 text-xs font-extrabold transition ${
                  !isKeep ? 'bg-red-600 text-white shadow-sm' : 'text-slate-600 hover:text-ink-950'
                }`}
              >
                Delete Selected
              </button>
              <button
                type="button"
                onClick={() => onActionModeChange('keep')}
                className={`rounded-lg px-3 py-1.5 text-xs font-extrabold transition ${
                  isKeep ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:text-ink-950'
                }`}
              >
                Keep Only Selected (Extract)
              </button>
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2 text-xs">
          {viewMode === 'pages' ? (
            <>
              {blankPageNums.length > 0 && (
                <>
                  <button
                    type="button"
                    onClick={() => setSelPages(new Set(blankPageNums))}
                    className="rounded-lg border border-amber-300 bg-amber-50 px-2.5 py-1 font-extrabold text-amber-800 hover:bg-amber-100"
                  >
                    Select {blankPageNums.length} Blank Page{blankPageNums.length === 1 ? '' : 's'}
                  </button>
                  <span className="text-slate-300">|</span>
                </>
              )}
              <button type="button" onClick={() => setSelPages(new Set(pages.map((p) => p.pageNumber)))} className="font-bold text-accent hover:underline">Select all</button>
              <span className="text-slate-300">|</span>
              <button type="button" onClick={() => setSelPages(new Set(pages.map((p) => p.pageNumber).filter((n) => !selPages.has(n))))} className="font-bold text-accent hover:underline">Invert</button>
              <span className="text-slate-300">|</span>
              <button type="button" onClick={() => setSelPages(new Set(pages.map((p) => p.pageNumber).filter((n) => n % 2 === 1)))} className="font-bold text-slate-600 hover:text-accent">Odd</button>
              <span className="text-slate-300">|</span>
              <button type="button" onClick={() => setSelPages(new Set(pages.map((p) => p.pageNumber).filter((n) => n % 2 === 0)))} className="font-bold text-slate-600 hover:text-accent">Even</button>
              <span className="text-slate-300">|</span>
              <button type="button" onClick={() => { setSelPages(new Set()); setRangeInput('') }} className="font-bold text-slate-500 hover:text-red-600">Clear</button>
            </>
          ) : (
            <>
              <button type="button" onClick={() => setSelBlocks(new Set(blocks.map((b) => b.index)))} className="font-bold text-accent hover:underline">Select all</button>
              <span className="text-slate-300">|</span>
              <button type="button" onClick={() => setSelBlocks(new Set(blocks.map((b) => b.index).filter((i) => !selBlocks.has(i))))} className="font-bold text-accent hover:underline">Invert</button>
              <span className="text-slate-300">|</span>
              <button type="button" onClick={() => setSelBlocks(new Set())} className="font-bold text-slate-500 hover:text-red-600">Clear</button>
            </>
          )}
        </div>
      </div>

      {viewMode === 'pages' && (
        <div className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <label className="flex flex-1 items-center gap-2">
              <span className="text-xs font-bold text-slate-600 shrink-0">
                {isKeep ? 'Page range to keep:' : 'Page range to remove:'}
              </span>
              <input
                type="text"
                value={rangeInput}
                onChange={(e) => applyRange(e.target.value)}
                placeholder="e.g. 2, 4 or 2-3"
                className="input !py-1.5 text-xs font-mono max-w-xs"
              />
            </label>
            <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${
              selPages.size === 0
                ? 'bg-slate-100 text-slate-500'
                : isKeep
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-red-100 text-red-800'
            }`}>
              {selPages.size} of {pages.length} page{pages.length === 1 ? '' : 's'} marked to {isKeep ? 'KEEP' : 'REMOVE'}
            </span>
          </div>

          {/* Visual Miniature A4 Page Cards Grid */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {pages.map((p) => {
              const isSelected = selPages.has(p.pageNumber)
              const activeBorder = isSelected
                ? isKeep
                  ? 'border-emerald-400 bg-emerald-50/40 ring-2 ring-emerald-200'
                  : 'border-red-400 bg-red-50/40 ring-2 ring-red-200'
                : 'border-slate-200 bg-slate-50/60 hover:border-slate-300'

              return (
                <div
                  key={p.pageNumber}
                  onClick={() => togglePage(p.pageNumber)}
                  className={`group relative flex cursor-pointer flex-col justify-between rounded-2xl border p-3 transition shadow-sm ${activeBorder}`}
                >
                  {/* Page Card Header */}
                  <div className="mb-2.5 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className={`h-4 w-4 shrink-0 ${isKeep ? 'accent-emerald-600' : 'accent-[#E5484D]'}`}
                      />
                      <span className="text-xs font-extrabold text-ink-950">Page {p.pageNumber}</span>
                      {p.isBlank && (
                        <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-800">
                          Blank
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="rounded bg-white px-1.5 py-0.5 text-[10px] font-bold text-slate-600 ring-1 ring-slate-200">
                        {p.wordCount}w
                      </span>
                      {p.tableCount > 0 && (
                        <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-bold text-emerald-700 ring-1 ring-emerald-200">
                          {p.tableCount} tbl
                        </span>
                      )}
                      {p.imageCount > 0 && (
                        <span className="rounded bg-teal-50 px-1.5 py-0.5 text-[10px] font-bold text-teal-700 ring-1 ring-teal-200">
                          {p.imageCount} img
                        </span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setInspectPage(p) }}
                        className="rounded-lg bg-white p-1 text-slate-500 ring-1 ring-slate-200 hover:bg-accent hover:text-white transition"
                        title={`Inspect Page ${p.pageNumber} content`}
                      >
                        <Eye className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* Miniature Paper Sheet Simulation */}
                  <div className={`relative flex h-44 flex-col justify-between overflow-hidden rounded-xl border bg-white p-3 shadow-inner transition ${
                    isSelected && !isKeep ? 'opacity-65' : ''
                  }`}>
                    <div className="space-y-1.5 overflow-hidden">
                      {p.items && p.items.length > 0 ? (
                        p.items.slice(0, 5).map((item, idx) => {
                          if (item.kind === 'heading') {
                            return (
                              <div key={idx} className="truncate border-l-2 border-accent pl-1.5 text-[11px] font-extrabold text-ink-950">
                                {item.text}
                              </div>
                            )
                          }
                          if (item.kind === 'table' && item.rows?.length) {
                            return (
                              <div key={idx} className="my-1 overflow-hidden rounded border border-slate-200 bg-slate-50/70">
                                {item.rows.slice(0, 2).map((r, ri) => (
                                  <div key={ri} className={`grid grid-cols-3 divide-x divide-slate-200 text-[9px] ${ri === 0 ? 'bg-slate-100 font-bold text-ink-950' : 'text-slate-600'}`}>
                                    {r.slice(0, 3).map((c, ci) => (
                                      <span key={ci} className="truncate px-1 py-0.5">{c || '—'}</span>
                                    ))}
                                  </div>
                                ))}
                              </div>
                            )
                          }
                          if (item.kind === 'image') {
                            return (
                              <div key={idx} className="flex items-center gap-1 rounded bg-teal-50/80 px-2 py-1 text-[10px] font-bold text-teal-800">
                                <ImageIcon className="h-3 w-3" /> {item.text}
                              </div>
                            )
                          }
                          return (
                            <p key={idx} className="line-clamp-2 text-[10px] leading-snug text-slate-600">
                              {item.text}
                            </p>
                          )
                        })
                      ) : (
                        <div className="flex h-28 items-center justify-center text-[11px] italic text-slate-400">
                          {p.isBlank ? 'Empty / Blank Page' : p.label}
                        </div>
                      )}
                    </div>

                    {/* Miniature Page Footer */}
                    <div className="flex items-center justify-between border-t border-slate-100 pt-1.5 text-[9px] font-bold text-slate-400">
                      <span>{p.blockIndices.length} block{p.blockIndices.length === 1 ? '' : 's'}</span>
                      <span>— {p.pageNumber} —</span>
                      <span>{p.hasExplicitBreak ? 'Page Break' : 'Auto Flow'}</span>
                    </div>

                    {/* Stamp Overlay when selected */}
                    {isSelected && (
                      <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-900/5">
                        <span className={`rounded-full px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider shadow-md ${
                          isKeep ? 'bg-emerald-600 text-white' : 'bg-red-600 text-white'
                        }`}>
                          {isKeep ? '✓ Keep Page' : '✕ Remove Page'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {viewMode === 'blocks' && (
        <div>
          <p className="mb-2 text-xs font-semibold text-slate-500">
            {selBlocks.size} of {blocks.length} content blocks selected to {isKeep ? 'keep' : 'remove'}
          </p>
          <ul className="max-h-96 space-y-2 overflow-y-auto pr-1">
            {blocks.map((b) => {
              const isSelected = selBlocks.has(b.index)
              return (
                <li key={b.index}>
                  <label className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3.5 py-2.5 text-xs transition ${
                    isSelected
                      ? isKeep
                        ? 'border-emerald-300 bg-emerald-50/60 ring-2 ring-emerald-100'
                        : 'border-red-300 bg-red-50/60 ring-2 ring-red-100'
                      : 'border-slate-200 bg-white hover:border-slate-300'
                  }`}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleBlock(b.index)}
                      className={`h-4 w-4 shrink-0 ${isKeep ? 'accent-emerald-600' : 'accent-[#E5484D]'}`}
                    />
                    <span className="font-mono text-[10px] font-bold text-slate-400">#{b.index + 1}</span>
                    <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-[10px] font-extrabold uppercase ${
                      b.kind === 'heading' ? 'bg-blue-50 text-blue-700' : b.kind === 'table' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {b.kind}
                    </span>
                    <span className="min-w-0 flex-1 truncate font-semibold text-ink-950" title={b.label}>{b.label}</span>
                    {b.wordCount !== undefined && (
                      <span className="shrink-0 text-[10px] font-bold text-slate-400">{b.wordCount}w</span>
                    )}
                  </label>
                </li>
              )
            })}
          </ul>
        </div>
      )}

      {/* Full Page Content Inspector Modal */}
      {inspectPage && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs"
          onClick={() => setInspectPage(null)}
        >
          <div
            className="max-h-[82vh] w-full max-w-xl overflow-y-auto rounded-2xl border border-slate-200 bg-white p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-200 pb-3">
              <div>
                <h3 className="font-display text-lg font-extrabold text-ink-950">
                  Page {inspectPage.pageNumber} Content Preview
                </h3>
                <p className="text-xs font-semibold text-slate-500">
                  {inspectPage.wordCount} words · {inspectPage.blockIndices.length} blocks · {inspectPage.tableCount} tables · {inspectPage.imageCount} images
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectPage(null)}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-ink-950"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="space-y-2.5 rounded-xl border border-slate-200 bg-slate-50 p-4">
              {inspectPage.items.length > 0 ? (
                inspectPage.items.map((it, i) => (
                  <div key={i} className="rounded-lg bg-white p-3 shadow-xs ring-1 ring-slate-200/70">
                    <span className="mb-1 inline-block rounded bg-slate-100 px-1.5 py-0.5 text-[10px] font-extrabold uppercase text-slate-600">
                      {it.kind}
                    </span>
                    {it.kind === 'table' && it.rows ? (
                      <table className="mt-1 w-full border-collapse text-xs">
                        <tbody>
                          {it.rows.map((r, ri) => (
                            <tr key={ri} className={ri === 0 ? 'bg-slate-100 font-bold' : ''}>
                              {r.map((c, ci) => (
                                <td key={ci} className="border border-slate-200 px-2 py-1">{c}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    ) : (
                      <p className={`text-xs ${it.kind === 'heading' ? 'font-extrabold text-ink-950 text-sm' : 'text-slate-700'}`}>
                        {it.text}
                      </p>
                    )}
                  </div>
                ))
              ) : (
                <p className="text-center text-xs italic text-slate-400 py-6">This page contains no visible text blocks.</p>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => { togglePage(inspectPage.pageNumber); setInspectPage(null) }}
                className={`rounded-xl px-4 py-2 text-xs font-extrabold text-white shadow-sm ${
                  selPages.has(inspectPage.pageNumber) ? 'bg-slate-600' : isKeep ? 'bg-emerald-600' : 'bg-red-600'
                }`}
              >
                {selPages.has(inspectPage.pageNumber)
                  ? 'Unselect Page'
                  : isKeep
                    ? `Keep Page ${inspectPage.pageNumber}`
                    : `Mark Page ${inspectPage.pageNumber} for Removal`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

export const DocxPagePicker = DocxBlockPicker

/**
 * In-Place Visual Document Block & Table Editor for `edit-word`:
 * Edits paragraphs, headings, lists, and 2D table cells directly inside `word/document.xml`
 * while preserving 100% of original document styles, fonts, images, headers, and footers.
 */
export function DocxVisualEditor({
  file,
  onChange,
}: {
  file: File
  onChange: (nodes: EditableDocxNode[]) => void
}) {
  const { data: initialNodes, error } = useLoader<EditableDocxNode[]>(() => listEditableDocxNodes(file), file)
  const [editedState, setEditedState] = useState<{ src: EditableDocxNode[]; nodes: EditableDocxNode[] } | null>(null)
  const nodes = editedState && editedState.src === initialNodes ? editedState.nodes : (initialNodes ?? [])

  useEffect(() => {
    if (nodes.length) onChange(nodes)
  }, [nodes]) // eslint-disable-line react-hooks/exhaustive-deps

  if (error) return <Err msg={error} />
  if (!initialNodes) return <Loading label="Loading document blocks & tables for in-place visual editing…" />

  const updateNodes = (next: EditableDocxNode[]) => {
    setEditedState({ src: initialNodes, nodes: next })
  }

  const updateNode = (idx: number, patch: Partial<EditableDocxNode>) => {
    const next = [...nodes]
    next[idx] = { ...next[idx], ...patch }
    updateNodes(next)
  }

  const moveNode = (idx: number, dir: -1 | 1) => {
    const target = idx + dir
    if (target < 0 || target >= nodes.length) return
    const next = [...nodes]
    ;[next[idx], next[target]] = [next[target], next[idx]]
    updateNodes(next)
  }

  const deleteNode = (idx: number) => {
    if (nodes.length <= 1) return
    updateNodes(nodes.filter((_, i) => i !== idx))
  }

  const insertAfter = (idx: number, kind: EditableDocxNode['kind']) => {
    const newNode: EditableDocxNode = kind === 'table'
      ? {
          id: `new-${Date.now()}-${Math.random()}`,
          origIndex: -1,
          kind: 'table',
          text: '',
          cells: [['Header 1', 'Header 2'], ['Cell 1', 'Cell 2']],
        }
      : {
          id: `new-${Date.now()}-${Math.random()}`,
          origIndex: -1,
          kind,
          text: kind === 'heading1' ? 'New Section Heading' : kind === 'heading2' ? 'New Subheading' : 'New paragraph text…',
          align: 'left',
          bold: kind.startsWith('heading'),
        }
    const next = [...nodes]
    next.splice(idx + 1, 0, newNode)
    updateNodes(next)
  }

  const totalWords = nodes.reduce((sum, n) => {
    const txt = n.kind === 'table' ? (n.cells?.flat().join(' ') ?? '') : n.text
    return sum + (txt.trim() ? txt.trim().split(/\s+/).filter(Boolean).length : 0)
  }, 0)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-emerald-200 bg-emerald-50/70 px-3.5 py-2 text-xs">
        <span className="flex items-center gap-1.5 font-extrabold text-emerald-900">
          <CheckCircle2 className="h-4 w-4 text-emerald-600" />
          In-Place OOXML Document Canvas — 100% Original Fonts, Images, Headers &amp; Footers Preserved
        </span>
        <span className="font-bold text-emerald-800">
          {nodes.length} blocks · {totalWords.toLocaleString()} words
        </span>
      </div>

      <div className="max-h-[540px] space-y-3 overflow-y-auto rounded-2xl border border-slate-200 bg-slate-100/70 p-3 sm:p-5 shadow-inner">
        {nodes.map((node, idx) => (
          <div
            key={node.id}
            className="group rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-xs transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/15"
          >
            {/* Block Formatting Toolbar */}
            <div className="mb-2 flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-2 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="font-mono text-[10px] font-bold text-slate-400">#{idx + 1}</span>
                {node.kind !== 'table' ? (
                  <>
                    <select
                      value={node.kind}
                      onChange={(e) => updateNode(idx, { kind: e.target.value as EditableDocxNode['kind'] })}
                      className="rounded-lg border border-slate-200 bg-slate-50 px-2 py-1 text-[11px] font-extrabold text-ink-950"
                      aria-label="Block type"
                    >
                      <option value="heading1">Heading 1</option>
                      <option value="heading2">Heading 2</option>
                      <option value="heading3">Heading 3</option>
                      <option value="paragraph">Paragraph</option>
                      <option value="list">List Item</option>
                    </select>
                    <button
                      type="button"
                      onClick={() => updateNode(idx, { bold: !node.bold })}
                      className={`rounded p-1 transition ${node.bold ? 'bg-accent text-white' : 'text-slate-500 hover:bg-slate-100'}`}
                      title="Toggle Bold"
                    >
                      <Bold className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => updateNode(idx, { italic: !node.italic })}
                      className={`rounded p-1 transition ${node.italic ? 'bg-accent text-white' : 'text-slate-500 hover:bg-slate-100'}`}
                      title="Toggle Italic"
                    >
                      <Italic className="h-3.5 w-3.5" />
                    </button>
                    <div className="flex items-center rounded border border-slate-200 bg-slate-50 p-0.5">
                      {([
                        ['left', AlignLeft, 'Align Left'],
                        ['center', AlignCenter, 'Align Center'],
                        ['right', AlignRight, 'Align Right'],
                      ] as const).map(([al, IconCmp, label]) => (
                        <button
                          key={al}
                          type="button"
                          onClick={() => updateNode(idx, { align: al })}
                          className={`rounded p-1 transition ${(node.align ?? 'left') === al ? 'bg-white text-accent shadow-2xs' : 'text-slate-400 hover:text-ink-950'}`}
                          title={label}
                        >
                          <IconCmp className="h-3 w-3" />
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-extrabold text-emerald-700">
                    <Table2 className="h-3.5 w-3.5" /> Word Table ({node.cells?.length ?? 0}×{node.cells?.[0]?.length ?? 0})
                  </span>
                )}
                {node.hasEmbeddedMedia && (
                  <span className="inline-flex items-center gap-1 rounded bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-700">
                    <ImageIcon className="h-3 w-3" /> Embedded Image Preserved
                  </span>
                )}
              </div>

              {/* Reorder / Insert / Delete controls */}
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => insertAfter(idx, 'paragraph')}
                  className="rounded px-2 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-100"
                  title="Insert paragraph below"
                >
                  + Para
                </button>
                <button
                  type="button"
                  onClick={() => insertAfter(idx, 'heading2')}
                  className="rounded px-2 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-100"
                  title="Insert heading below"
                >
                  + Heading
                </button>
                <button
                  type="button"
                  onClick={() => insertAfter(idx, 'table')}
                  className="rounded px-2 py-0.5 text-[10px] font-bold text-slate-600 hover:bg-slate-100"
                  title="Insert table below"
                >
                  + Table
                </button>
                <button
                  type="button"
                  disabled={idx === 0}
                  onClick={() => moveNode(idx, -1)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-ink-950 disabled:opacity-30"
                  title="Move block up"
                >
                  <ArrowUp className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={idx === nodes.length - 1}
                  onClick={() => moveNode(idx, 1)}
                  className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-ink-950 disabled:opacity-30"
                  title="Move block down"
                >
                  <ArrowDown className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  disabled={nodes.length <= 1}
                  onClick={() => deleteNode(idx)}
                  className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-30"
                  title="Delete block"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>

            {/* Block Content Input or Interactive 2D Table Grid */}
            {node.kind === 'table' && node.cells ? (
              <div className="space-y-2 overflow-x-auto">
                <table className="w-full border-collapse text-xs">
                  <tbody>
                    {node.cells.map((row, ri) => (
                      <tr key={ri}>
                        {row.map((cellVal, ci) => (
                          <td key={ci} className="border border-slate-200 p-0">
                            <input
                              type="text"
                              value={cellVal}
                              onChange={(e) => {
                                const nextCells = node.cells!.map((r) => [...r])
                                nextCells[ri][ci] = e.target.value
                                updateNode(idx, { cells: nextCells })
                              }}
                              className={`w-full px-2.5 py-1.5 text-xs focus:bg-blue-50/40 focus:outline-none ${
                                ri === 0 ? 'bg-slate-50 font-bold text-ink-950' : 'text-slate-700'
                              }`}
                            />
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
                <div className="flex gap-2 text-[11px] font-bold">
                  <button
                    type="button"
                    onClick={() => {
                      const cols = node.cells?.[0]?.length || 2
                      const nextCells = [...(node.cells ?? []), Array.from({ length: cols }, () => '')]
                      updateNode(idx, { cells: nextCells })
                    }}
                    className="text-accent hover:underline"
                  >
                    + Add Row
                  </button>
                  <span className="text-slate-300">·</span>
                  <button
                    type="button"
                    onClick={() => {
                      const nextCells = (node.cells ?? [['']]).map((r, ri) => [...r, ri === 0 ? `Header ${r.length + 1}` : ''])
                      updateNode(idx, { cells: nextCells })
                    }}
                    className="text-accent hover:underline"
                  >
                    + Add Column
                  </button>
                </div>
              </div>
            ) : (
              <textarea
                rows={Math.max(1, Math.min(6, Math.ceil((node.text.length || 1) / 85)))}
                value={node.text}
                onChange={(e) => updateNode(idx, { text: e.target.value })}
                style={{ textAlign: node.align === 'both' ? 'justify' : (node.align ?? 'left') }}
                className={`w-full resize-y rounded-lg border border-transparent bg-transparent px-2 py-1 focus:border-slate-200 focus:bg-slate-50/50 focus:outline-none ${
                  node.kind === 'heading1'
                    ? 'font-display text-lg font-extrabold text-ink-950'
                    : node.kind === 'heading2'
                      ? 'font-display text-base font-bold text-ink-950'
                      : node.kind === 'heading3'
                        ? 'text-sm font-bold text-ink-950'
                        : 'text-sm text-slate-800'
                } ${node.bold ? 'font-bold' : ''} ${node.italic ? 'italic' : ''}`}
              />
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Interactive 5-Mode Split Word Studio (`split-word`):
 * Lets users split by Heading 1, Any Heading, Page Ranges, Page Breaks, Every N Paragraphs, or Interactive Split Markers,
 * with a live preview of the resulting .docx files before running.
 */
export function DocxSplitStudio({
  file,
  opts,
  onChange,
}: {
  file: File
  opts: SplitWordOpts
  onChange: (next: SplitWordOpts) => void
}) {
  const { data: blocks } = useLoader<DocxBlock[]>(() => listDocxBlocks(file), file)
  const { data: pages } = useLoader<DocxPageInfo[]>(() => listDocxPages(file), file)
  const [previewParts, setPreviewParts] = useState<SplitWordPartPreview[]>([])
  const [previewErr, setPreviewErr] = useState('')

  useEffect(() => {
    let alive = true
    previewSplitWord(file, opts)
      .then((res) => { if (alive) { setPreviewParts(res); setPreviewErr('') } })
      .catch((e) => { if (alive) { setPreviewParts([]); setPreviewErr(e instanceof Error ? e.message : 'Cannot split with current settings.') } })
    return () => { alive = false }
  }, [file, opts])

  const toggleCustomSplit = (blockIdx: number) => {
    const cur = new Set(opts.customSplitIndices ?? [])
    if (cur.has(blockIdx)) cur.delete(blockIdx)
    else cur.add(blockIdx)
    onChange({ ...opts, customSplitIndices: [...cur].sort((a, b) => a - b) })
  }

  return (
    <div className="space-y-4">
      {/* 5 Split Mode Tabs */}
      <div className="flex flex-wrap gap-1.5 border-b border-slate-200 pb-2.5">
        {([
          ['heading', 'By Heading 1'],
          ['heading-any', 'By Any Heading (H1–H3)'],
          ['pages', `By Pages (${pages?.length ?? '…'} pages)`],
          ['page-breaks', 'By Explicit Page Breaks'],
          ['paragraphs', 'Every N Paragraphs'],
          ['custom-blocks', 'Interactive Split Markers'],
        ] as const).map(([m, label]) => (
          <button
            key={m}
            type="button"
            onClick={() => onChange({ ...opts, mode: m })}
            className={`rounded-xl px-3 py-1.5 text-xs font-extrabold transition ${
              opts.mode === m ? 'bg-accent text-white shadow-sm' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Mode-Specific Controls */}
      {opts.mode === 'pages' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-ink-950">
              Custom Page Ranges (Separate output files with ;)
            </span>
            <input
              type="text"
              value={opts.pageRanges ?? ''}
              onChange={(e) => onChange({ ...opts, pageRanges: e.target.value })}
              placeholder={pages && pages.length > 1 ? `e.g. 1-${Math.ceil(pages.length / 2)}; ${Math.ceil(pages.length / 2) + 1}-${pages.length}` : 'Leave blank to split every N pages'}
              className="input font-mono text-xs"
            />
          </label>
          {!(opts.pageRanges ?? '').trim() && (
            <label className="block">
              <span className="mb-1.5 block text-sm font-bold text-ink-950">Or Pages per Output DOCX</span>
              <input
                type="number"
                min={1}
                max={Math.max(1, pages?.length ?? 50)}
                value={opts.pagesPerDoc ?? 1}
                onChange={(e) => onChange({ ...opts, pagesPerDoc: Math.max(1, +e.target.value || 1) })}
                className="input text-xs"
              />
            </label>
          )}
        </div>
      )}

      {opts.mode === 'paragraphs' && (
        <div className="max-w-sm">
          <label className="block">
            <span className="mb-1.5 flex justify-between text-sm font-bold text-ink-950">
              <span>Paragraphs / Blocks per Output File</span>
              <span className="text-accent">{opts.perDoc ?? 15} blocks</span>
            </span>
            <input
              type="range"
              min={1}
              max={Math.max(5, Math.min(100, blocks?.length ?? 50))}
              value={opts.perDoc ?? 15}
              onChange={(e) => onChange({ ...opts, perDoc: Math.max(1, +e.target.value) })}
              className="studio-range w-full"
              style={{
                '--range-pct': `${(((opts.perDoc ?? 15) - 1) / Math.max(1, Math.max(5, Math.min(100, blocks?.length ?? 50)) - 1)) * 100}%`,
              } as React.CSSProperties}
            />
          </label>
        </div>
      )}

      {opts.mode === 'custom-blocks' && blocks && (
        <div className="space-y-2">
          <p className="text-xs font-bold text-slate-600">
            Click between any two blocks below to place or remove a <span className="text-accent">✂ Split Here</span> divider:
          </p>
          <div className="max-h-72 space-y-1.5 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
            {blocks.map((b, i) => {
              const hasSplitBefore = (opts.customSplitIndices ?? []).includes(i)
              return (
                <div key={b.index}>
                  {i > 0 && (
                    <button
                      type="button"
                      onClick={() => toggleCustomSplit(i)}
                      className={`my-1 flex w-full items-center justify-center gap-1.5 rounded-lg border border-dashed py-1 text-[11px] font-extrabold transition ${
                        hasSplitBefore
                          ? 'border-accent bg-accent text-white shadow-xs'
                          : 'border-slate-300 bg-white/70 text-slate-400 hover:border-accent hover:text-accent'
                      }`}
                    >
                      <Scissors className="h-3 w-3" />
                      {hasSplitBefore ? `Split Point Active (Starts Part #${(opts.customSplitIndices ?? []).indexOf(i) + 2})` : 'Click to split here'}
                    </button>
                  )}
                  <div className="flex items-center gap-2 rounded-lg bg-white px-3 py-1.5 text-xs ring-1 ring-slate-200/70">
                    <span className="font-mono text-[10px] font-bold text-slate-400">#{i + 1}</span>
                    <span className={`rounded px-1.5 py-0.5 text-[9px] font-extrabold uppercase ${
                      b.kind === 'heading' ? 'bg-blue-50 text-blue-700' : b.kind === 'table' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                    }`}>
                      {b.kind}
                    </span>
                    <span className="truncate font-semibold text-ink-950">{b.label}</span>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      <label className="flex items-center gap-2 text-xs font-bold text-ink-950">
        <input
          type="checkbox"
          checked={opts.nameByHeading !== false}
          onChange={(e) => onChange({ ...opts, nameByHeading: e.target.checked })}
          className="h-4 w-4 accent-accent"
        />
        <span>Auto-name output <code className="rounded bg-slate-100 px-1">.docx</code> files after each part&apos;s first heading / title</span>
      </label>

      {/* Live Output Parts Preview */}
      {previewErr ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs font-bold text-amber-900">
          {previewErr}
        </div>
      ) : previewParts.length > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between text-xs font-extrabold text-ink-950">
            <span className="flex items-center gap-1.5">
              <FileText className="h-4 w-4 text-accent" />
              Live Split Preview — Will Generate {previewParts.length} Word Document{previewParts.length === 1 ? '' : 's'}
            </span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {previewParts.slice(0, 12).map((pt) => (
              <div key={pt.partNumber} className="rounded-xl border border-slate-200 bg-white p-2.5 text-xs shadow-2xs">
                <div className="flex items-center justify-between gap-1 font-extrabold text-ink-950">
                  <span className="truncate text-accent" title={pt.fileName}>{pt.fileName}</span>
                  <span className="shrink-0 rounded bg-slate-100 px-1.5 py-0.5 text-[10px] text-slate-600">{pt.wordCount}w</span>
                </div>
                <p className="mt-1 truncate text-[11px] font-medium text-slate-500" title={pt.title}>
                  {pt.title}
                </p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}

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
            <input type="checkbox" checked={sel.has(n)} onChange={() => toggle(n)} className="h-4 w-4 accent-accent" />
            <span className="text-slate-400 font-mono text-[10px]">#{i + 1}</span> {n}
          </label>
        ))}
      </div>
    </div>
  )
}
