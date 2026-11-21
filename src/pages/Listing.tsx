import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { Search, ArrowRight, ArrowUpRight, LayoutGrid, List, RotateCcw } from 'lucide-react'
import { CATEGORIES, TOOLS, categoryById, toolsByCategory, type CategoryId } from '../data/tools'
import ToolCard from '../components/ToolCard'
import { BorderBeam } from '../components/FuturisticPrimitives'

type FormatFilter = 'all' | 'pdf' | 'image' | 'docx' | 'xlsx' | 'pptx' | 'data'
type SortMode = 'default' | 'popular' | 'az'

const FORMAT_CHIPS: { id: FormatFilter; label: string; match: (acceptLabel: string, accept: string) => boolean }[] = [
  { id: 'all', label: 'All Formats', match: () => true },
  { id: 'pdf', label: 'PDF', match: (l, a) => /pdf/i.test(l) || /\.pdf/i.test(a) },
  { id: 'image', label: 'JPG / PNG / WebP', match: (l, a) => /jpg|png|webp|heic|svg|gif/i.test(l + a) },
  { id: 'docx', label: 'DOCX', match: (l, a) => /doc/i.test(l + a) },
  { id: 'xlsx', label: 'XLSX / CSV', match: (l, a) => /xls|csv/i.test(l + a) },
  { id: 'pptx', label: 'PPTX', match: (l, a) => /ppt/i.test(l + a) },
  { id: 'data', label: 'ZIP / JSON / XML', match: (l, a) => /zip|json|xml|html|txt|md/i.test(l + a) },
]

