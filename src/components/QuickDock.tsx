import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useLocation, useNavigate } from 'react-router'
import { Home, LayoutGrid, Search, Star, ArrowUp, X, ArrowRight, History, Download, Workflow, Trash2 } from 'lucide-react'
import { categoryById, formatSize, toolById, type Tool } from '../data/tools'
import { getFavorites, onPrefsChange } from '../lib/prefs'
import {
  clearSessionHistory,
  getSessionHistory,
  onSessionHistoryChange,
  type SessionHistoryItem,
} from '../lib/sessionHistory'
import { suggestToolsForFile } from '../lib/smartSuggest'
import { downloadBlob } from '../processing/download'
import { showToast } from '../lib/toast'

type DockDrawer = 'none' | 'favs' | 'outputs'

export default function QuickDock({ onOpenSearch }: { onOpenSearch: () => void }) {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [favIds, setFavIds] = useState<string[]>(() => getFavorites())
  const [outputs, setOutputs] = useState<SessionHistoryItem[]>(() => getSessionHistory())
  const [drawer, setDrawer] = useState<DockDrawer>('none')
  const [showTop, setShowTop] = useState(false)
  const [dockVisible, setDockVisible] = useState(true)
  const lastYRef = useRef(0)

  useEffect(() => onPrefsChange(() => setFavIds(getFavorites())), [])
  useEffect(() => onSessionHistoryChange(() => setOutputs(getSessionHistory())), [])

  useEffect(() => {
    const onScroll = () => {
      const y = window.scrollY
      setShowTop(y > 340)
      if (drawer !== 'none') {
        setDockVisible(true)
        lastYRef.current = y
        return
      }
      const delta = y - lastYRef.current
      if (y < 140) {
        setDockVisible(true)
      } else if (delta > 14) {
        setDockVisible(false)
      } else if (delta < -10) {
        setDockVisible(true)
      }
      lastYRef.current = y
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [drawer])

  const favTools = useMemo(
    () => favIds.map((id) => toolById(id)).filter((t): t is Tool => !!t),
    [favIds],
  )

  const chainOutput = (item: SessionHistoryItem) => {
    const f = new File([item.blob], item.fileName, { type: item.blob.type })
    const next = suggestToolsForFile(f).find((t) => t.id !== item.toolId) ?? suggestToolsForFile(f)[0]
    if (!next) return
    setDrawer('none')
    navigate(`/tool/${next.id}`, {
      state: { chainedFiles: [f], pipelineHistory: [item.toolName] },
    })
    showToast(`Sent ${item.fileName} to ${next.name}`, 'accent')
  }

  const itemCls = (active: boolean) =>
    `flex h-10 items-center gap-1.5 rounded-2xl px-3 text-xs font-extrabold transition ${
      active
        ? 'bg-ink-950 text-white shadow-xs dark:bg-white dark:text-ink-950'
        : 'text-slate-600 hover:bg-slate-100 hover:text-ink-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
    }`

  return (
    <div
      className={`pointer-events-none fixed inset-x-0 bottom-4 z-30 flex flex-col items-center px-4 transition duration-300 ease-out print:hidden ${
        dockVisible ? 'translate-y-0 opacity-100' : 'translate-y-24 opacity-0'
      }`}
    >
      {/* Favorites Mini-Drawer above the dock */}
      {drawer === 'favs' && (
        <div className="animate-bento-pop pointer-events-auto mb-2.5 w-full max-w-sm overflow-hidden rounded-3xl border border-slate-200/90 bg-white/95 p-4 shadow-2xl dark:border-slate-700/80 dark:bg-[#0d1425]/95">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 dark:border-slate-800">
            <span className="flex items-center gap-1.5 font-display text-sm font-extrabold text-ink-950 dark:text-white">
              <Star className="h-4 w-4 fill-amber-400 text-amber-500" /> Pinned Favorites ({favTools.length})
            </span>
            <button
              type="button"
              onClick={() => setDrawer('none')}
              aria-label="Close favorites drawer"
              className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-ink-950 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
          {favTools.length === 0 ? (
            <p className="py-5 text-center text-xs font-medium text-slate-500 dark:text-slate-400">
              Click the <Star className="inline h-3.5 w-3.5 text-amber-400" /> on any tool card to pin it here for 1-click access.
            </p>
          ) : (
            <ul className="mt-2.5 max-h-60 space-y-1 overflow-y-auto">
              {favTools.map((tool) => {
                const c = categoryById(tool.category)
                return (
                  <li key={tool.id}>
                    <Link
                      to={`/tool/${tool.id}`}
                      onClick={() => setDrawer('none')}
                      className="group flex items-center gap-2.5 rounded-2xl px-2.5 py-2 transition hover:bg-slate-50 dark:hover:bg-slate-800/70"
                    >
                      <span
                        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl"
                        style={{ backgroundColor: `${c.color}18`, color: c.color }}
                      >
                        <tool.icon className="h-4 w-4" />
                      </span>
                      <span className="truncate text-xs font-bold text-ink-950 dark:text-white">{tool.name}</span>
                      <ArrowRight className="ml-auto h-3.5 w-3.5 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-accent" />
                    </Link>
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      )}

      {/* Session Outputs Tray above the dock */}
      {drawer === 'outputs' && (
        <div className="animate-bento-pop pointer-events-auto mb-2.5 w-full max-w-md overflow-hidden rounded-3xl border border-slate-200/90 bg-white/95 p-4 shadow-2xl dark:border-slate-700/80 dark:bg-[#0d1425]/95">
          <div className="flex items-center justify-between border-b border-slate-100 pb-2.5 dark:border-slate-800">
            <span className="flex items-center gap-1.5 font-display text-sm font-extrabold text-ink-950 dark:text-white">
              <History className="h-4 w-4 text-accent" /> Session Outputs ({outputs.length})
            </span>
            <div className="flex items-center gap-1.5">
              {outputs.length > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    clearSessionHistory()
                    showToast('Cleared session output tray', 'info')
                  }}
                  aria-label="Clear session outputs"
                  className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-bold text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/15 dark:hover:text-red-300"
                >
                  <Trash2 className="h-3 w-3" /> Clear
                </button>
              )}
              <button
                type="button"
                onClick={() => setDrawer('none')}
                aria-label="Close outputs drawer"
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-ink-950 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
          {outputs.length === 0 ? (
            <p className="py-5 text-center text-xs font-medium text-slate-500 dark:text-slate-400">
              Processed files from this session appear here for instant re-download or 1-click chaining into another tool.
            </p>
          ) : (
            <ul className="mt-2.5 max-h-64 space-y-1.5 overflow-y-auto">
              {outputs.map((item) => (
                <li
                  key={item.id}
                  className="flex items-center gap-2.5 rounded-2xl border border-slate-200/70 bg-slate-50/70 px-3 py-2 dark:border-slate-800 dark:bg-[#131d33]/80"
                >
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-extrabold text-ink-950 dark:text-white" title={item.fileName}>
                      {item.fileName}
                    </p>
                    <p className="truncate text-[10px] font-semibold text-slate-500 dark:text-slate-400">
                      {item.toolName} · {formatSize(item.size)}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => chainOutput(item)}
                    title="Send to next tool"
                    className="inline-flex items-center gap-1 rounded-xl border border-slate-200/90 bg-white px-2.5 py-1.5 text-[11px] font-bold text-ink-950 transition hover:border-accent hover:text-accent dark:border-slate-700 dark:bg-[#0d1425] dark:text-slate-200"
                  >
                    <Workflow className="h-3 w-3 text-accent" /> Chain
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadBlob(item.blob, item.fileName)}
                    title={`Download ${item.fileName}`}
                    aria-label={`Download ${item.fileName}`}
                    className="brand-grad flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-white shadow-2xs transition hover:brightness-110"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {/* Floating Glass Pill Dock */}
      <nav
        aria-label="Quick dock"
        className="pointer-events-auto flex items-center gap-1 rounded-3xl border border-slate-200/90 bg-white/92 p-1.5 shadow-lift backdrop-blur-md dark:border-slate-700/80 dark:bg-[#0d1425]/92"
      >
        <Link to="/" onClick={() => setDrawer('none')} className={itemCls(pathname === '/')} aria-label="Home">
          <Home className="h-4 w-4" />
          <span className="hidden sm:inline">Home</span>
        </Link>

        <Link to="/tools" onClick={() => setDrawer('none')} className={itemCls(pathname === '/tools')} aria-label="All tools">
          <LayoutGrid className="h-4 w-4" />
          <span className="hidden sm:inline">Tools</span>
        </Link>

        <button
          type="button"
          onClick={() => { setDrawer('none'); onOpenSearch() }}
          className="brand-grad flex h-10 items-center gap-1.5 rounded-2xl px-3.5 text-xs font-extrabold text-white shadow-sm transition hover:brightness-110"
          aria-label="Search tools"
        >
          <Search className="h-4 w-4" />
          <span>Search</span>
        </button>

        <button
          type="button"
          onClick={() => setDrawer((d) => (d === 'favs' ? 'none' : 'favs'))}
          aria-expanded={drawer === 'favs'}
          aria-label="Favorites drawer"
          className={itemCls(drawer === 'favs')}
        >
          <Star className={`h-4 w-4 ${favTools.length > 0 ? 'fill-amber-400 text-amber-500' : ''}`} />
          <span className="hidden sm:inline">Pinned</span>
          {favTools.length > 0 && (
            <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-600 dark:text-amber-300">
              {favTools.length}
            </span>
          )}
        </button>

        <button
          type="button"
          onClick={() => setDrawer((d) => (d === 'outputs' ? 'none' : 'outputs'))}
          aria-expanded={drawer === 'outputs'}
          aria-label="Session outputs tray"
          className={itemCls(drawer === 'outputs')}
        >
          <History className={`h-4 w-4 ${outputs.length > 0 ? 'text-teal-500' : ''}`} />
          <span className="hidden sm:inline">Outputs</span>
          {outputs.length > 0 && (
            <span className="rounded-full bg-teal-500/15 px-1.5 py-0.5 text-[10px] font-extrabold text-teal-600 dark:text-teal-300">
              {outputs.length}
            </span>
          )}
        </button>

        {showTop && (
          <button
            type="button"
            onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}
            aria-label="Back to top"
            className="flex h-10 w-10 items-center justify-center rounded-2xl text-slate-500 transition hover:bg-slate-100 hover:text-ink-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <ArrowUp className="h-4 w-4" />
          </button>
        )}
      </nav>
    </div>
  )
}
