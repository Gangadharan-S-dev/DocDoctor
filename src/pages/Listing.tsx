import { useMemo, useState } from 'react'
import { Link, useParams, useSearchParams } from 'react-router'
import { Search } from 'lucide-react'
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
      <nav aria-label="Breadcrumb" className="text-sm font-semibold text-slate-500"><Link to="/" className="hover:text-accent">Home</Link> <span aria-hidden>/</span> All Tools</nav>
      <h1 className="mt-3 font-display text-3xl font-extrabold text-ink-950 sm:text-4xl">All tools</h1>
      <p className="mt-2 max-w-2xl text-slate-600">{TOOLS.length} tools across PDF, images, Office documents and data files. Processing engines ship phase by phase — every tool page states its real status.</p>
      <div className="mt-6 flex flex-col gap-3 lg:flex-row lg:items-center">
        <label className="relative w-full max-w-md">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <span className="sr-only">Search tools</span>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search tools…" className="input pl-10" />
        </label>
        <div className="flex flex-wrap gap-2" role="group" aria-label="Filter by category">
          <button type="button" onClick={() => setCat('all')} className={`chip ${cat === 'all' ? '!border-ink-950 !bg-ink-950 !text-white' : ''}`}>All</button>
          {CATEGORIES.map((c) => (
            <button key={c.id} type="button" onClick={() => setCat(c.id)} className={`chip ${cat === c.id ? '!border-ink-950 !bg-ink-950 !text-white' : ''}`}>{c.name}</button>
          ))}
        </div>
      </div>
      <p className="mt-5 text-sm font-semibold text-slate-500" role="status">{list.length} tool{list.length !== 1 ? 's' : ''} found</p>
      {list.length === 0
        ? <div className="card mt-4 p-10 text-center"><p className="font-display font-bold text-ink-950">No tools match your search</p><p className="mt-1 text-sm text-slate-500">Try a different keyword or category.</p></div>
        : <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{list.map((t) => <ToolCard key={t.id} tool={t} />)}</div>}
    </div>
  )
}

export function CategoryPage() {
  const { id } = useParams()
  const cat = CATEGORIES.find((c) => c.id === id)
  if (!cat) return <div className="mx-auto max-w-3xl px-4 py-16 text-center"><h1 className="font-display text-2xl font-extrabold">Category not found</h1><Link to="/tools" className="btn-accent mt-5">Browse all tools</Link></div>
  const list = toolsByCategory(cat.id)
  const Icon = cat.icon
  return (
    <div className="mx-auto max-w-7xl px-4 py-10 sm:px-6">
      <nav aria-label="Breadcrumb" className="text-sm font-semibold text-slate-500"><Link to="/" className="hover:text-accent">Home</Link> <span aria-hidden>/</span> <Link to="/tools" className="hover:text-accent">All Tools</Link> <span aria-hidden>/</span> {cat.name}</nav>
      <div className="mt-5 flex items-start gap-4">
        <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl" style={{ background: cat.soft, color: cat.color }}><Icon className="h-7 w-7" /></span>
        <div><h1 className="font-display text-3xl font-extrabold text-ink-950 sm:text-4xl">{cat.name}</h1><p className="mt-1.5 max-w-2xl text-slate-600">{cat.blurb}</p></div>
      </div>
      <p className="mt-6 text-sm font-semibold text-slate-500">{list.length} tools</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">{list.map((t) => <ToolCard key={t.id} tool={t} />)}</div>
      <div className="mt-10 flex flex-wrap gap-2">
        <span className="text-sm font-bold text-slate-500">Other categories:</span>
        {CATEGORIES.filter((c) => c.id !== cat.id).map((c) => <Link key={c.id} to={`/category/${c.id}`} className="chip hover:border-accent hover:text-accent">{c.name}</Link>)}
      </div>
    </div>
  )
}

