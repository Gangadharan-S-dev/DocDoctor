import { useEffect, useState } from 'react'
import { Loader2, ArrowUp, ArrowDown } from 'lucide-react'
import { listSlides, sheetNames, listDocxBlocks, type SlideInfo, type DocxBlock } from '../processing/office'

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
  return { sel, toggle }
}

const Err = ({ msg }: { msg: string }) => <p role="alert" className="rounded-xl bg-red-50 px-4 py-3 text-sm font-semibold text-red-700 ring-1 ring-red-200">{msg}</p>
const Loading = ({ label }: { label: string }) => <p className="flex items-center gap-2 py-6 text-sm font-semibold text-slate-500"><Loader2 className="h-4 w-4 animate-spin" /> {label}</p>

/** Checkbox slide picker for remove/extract. Emits selected part names. */
export function SlidePicker({ file, onChange }: { file: File; onChange: (parts: string[]) => void }) {
  const { data: slides, error } = useLoader<SlideInfo[]>(() => listSlides(file), file)
  const { sel, toggle } = useFileSelection<string>(file)
  useEffect(() => { onChange([...sel]) }, [sel]) // eslint-disable-line
  if (error) return <Err msg={error} />
  if (!slides) return <Loading label="Reading slides…" />
  return (
    <div>
      <p className="mb-3 text-sm font-semibold text-slate-600">{sel.size} of {slides.length} slides selected</p>
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

/** Ordered slide list with move buttons for reorder. Emits parts in order. */
export function SlideReorder({ file, onChange }: { file: File; onChange: (parts: string[]) => void }) {
  const { data: slides, error } = useLoader<SlideInfo[]>(() => listSlides(file), file)
  const [moved, setMoved] = useState<{ src: SlideInfo[]; order: SlideInfo[] } | null>(null)
  const order = moved && moved.src === slides ? moved.order : (slides ?? [])
  useEffect(() => { onChange(order.map((s) => s.part)) }, [order]) // eslint-disable-line
  if (error) return <Err msg={error} />
  if (!slides) return <Loading label="Reading slides…" />
  const move = (i: number, d: -1 | 1) => { const n = [...order]; const t = i + d; if (t < 0 || t >= n.length) return; [n[i], n[t]] = [n[t], n[i]]; setMoved({ src: slides, order: n }) }
  return (
    <ol className="space-y-2">
      {order.map((s, i) => (
        <li key={s.part} className="flex items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-ink-950 text-xs font-extrabold text-white">{i + 1}</span>
          <span className="min-w-0 flex-1 truncate text-sm font-bold text-ink-950" title={s.title}>{s.title}</span>
          <button type="button" aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)} className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-30"><ArrowUp className="h-4 w-4" /></button>
          <button type="button" aria-label="Move down" disabled={i === order.length - 1} onClick={() => move(i, 1)} className="rounded-lg p-2 hover:bg-slate-100 disabled:opacity-30"><ArrowDown className="h-4 w-4" /></button>
        </li>
      ))}
    </ol>
  )
}

/** Checkbox picker over a DOCX's content blocks (headings, paragraphs, tables). Emits block indexes. */
export function DocxBlockPicker({ file, onChange }: { file: File; onChange: (indexes: number[]) => void }) {
  const { data: blocks, error } = useLoader<DocxBlock[]>(() => listDocxBlocks(file), file)
  const { sel, toggle } = useFileSelection<number>(file)
  useEffect(() => { onChange([...sel].sort((a, b) => a - b)) }, [sel]) // eslint-disable-line
  if (error) return <Err msg={error} />
  if (!blocks) return <Loading label="Reading document content…" />
  return (
    <div>
      <p className="mb-3 text-sm font-semibold text-slate-600">{sel.size} of {blocks.length} content blocks selected for removal</p>
      <ul className="space-y-2">
        {blocks.map((b) => (
          <li key={b.index}>
            <label className={`flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 transition ${sel.has(b.index) ? 'border-red-300 bg-red-50/60 ring-2 ring-red-100' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
              <input type="checkbox" checked={sel.has(b.index)} onChange={() => toggle(b.index)} className="h-4 w-4 shrink-0 accent-[#E5484D]" />
              <span className={`shrink-0 rounded-md px-2 py-1 text-[10px] font-extrabold uppercase tracking-wide ${b.kind === 'heading' ? 'bg-blue-50 text-blue-700' : b.kind === 'table' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{b.kind}</span>
              <span className="min-w-0 truncate text-sm font-bold text-ink-950" title={b.label}>{b.label}</span>
            </label>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Checkbox worksheet picker. Emits selected sheet names. */
export function SheetPicker({ file, onChange }: { file: File; onChange: (names: string[]) => void }) {
  const { data: names, error } = useLoader<string[]>(() => sheetNames(file), file)
  const { sel, toggle } = useFileSelection<string>(file)
  useEffect(() => { onChange([...sel]) }, [sel]) // eslint-disable-line
  if (error) return <Err msg={error} />
  if (!names) return <Loading label="Reading worksheets…" />
  return (
    <div>
      <p className="mb-3 text-sm font-semibold text-slate-600">{sel.size} of {names.length} worksheets selected</p>
      <div className="flex flex-wrap gap-2">
        {names.map((n) => (
          <label key={n} className={`flex cursor-pointer items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold transition ${sel.has(n) ? 'border-accent bg-accent-soft text-accent-dark ring-2 ring-accent/20' : 'border-slate-200 bg-white hover:border-slate-300'}`}>
            <input type="checkbox" checked={sel.has(n)} onChange={() => toggle(n)} className="h-4 w-4 accent-[#1D6FF2]" /> {n}
          </label>
        ))}
      </div>
    </div>
  )
}
