import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { Search, ArrowRight } from 'lucide-react'
import { CATEGORIES, TOOLS, toolsByCategory, type CategoryId } from '../data/tools'
import ToolCard from '../components/ToolCard'

export function ToolsPage() {
  const [params] = useSearchParams()
  const [q, setQ] = useState(params.get('q') ?? '')
  const [cat, setCat] = useState<'all' | CategoryId>('all')
  const list = useMemo(() => TOOLS.filter((t) =>
    (cat === 'all' || t.category === cat) &&
    `${t.name} ${t.description} ${t.acceptLabel}`.toLowerCase().includes(q.trim().toLowerCase())), [q, cat])

  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <nav aria-label="Breadcrumb" className="text-sm font-semibold text-slate-500">
        <Link to="/" className="hover:text-accent">Home</Link> <span aria-hidden>/</span> All Tools
      </nav>

      <div className="bento-card bento-dots mt-4 p-6 sm:p-8">
        <h1 className="font-display text-3xl font-extrabold tracking-tight text-ink-950 dark:text-white sm:text-4xl">
          All {TOOLS.length} tools
        </h1>
        <p className="mt-2 max-w-2xl text-slate-600 dark:text-slate-300">
          Every PDF, image, Office document and data utility — 100% free, zero sign-up, running privately in your browser.
        </p>

        <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
          <label className="relative w-full max-w-md">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <span className="sr-only">Search tools</span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by tool name or format…" className="input pl-10" />
          </label>
          <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
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
                  onClick={() => setCat(c.id)}
                  className="rounded-full px-3.5 py-1.5 text-xs font-extrabold transition"
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
        </div>
      </div>

      <p className="mt-6 text-sm font-bold text-slate-500 dark:text-slate-400" role="status">
        {list.length} tool{list.length !== 1 ? 's' : ''} found
      </p>

      {list.length === 0 ? (
        <div className="bento-card mt-4 p-12 text-center">
          <p className="font-display text-lg font-extrabold text-ink-950 dark:text-white">No tools match your search</p>
          <p className="mt-1 text-sm text-slate-500">Try a different keyword or switch back to All categories.</p>
        </div>
      ) : (
        <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {list.map((t) => <ToolCard key={t.id} tool={t} />)}
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
      <nav aria-label="Breadcrumb" className="text-sm font-semibold text-slate-500">
        <Link to="/" className="hover:text-accent">Home</Link> <span aria-hidden>/</span>{' '}
        <Link to="/tools" className="hover:text-accent">All Tools</Link> <span aria-hidden>/</span> {cat.name}
      </nav>

      <div
        className="bento-card bento-dots mt-4 p-6 sm:p-8"
        style={{ backgroundImage: `radial-gradient(480px circle at 95% 15%, ${cat.color}24, transparent 60%)` }}
      >
        <div className="flex flex-wrap items-start gap-5">
          <span
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl text-white shadow-md"
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
