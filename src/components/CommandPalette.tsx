import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import { Search, X, ArrowRight, Star, Clock, Sparkles, CornerDownLeft } from 'lucide-react'
import { CATEGORIES, TOOLS, categoryById, popularTools, toolById, type CategoryId, type Tool } from '../data/tools'
import { getFavorites, getRecent } from '../lib/prefs'

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
}

export default function CommandPalette({ open, onClose }: CommandPaletteProps) {
  if (!open) return null
  return <CommandPaletteDialog onClose={onClose} />
}

function CommandPaletteDialog({ onClose }: { onClose: () => void }) {
  const [query, setQuery] = useState('')
  const [cat, setCat] = useState<'all' | CategoryId>('all')
  const [activeIdx, setActiveIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  useEffect(() => {
    const id = window.setTimeout(() => inputRef.current?.focus(), 20)
    return () => window.clearTimeout(id)
  }, [])

  const quickTools = useMemo(() => {
    const favs = getFavorites().map((id) => toolById(id)).filter((t): t is Tool => !!t)
    const recents = getRecent().map((id) => toolById(id)).filter((t): t is Tool => !!t && !favs.some((f) => f.id === t.id))
    return { favs: favs.slice(0, 4), recents: recents.slice(0, 4) }
  }, [])

  const results = useMemo(() => {
    const q = query.trim().toLowerCase()
    const pool = cat === 'all' ? TOOLS : TOOLS.filter((t) => t.category === cat)
    if (!q) {
      if (cat !== 'all') return pool.slice(0, 12)
      const combined: Tool[] = [...quickTools.favs, ...quickTools.recents]
      for (const p of popularTools) {
        if (!combined.some((c) => c.id === p.id)) combined.push(p)
      }
      return combined.slice(0, 10)
    }
    return pool
      .filter((t) => `${t.name} ${t.description} ${t.acceptLabel} ${t.category}`.toLowerCase().includes(q))
      .sort((a, b) => {
        const aName = a.name.toLowerCase().includes(q) ? 0 : 1
        const bName = b.name.toLowerCase().includes(q) ? 0 : 1
        return aName - bName
      })
      .slice(0, 14)
  }, [query, cat, quickTools])

  const safeIdx = results.length ? Math.min(activeIdx, results.length - 1) : 0

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIdx((i) => (results.length ? (i + 1) % results.length : 0))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIdx((i) => (results.length ? (i - 1 + results.length) % results.length : 0))
      } else if (e.key === 'Enter' && results[safeIdx]) {
        e.preventDefault()
        navigate(`/tool/${results[safeIdx].id}`)
        onClose()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [results, safeIdx, navigate, onClose])

  const selectTool = (tool: Tool) => {
    navigate(`/tool/${tool.id}`)
    onClose()
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Quick tool launcher"
      className="fixed inset-0 z-50 flex items-start justify-center bg-slate-950/55 px-4 pt-[10vh] backdrop-blur-md"
      onClick={onClose}
    >
      <div
        className="animate-bento-pop w-full max-w-2xl overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 shadow-2xl backdrop-blur-xl dark:border-slate-700/80 dark:bg-[#0d1424]/95"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search header */}
        <div className="flex items-center gap-3 border-b border-slate-200/80 px-5 py-4 dark:border-slate-800">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-sm">
            <Search className="h-4 w-4" />
          </span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => { setQuery(e.target.value); setActiveIdx(0) }}
            placeholder={`Search all ${TOOLS.length} tools — e.g. "compress pdf", "passport", "blur image"…`}
            className="w-full bg-transparent text-base font-semibold text-ink-950 placeholder:text-slate-400 focus:outline-none dark:text-white dark:placeholder:text-slate-500"
            autoComplete="off"
          />
          {query && (
            <button
              type="button"
              onClick={() => { setQuery(''); setActiveIdx(0) }}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-ink-950 dark:hover:bg-slate-800 dark:hover:text-white"
              aria-label="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-2 py-1 text-[11px] font-bold text-slate-500 hover:bg-slate-50 dark:border-slate-700 dark:text-slate-400 dark:hover:bg-slate-800"
          >
            ESC
          </button>
        </div>

        {/* Vibrant category pills */}
        <div className="flex flex-wrap items-center gap-1.5 border-b border-slate-100 px-5 py-2.5 dark:border-slate-800/80">
          <button
            type="button"
            onClick={() => { setCat('all'); setActiveIdx(0) }}
            className={`rounded-full px-3 py-1 text-xs font-bold transition ${
              cat === 'all'
                ? 'bg-ink-950 text-white dark:bg-white dark:text-ink-950'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800/80 dark:text-slate-300 dark:hover:bg-slate-700'
            }`}
          >
            All ({TOOLS.length})
          </button>
          {CATEGORIES.map((c) => {
            const active = cat === c.id
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => { setCat(c.id); setActiveIdx(0) }}
                className="rounded-full px-3 py-1 text-xs font-bold transition"
                style={
                  active
                    ? { backgroundColor: c.color, color: '#fff' }
                    : { backgroundColor: `${c.color}16`, color: c.color }
                }
              >
                {c.name.replace(' Tools', '')}
              </button>
            )
          })}
        </div>

        {/* Results list */}
        <div className="max-h-[54vh] overflow-y-auto p-2.5">
          {!query && cat === 'all' && (
            <p className="flex items-center gap-1.5 px-3 pb-1.5 pt-1 text-[11px] font-extrabold uppercase tracking-wider text-slate-400">
              {quickTools.favs.length > 0 ? (
                <><Star className="h-3 w-3 text-amber-500" /> Favorites, recent &amp; popular</>
              ) : quickTools.recents.length > 0 ? (
                <><Clock className="h-3 w-3 text-accent" /> Recent &amp; popular tools</>
              ) : (
                <><Sparkles className="h-3 w-3 text-accent" /> Popular tools</>
              )}
            </p>
          )}

          {results.length === 0 ? (
            <div className="py-12 text-center">
              <p className="font-display text-base font-bold text-ink-950 dark:text-white">No tools match “{query}”</p>
              <p className="mt-1 text-xs text-slate-500">Try a file format like PDF, HEIC, DOCX, or an action like compress, merge, or crop.</p>
            </div>
          ) : (
            <ul role="listbox" className="space-y-1">
              {results.map((tool, idx) => {
                const c = categoryById(tool.category)
                const Icon = tool.icon
                const active = idx === safeIdx
                return (
                  <li key={tool.id} role="option" aria-selected={active}>
                    <button
                      type="button"
                      onMouseEnter={() => setActiveIdx(idx)}
                      onClick={() => selectTool(tool)}
                      className={`flex w-full items-center gap-3.5 rounded-2xl px-3.5 py-2.5 text-left transition ${
                        active
                          ? 'bg-slate-100/90 dark:bg-slate-800/80'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <span
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition"
                        style={{ backgroundColor: `${c.color}18`, color: c.color }}
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-display text-sm font-bold text-ink-950 dark:text-white">{tool.name}</span>
                          <span
                            className="rounded-full px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide"
                            style={{ backgroundColor: `${c.color}16`, color: c.color }}
                          >
                            {tool.acceptLabel.split(',')[0]}
                          </span>
                        </span>
                        <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">{tool.description}</span>
                      </span>
                      <ArrowRight
                        className={`h-4 w-4 shrink-0 transition ${
                          active ? 'translate-x-0.5 text-accent opacity-100' : 'text-slate-300 opacity-0'
                        }`}
                      />
                    </button>
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        {/* Footer keyboard hints */}
        <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-5 py-2.5 text-[11px] font-semibold text-slate-500 dark:border-slate-800 dark:bg-[#090f1d] dark:text-slate-400">
          <span className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1"><kbd className="rounded bg-white px-1.5 py-0.5 font-bold shadow-2xs ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700">↑↓</kbd> Navigate</span>
            <span className="inline-flex items-center gap-1"><kbd className="rounded bg-white px-1.5 py-0.5 font-bold shadow-2xs ring-1 ring-slate-200 dark:bg-slate-800 dark:ring-slate-700"><CornerDownLeft className="inline h-3 w-3" /></kbd> Open</span>
          </span>
          <span>100% private · Runs in your browser</span>
        </div>
      </div>
    </div>
  )
}
