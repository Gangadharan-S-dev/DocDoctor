import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router'
import {
  Search, X, ArrowRight, Star, Clock, Sparkles, CornerDownLeft,
  Moon, Sun, Palette, Languages, Compass, Download,
} from 'lucide-react'
import { CATEGORIES, TOOLS, categoryById, formatSize, popularTools, toolById, type CategoryId, type Tool } from '../data/tools'
import { getFavorites, getRecent } from '../lib/prefs'
import { getSessionHistory } from '../lib/sessionHistory'
import { downloadBlob } from '../processing/download'
import StudioDialog from './StudioDialog'

export type StudioAccentId = 'cobalt' | 'coral' | 'emerald' | 'violet'

interface CommandPaletteProps {
  open: boolean
  onClose: () => void
  dark?: boolean
  onToggleTheme?: () => void
  accent?: StudioAccentId
  onSetAccent?: (next: StudioAccentId) => void
  lang?: 'en' | 'es'
  onToggleLang?: () => void
}

/** Natural-language intent aliases so users find tools by goal, not just exact title. */
const TOOL_ALIASES: Record<string, string> = {
  'compress-pdf': 'shrink smaller reduce size email limit',
  'compress-image': 'shrink smaller reduce photo size web optimize',
  'compress-image-kb': '20kb 50kb 100kb exam portal whatsapp target size kb',
  'merge-pdf': 'combine join stitch multiple pdfs together',
  'split-pdf': 'cut separate divide pages',
  'protect-pdf': 'lock password encrypt aes256 secure',
  'unlock-pdf': 'remove password decrypt open',
  'sign-pdf': 'signature autograph draw sign document',
  'ocr-pdf': 'scan extract text searchable copy text',
  'blur-image': 'censor redact hide face pii pixelate blackout privacy',
  'crop-image': 'scan deskew perspective warp straighten document trim',
  'passport-photo': 'visa id photo biometric 300dpi a4 sheet pan ssc',
  'heic-to-jpg': 'iphone apple photo convert',
  'gif-maker': 'animated gif frames loop',
  'zip-files': 'archive bundle compress folder',
  'extract-zip': 'unzip decompress open archive',
}

type PaletteEntry =
  | { kind: 'tool'; id: string; tool: Tool }
  | {
      kind: 'action'
      id: string
      title: string
      subtitle: string
      badge: string
      color: string
      keywords: string
      icon: typeof Moon
      run: () => void
    }

export default function CommandPalette(props: CommandPaletteProps) {
  if (!props.open) return null
  return <CommandPaletteDialog {...props} />
}