export function ToolsPage() {
  const [params] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [cat, setCat] = useState<'all' | CategoryId>('all')
  const [fmt, setFmt] = useState<FormatFilter>('all')
  const [sort, setSort] = useState<SortMode>('default')
  const [view, setView] = useState<'grid' | 'compact'>('grid')

  const list = useMemo(() => {
    const chip = FORMAT_CHIPS.find((c) => c.id === fmt) ?? FORMAT_CHIPS[0]
    const needle = q.trim().toLowerCase()
    const filtered = TOOLS.filter(
      (t) =>
        (cat === 'all' || t.category === cat) &&
        chip.match(t.acceptLabel, t.accept) &&
        (!needle || `${t.name} ${t.description} ${t.acceptLabel}`.toLowerCase().includes(needle)),
    )
    if (sort === 'popular') {
      return [...filtered].sort((a, b) => Number(!!b.popular) - Number(!!a.popular) || a.name.localeCompare(b.name))
    }
    if (sort === 'az') {
      return [...filtered].sort((a, b) => a.name.localeCompare(b.name))
    }
    return filtered
  }, [q, cat, fmt, sort])

  const hasActiveFilters = Boolean(q.trim() || cat !== 'all' || fmt !== 'all' || sort !== 'default')

  const resetFilters = () => {
    setQ('')
    setCat('all')
    setFmt('all')
    setSort('default')
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <nav aria-label="Breadcrumb" className="text-sm font-semibold text-slate-500 dark:text-slate-400">
        <Link to="/" className="hover:text-accent">Home</Link> <span aria-hidden>/</span>{' '}
        <span className="text-ink-950 dark:text-slate-200">All Tools</span>
      </nav>

      <div className="bento-card bento-dots glass-grain mt-4 p-6 sm:p-8">
        <BorderBeam durationSec={10} />
        <div className="relative z-10 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="display-section font-display font-extrabold text-ink-950 dark:text-white">
              All {TOOLS.length} tools
            </h1>
            <p className="mt-2 max-w-2xl text-slate-600 dark:text-slate-300">
              Every PDF, image, Office document and data utility — 100% free, zero sign-up, running privately in your browser.
            </p>
          </div>

          {/* Sort & View Density Switcher */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="segmented-track" role="group" aria-label="Sort tools">
              {([
                ['default', 'Default'],
                ['popular', 'Popular'],
                ['az', 'A–Z'],
              ] as [SortMode, string][]).map(([id, label]) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setSort(id)}
                  className={`segmented-pill !px-2.5 !py-1 ${sort === id ? 'segmented-pill-active' : 'segmented-pill-idle'}`}
                >
                  {label}
                </button>
              ))}
            </div>

            <div className="segmented-track" role="group" aria-label="View density">
              <button
                type="button"
                onClick={() => setView('grid')}
                aria-label="Grid card view"
                aria-pressed={view === 'grid'}
                className={`segmented-pill !px-2.5 !py-1 ${view === 'grid' ? 'segmented-pill-active' : 'segmented-pill-idle'}`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setView('compact')}
                aria-label="Compact list view"
                aria-pressed={view === 'compact'}
                className={`segmented-pill !px-2.5 !py-1 ${view === 'compact' ? 'segmented-pill-active' : 'segmented-pill-idle'}`}
              >
                <List className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Sticky Frosted Filter Toolbar */}
      <div className="glass-spatial sticky top-[76px] z-20 mt-4 !rounded-2xl p-3.5 sm:p-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <span className="sr-only">Search tools</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by tool name or format…" className="input !py-2.5 pl-10" />
          </label>
          <div className="flex flex-wrap gap-1.5" role="group" aria-label="Filter by category">
            <button
              type="button"
              onClick={() => setCat('all')}
              className={`rounded-full px-3.5 py-1.5 text-xs font-extrabold transition ${
                cat === 'all'
                  ? 'bg-ink-950 text-white shadow-xs dark:bg-white dark:text-ink-950'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-[#111a2e] dark:text-slate-300'
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
                  onClick={() => setCat(c.id)}
                  className={`rounded-full px-3.5 py-1.5 text-xs font-extrabold transition active:scale-[.97] ${
                    active ? 'text-white shadow-xs' : 'cat-pill hover:brightness-95 dark:hover:brightness-110'
                  }`}
                  style={active ? { backgroundColor: c.color } : undefined}
                >
                  {c.name.replace(' Tools', '')}
                </button>
              )
            })}
          </div>
        </div>

        {/* Format Quick-Filter Chips */}
        <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-slate-200/70 pt-3 dark:border-slate-800/80" role="group" aria-label="Filter by file format">
          <span className="mr-1 font-mono text-[10px] font-extrabold uppercase tracking-widest text-slate-400">Format:</span>
          {FORMAT_CHIPS.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setFmt(c.id)}
              className={`rounded-xl px-2.5 py-1 text-xs font-bold transition ${
                fmt === c.id
                  ? 'brand-grad text-white shadow-xs'
                  : 'border border-slate-200/90 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700/80 dark:bg-[#111a2e] dark:text-slate-300'
              }`}
            >
              {c.label}
            </button>
          ))}
          {hasActiveFilters && (
            <button
              type="button"
              onClick={resetFilters}
              className="ml-auto inline-flex items-center gap-1 rounded-xl px-2.5 py-1 text-xs font-bold text-slate-500 transition hover:bg-slate-100 hover:text-ink-950 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-white"
            >
              <RotateCcw className="h-3 w-3" /> Reset filters
            </button>
          )}
        </div>
      </div>

      <p className="mt-6 text-sm font-bold text-slate-500 dark:text-slate-400" role="status">
        {list.length} tool{list.length !== 1 ? 's' : ''} found
      </p>

      {list.length === 0 ? (
        <div className="bento-card mt-4 p-12 text-center">
          <p className="font-display text-lg font-extrabold text-ink-950 dark:text-white">No tools match your filters</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Try a different keyword or reset the category and format filters.</p>
          <button type="button" onClick={resetFilters} className="btn-accent mt-5 !py-2.5">
            <RotateCcw className="h-4 w-4" /> Reset all filters
          </button>
        </div>
      ) : view === 'grid' ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {list.map((t) => <ToolCard key={t.id} tool={t} />)}
        </div>
      ) : (
        <div className="mt-4 grid gap-2.5 md:grid-cols-2">
          {list.map((t) => {
            const c = categoryById(t.category)
            const Icon = t.icon
            return (
              <Link
                key={t.id}
                to={`/tool/${t.id}`}
                className="bento-card group flex items-center gap-3.5 px-4 py-3 hover:-translate-y-0.5 hover:border-slate-300/90 hover:shadow-card dark:hover:border-slate-700"
              >
                <span
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition group-hover:scale-105"
                  style={{ backgroundColor: `${c.color}18`, color: c.color }}
                >
                  <Icon className="h-5 w-5" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="truncate font-display text-sm font-bold text-ink-950 dark:text-white">{t.name}</span>
                    {t.popular && (
                      <span className="rounded-full bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-extrabold uppercase text-amber-600 dark:text-amber-300">
                        Hot
                      </span>
                    )}
                  </div>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">{t.description}</p>
                </div>
                <span
                  className="hidden shrink-0 rounded-lg px-2 py-0.5 text-[10px] font-extrabold uppercase sm:inline-block"
                  style={{ backgroundColor: `${c.color}15`, color: c.color }}
                >
                  {t.acceptLabel.split(',')[0].trim()}
                </span>
                <ArrowUpRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-accent" />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}

export function CategoryPage() {
  const { id } = useParams()
  const cat = CATEGORIES.find((c) => c.id === id)
  if (!cat) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-16 text-center">
        <h1 className="font-display text-2xl font-extrabold text-ink-950 dark:text-white">Category not found</h1>
        <Link to="/tools" className="btn-accent mt-5">Browse all tools</Link>
      </div>
    )
  }
  const list = toolsByCategory(cat.id)
  const Icon = cat.icon
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <nav aria-label="Breadcrumb" className="text-sm font-semibold text-slate-500 dark:text-slate-400">
        <Link to="/" className="hover:text-accent">Home</Link> <span aria-hidden>/</span>{' '}
        <Link to="/tools" className="hover:text-accent">All Tools</Link> <span aria-hidden>/</span>{' '}
        <span className="text-ink-950 dark:text-slate-200">{cat.name}</span>
      </nav>

      <div
        className="bento-card bento-dots glass-grain mt-4 p-6 sm:p-8"
        style={{ backgroundImage: `radial-gradient(480px circle at 95% 15%, ${cat.color}24, transparent 60%)` }}
      >
        <BorderBeam color={cat.color} durationSec={9} />
        <div className="relative z-10 flex flex-wrap items-start gap-5">
          <span
            className="icon-3d flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-white"
            style={{ backgroundColor: cat.color }}
          >
            <Icon className="h-8 w-8" />
          </span>
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink-950 dark:text-white sm:text-4xl">
                {cat.name}
              </h1>
              <span
                className="rounded-full px-3 py-1 text-xs font-extrabold"
                style={{ backgroundColor: `${cat.color}18`, color: cat.color }}
              >
                {list.length} tools
              </span>
            </div>
            <p className="mt-2 max-w-2xl text-slate-600 dark:text-slate-300">{cat.blurb}</p>
          </div>
        </div>
      </div>

      <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
        {list.map((t) => <ToolCard key={t.id} tool={t} />)}
      </div>

      <div className="mt-12 flex flex-wrap items-center gap-2">
        <span className="text-sm font-extrabold text-slate-500 dark:text-slate-400">Explore other toolkits:</span>
        {CATEGORIES.filter((c) => c.id !== cat.id).map((c) => (
          <Link
            key={c.id}
            to={`/category/${c.id}`}
            className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-extrabold transition hover:-translate-y-0.5"
            style={{ backgroundColor: `${c.color}16`, color: c.color }}
          >
            <c.icon className="h-3.5 w-3.5" />
            {c.name}
            <ArrowRight className="h-3 w-3" />
          </Link>
        ))}
      </div>
    </div>
  )
}
