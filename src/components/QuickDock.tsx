import { useEffect, useMemo, useState } from 'react'
import { Link, useLocation } from 'react-router'
import { Home, LayoutGrid, Search, Star, ArrowUp, X, ArrowRight } from 'lucide-react'
import { categoryById, toolById, type Tool } from '../data/tools'
import { getFavorites, onPrefsChange } from '../lib/prefs'

export default function QuickDock({ onOpenSearch }: { onOpenSearch: () => void }) {
  const { pathname } = useLocation()
  const [favIds, setFavIds] = useState<string[]>(() => getFavorites())
  const [drawerOpen, setDrawerOpen] = useState(false)
  const [showTop, setShowTop] = useState(false)

  useEffect(() => onPrefsChange(() => setFavIds(getFavorites())), [])

  useEffect(() => {
    const onScroll = () => setShowTop(window.scrollY > 340)
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  const favTools = useMemo(
    () => favIds.map((id) => toolById(id)).filter((t): t is Tool => !!t),
    [favIds],
  )

  const itemCls = (active: boolean) =>
    `flex h-10 items-center gap-1.5 rounded-2xl px-3 text-xs font-extrabold transition ${
      active
        ? 'bg-ink-950 text-white shadow-xs dark:bg-white dark:text-ink-950'
        : 'text-slate-600 hover:bg-slate-100 hover:text-ink-950 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
    }`

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-4 z-30 flex flex-col items-center px-4 print:hidden">
      {/* Favorites Mini-Drawer above the dock */}
      {drawerOpen && (
        <div className="animate-bento-pop pointer-events-auto mb-2.5 w-full max-w-sm overflow-hidden rounded-3xl border border-slate-200/90 bg-white/95 p-4 shadow-2xl backdrop-blur-xl dark:border-slate-700/80 dark:bg-[#0e1525]/95">
          <div className="flex items-center justify-between pb-2.5 border-b border-slate-100 dark:border-slate-800">
            <span className="flex items-center gap-1.5 font-display text-sm font-extrabold text-ink-950 dark:text-white">
              <Star className="h-4 w-4 fill-amber-400 text-amber-500" /> Pinned Favorites ({favTools.length})
            </span>
            <button
              type="button"
              onClick={() => setDrawerOpen(false)}
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
                      onClick={() => setDrawerOpen(false)}
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

      {/* Floating Glass Pill Dock */}
      <nav
        aria-label="Quick dock"
        className="pointer-events-auto flex items-center gap-1 rounded-3xl border border-slate-200/90 bg-white/85 p-1.5 shadow-lift backdrop-blur-xl dark:border-slate-700/80 dark:bg-[#0e1525]/85"
      >
        <Link to="/" onClick={() => setDrawerOpen(false)} className={itemCls(pathname === '/')} aria-label="Home">
          <Home className="h-4 w-4" />
          <span className="hidden sm:inline">Home</span>
        </Link>

        <Link to="/tools" onClick={() => setDrawerOpen(false)} className={itemCls(pathname === '/tools')} aria-label="All tools">
          <LayoutGrid className="h-4 w-4" />
          <span className="hidden sm:inline">Tools</span>
        </Link>

        <button
          type="button"
          onClick={() => { setDrawerOpen(false); onOpenSearch() }}
          className="brand-grad flex h-10 items-center gap-1.5 rounded-2xl px-3.5 text-xs font-extrabold text-white shadow-sm transition hover:brightness-110"
          aria-label="Search tools"
        >
          <Search className="h-4 w-4" />
          <span>Search</span>
        </button>

        <button
          type="button"
          onClick={() => setDrawerOpen((o) => !o)}
          aria-expanded={drawerOpen}
          aria-label="Favorites drawer"
          className={itemCls(drawerOpen)}
        >
          <Star className={`h-4 w-4 ${favTools.length > 0 ? 'fill-amber-400 text-amber-500' : ''}`} />
          <span className="hidden sm:inline">Pinned</span>
          {favTools.length > 0 && (
            <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-extrabold text-amber-600 dark:text-amber-300">
              {favTools.length}
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