function CommandPaletteDialog({
  onClose,
  dark,
  onToggleTheme,
  accent,
  onSetAccent,
  lang,
  onToggleLang,
}: CommandPaletteProps) {
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

  const studioActions = useMemo<Extract<PaletteEntry, { kind: 'action' }>[]>(() => {
    const list: Extract<PaletteEntry, { kind: 'action' }>[] = []
    if (onToggleTheme) {
      list.push({
        kind: 'action',
        id: 'action-theme',
        title: dark ? 'Switch to Light Mode' : 'Switch to Dark Mode',
        subtitle: 'Toggle studio surface theme',
        badge: 'Theme',
        color: '#f59e0b',
        keywords: 'theme dark light mode appearance night day',
        icon: dark ? Sun : Moon,
        run: () => {
          onToggleTheme()
          onClose()
        },
      })
    }
    if (onSetAccent) {
      const accents: { id: StudioAccentId; label: string; color: string }[] = [
        { id: 'cobalt', label: 'Cobalt Blue', color: '#2563eb' },
        { id: 'coral', label: 'Coral Flame', color: '#f43f5e' },
        { id: 'emerald', label: 'Emerald Mint', color: '#059669' },
        { id: 'violet', label: 'Electric Violet', color: '#7c3aed' },
      ]
      for (const a of accents) {
        if (a.id === accent) continue
        list.push({
          kind: 'action',
          id: `action-accent-${a.id}`,
          title: `Accent: ${a.label}`,
          subtitle: 'Personalize buttons, beams, and sliders',
          badge: 'Accent',
          color: a.color,
          keywords: `accent color theme ${a.id} ${a.label.toLowerCase()}`,
          icon: Palette,
          run: () => {
            onSetAccent(a.id)
            onClose()
          },
        })
      }
    }
    if (onToggleLang) {
      list.push({
        kind: 'action',
        id: 'action-lang',
        title: lang === 'es' ? 'Switch Language to English (EN)' : 'Switch Language to Español (ES)',
        subtitle: 'Toggle interface language',
        badge: 'Language',
        color: '#0d9488',
        keywords: 'language english spanish espanol locale i18n',
        icon: Languages,
        run: () => {
          onToggleLang()
          onClose()
        },
      })
    }
    list.push({
      kind: 'action',
      id: 'action-all-tools',
      title: `Browse All ${TOOLS.length} Tools`,
      subtitle: 'Open full searchable directory with format filters',
      badge: 'Navigate',
      color: '#2563eb',
      keywords: 'directory catalog all tools browse list',
      icon: Compass,
      run: () => {
        navigate('/tools')
        onClose()
      },
    })
    for (const item of getSessionHistory().slice(0, 4)) {
      list.push({
        kind: 'action',
        id: `output-${item.id}`,
        title: `Download ${item.fileName}`,
        subtitle: `Session output · ${item.toolName} · ${formatSize(item.size)}`,
        badge: 'Output',
        color: '#0d9488',
        keywords: `output download recent file ${item.fileName.toLowerCase()} ${item.toolName.toLowerCase()}`,
        icon: Download,
        run: () => {
          downloadBlob(item.blob, item.fileName)
          onClose()
        },
      })
    }
    return list
  }, [dark, onToggleTheme, accent, onSetAccent, lang, onToggleLang, navigate, onClose])

  const entries = useMemo<PaletteEntry[]>(() => {
    const q = query.trim().toLowerCase()
    const pool = cat === 'all' ? TOOLS : TOOLS.filter((t) => t.category === cat)

    if (!q) {
      if (cat !== 'all') {
        return pool.slice(0, 12).map((tool) => ({ kind: 'tool', id: tool.id, tool }))
      }
      const combined: Tool[] = [...quickTools.favs, ...quickTools.recents]
      for (const p of popularTools) {
        if (!combined.some((c) => c.id === p.id)) combined.push(p)
      }
      const toolEntries: PaletteEntry[] = combined.slice(0, 8).map((tool) => ({ kind: 'tool', id: tool.id, tool }))
      const topActions: PaletteEntry[] = studioActions.slice(0, 3)
      return [...toolEntries, ...topActions]
    }

    const terms = q.split(/\s+/).filter(Boolean)
    const matchedTools = pool
      .map((t) => {
        const alias = TOOL_ALIASES[t.id] ?? ''
        const haystack = `${t.name} ${t.description} ${t.acceptLabel} ${t.category} ${alias}`.toLowerCase()
        if (!terms.every((term) => haystack.includes(term))) return null
        const nameLow = t.name.toLowerCase()
        const score = nameLow.startsWith(q) ? 0 : nameLow.includes(q) ? 1 : alias.includes(q) ? 2 : 3
        return { tool: t, score }
      })
      .filter((x): x is { tool: Tool; score: number } => x !== null)
      .sort((a, b) => a.score - b.score || a.tool.name.localeCompare(b.tool.name))
      .slice(0, 12)
      .map((x): PaletteEntry => ({ kind: 'tool', id: x.tool.id, tool: x.tool }))

    const matchedActions: PaletteEntry[] =
      cat === 'all'
        ? studioActions.filter((a) => {
            const hay = `${a.title} ${a.subtitle} ${a.keywords}`.toLowerCase()
            return terms.every((term) => hay.includes(term))
          })
        : []

    return [...matchedTools, ...matchedActions]
  }, [query, cat, quickTools, studioActions])

  const safeIdx = entries.length ? Math.min(activeIdx, entries.length - 1) : 0

  const executeEntry = (entry: PaletteEntry) => {
    if (entry.kind === 'tool') {
      navigate(`/tool/${entry.tool.id}`)
      onClose()
    } else {
      entry.run()
    }
  }

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        setActiveIdx((i) => (entries.length ? (i + 1) % entries.length : 0))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setActiveIdx((i) => (entries.length ? (i - 1 + entries.length) % entries.length : 0))
      } else if (e.key === 'Enter' && entries[safeIdx]) {
        e.preventDefault()
        const picked = entries[safeIdx]
        if (picked.kind === 'tool') {
          navigate(`/tool/${picked.tool.id}`)
          onClose()
        } else {
          picked.run()
        }
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [entries, safeIdx, navigate, onClose])

  return (
    <StudioDialog
      open
      onClose={onClose}
      ariaLabel="Quick tool launcher"
      initialFocusRef={inputRef}
      placement="top"
      panelClassName="glass-grain max-w-2xl bg-white/95 backdrop-blur-xl dark:bg-[#0a1020]/95"
    >
      {/* Search header */}
      <div className="relative z-10 flex items-center gap-3 border-b border-slate-200/80 px-5 py-4 dark:border-slate-800">
        <span className="brand-grad flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white shadow-sm">
          <Search className="h-4 w-4" />
        </span>
        <input
          ref={inputRef}
          value={query}
          onChange={(e) => { setQuery(e.target.value); setActiveIdx(0) }}
          placeholder='Try "shrink pdf", "50kb", "blur face", or "dark mode"…'
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
          className="kbd-key hover:bg-slate-50 dark:hover:bg-slate-700"
        >
          ESC
        </button>
      </div>

      {/* Vibrant category pills (WCAG AA contrast) */}
      <div className="relative z-10 flex flex-wrap items-center gap-1.5 border-b border-slate-100 px-5 py-2.5 dark:border-slate-800/80">
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
              data-category={c.id}
              onClick={() => { setCat(c.id); setActiveIdx(0) }}
              className={`rounded-full px-3 py-1 text-xs font-bold transition ${active ? 'text-white shadow-xs' : 'cat-pill hover:brightness-95 dark:hover:brightness-110'}`}
              style={active ? { backgroundColor: c.color } : undefined}
            >
              {c.name.replace(' Tools', '')}
            </button>
          )
        })}
      </div>

        {/* Results list */}
        <div className="relative z-10 max-h-[54vh] overflow-y-auto p-2.5">
          {!query && cat === 'all' && (
            <p className="flex items-center gap-1.5 px-3 pb-1.5 pt-1 font-mono text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
              {quickTools.favs.length > 0 ? (
                <><Star className="h-3 w-3 text-amber-500" /> Favorites, recent &amp; quick actions</>
              ) : quickTools.recents.length > 0 ? (
                <><Clock className="h-3 w-3 text-accent" /> Recent tools &amp; quick actions</>
              ) : (
                <><Sparkles className="h-3 w-3 text-accent" /> Popular tools &amp; studio actions</>
              )}
            </p>
          )}

          {entries.length === 0 ? (
            <div className="py-12 text-center">
              <p className="font-display text-base font-bold text-ink-950 dark:text-white">No tools or actions match “{query}”</p>
              <p className="mt-1 text-xs text-slate-500">Try a goal like &ldquo;shrink pdf&rdquo;, &ldquo;50kb&rdquo;, &ldquo;lock&rdquo;, or &ldquo;dark mode&rdquo;.</p>
            </div>
          ) : (
            <ul role="listbox" className="space-y-1">
              {entries.map((entry, idx) => {
                const active = idx === safeIdx
                if (entry.kind === 'action') {
                  const Icon = entry.icon
                  return (
                    <li key={entry.id} role="option" aria-selected={active}>
                      <button
                        type="button"
                        onMouseEnter={() => setActiveIdx(idx)}
                        onClick={() => executeEntry(entry)}
                        className={`flex w-full items-center gap-3.5 rounded-2xl px-3.5 py-2.5 text-left transition ${
                          active
                            ? 'bg-slate-100/90 ring-1 ring-accent/25 dark:bg-slate-800/80'
                            : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                        }`}
                      >
                        <span
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl"
                          style={{ backgroundColor: `${entry.color}18`, color: entry.color }}
                        >
                          <Icon className="h-4.5 w-4.5" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center gap-2">
                            <span className="truncate font-display text-sm font-bold text-ink-950 dark:text-white">{entry.title}</span>
                            <span className="rounded-full bg-slate-200/70 px-2 py-0.5 font-mono text-[9px] font-extrabold uppercase tracking-wider text-slate-600 dark:bg-slate-700/80 dark:text-slate-300">
                              {entry.badge}
                            </span>
                          </span>
                          <span className="mt-0.5 block truncate text-xs text-slate-500 dark:text-slate-400">{entry.subtitle}</span>
                        </span>
                        <ArrowRight
                          className={`h-4 w-4 shrink-0 transition ${
                            active ? 'translate-x-0.5 text-accent opacity-100' : 'text-slate-300 opacity-0'
                          }`}
                        />
                      </button>
                    </li>
                  )
                }

                const { tool } = entry
                const c = categoryById(tool.category)
                const Icon = tool.icon
                return (
                  <li key={tool.id} role="option" aria-selected={active}>
                    <button
                      type="button"
                      onMouseEnter={() => setActiveIdx(idx)}
                      onClick={() => executeEntry(entry)}
                      className={`flex w-full items-center gap-3.5 rounded-2xl px-3.5 py-2.5 text-left transition ${
                        active
                          ? 'bg-slate-100/90 ring-1 ring-accent/25 dark:bg-slate-800/80'
                          : 'hover:bg-slate-50 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <span
                        data-category={c.id}
                        className="cat-icon-soft flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition"
                      >
                        <Icon className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2">
                          <span className="truncate font-display text-sm font-bold text-ink-950 dark:text-white">{tool.name}</span>
                          <span
                            data-category={c.id}
                            className="cat-pill rounded-full px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide"
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
        <div className="relative z-10 flex items-center justify-between border-t border-slate-100 bg-slate-50/70 px-5 py-2.5 text-[11px] font-semibold text-slate-500 dark:border-slate-800 dark:bg-[#070c18] dark:text-slate-400">
          <span className="flex items-center gap-3">
            <span className="inline-flex items-center gap-1"><kbd className="kbd-key">↑↓</kbd> Navigate</span>
            <span className="inline-flex items-center gap-1"><kbd className="kbd-key"><CornerDownLeft className="inline h-3 w-3" /></kbd> Run</span>
          </span>
          <span className="font-mono text-[10px] uppercase tracking-wider">100% LOCAL · ZERO CLOUD</span>
        </div>
    </StudioDialog>
  )
}
