import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import { Search, ShieldCheck, Zap, MousePointerClick, Settings2, Download, Lock, Timer, ArrowRight, FileCheck2 } from 'lucide-react'
import { CATEGORIES, TOOLS, popularTools, toolById, type Tool } from '../data/tools'
import ToolCard from '../components/ToolCard'
import { getFavorites, getRecent, onPrefsChange } from '../lib/prefs'
import { useI18n } from '../lib/i18n'

export default function Home() {
  const [q, setQ] = useState('')
  const [favIds, setFavIds] = useState<string[]>(() => getFavorites())
  const [recentIds, setRecentIds] = useState<string[]>(() => getRecent())
  const { t } = useI18n()
  useEffect(() => onPrefsChange(() => { setFavIds(getFavorites()); setRecentIds(getRecent()) }), [])
  const favTools = useMemo(() => favIds.map((id) => toolById(id)).filter((x): x is Tool => !!x), [favIds])
  const recentTools = useMemo(() => recentIds.map((id) => toolById(id)).filter((x): x is Tool => !!x && !favIds.includes(x.id)), [recentIds, favIds])
  const navigate = useNavigate()
  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return []
    return TOOLS.filter((t) => `${t.name} ${t.description}`.toLowerCase().includes(s)).slice(0, 6)
  }, [q])

  return (
    <>
      {/* Hero — left aligned, asymmetric */}
      <section className="border-b border-slate-200 bg-white dark:border-slate-700/60 dark:bg-ink-900">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.05fr_.95fr] lg:items-center lg:py-20">
          <div>
            <p className="text-sm font-extrabold uppercase tracking-widest text-accent">{t('home.kicker')}</p>
            <h1 className="mt-4 font-display text-4xl font-extrabold leading-[1.08] tracking-tight text-ink-950 dark:text-white sm:text-5xl lg:text-[3.4rem]">
              {t('home.titleA')}<br />{t('home.titleB')}
            </h1>
            <p className="mt-5 max-w-lg text-lg leading-relaxed text-slate-600 dark:text-slate-300">
              {t('home.sub')}
            </p>
            <form role="search" className="relative mt-7 max-w-lg" onSubmit={(e) => { e.preventDefault(); navigate(`/tools?q=${encodeURIComponent(q)}`) }}>
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <label className="sr-only" htmlFor="hero-search">Search tools</label>
              <input id="hero-search" value={q} onChange={(e) => setQ(e.target.value)} placeholder='Try "compress pdf" or "resize image"…' className="input py-4 pl-12 pr-28 text-base shadow-card" autoComplete="off" />
              <button type="submit" className="absolute right-2 top-1/2 -translate-y-1/2 rounded-lg bg-ink-950 px-4 py-2 text-sm font-bold text-white hover:bg-ink-800">Search</button>
              {q.trim() && (
                <div className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-lift">
                  {results.length === 0
                    ? <p className="px-4 py-3 text-sm text-slate-500">No tools match “{q}”. <Link to="/tools" className="font-bold text-accent">Browse all tools</Link></p>
                    : results.map((t) => <Link key={t.id} to={`/tool/${t.id}`} className="flex items-center gap-3 px-4 py-3 hover:bg-slate-50"><t.icon className="h-4 w-4 text-accent" /><span className="text-sm font-bold text-ink-950">{t.name}</span><span className="truncate text-xs text-slate-500">{t.description}</span></Link>)}
                </div>
              )}
            </form>
            <dl className="mt-8 flex flex-wrap gap-x-8 gap-y-3">
              {[[`${TOOLS.length}`, 'tools in registry'], ['100%', 'free, no sign-up'], ['≤60 min', 'max file retention']].map(([v, l]) => (
                <div key={l}><dt className="sr-only">{l}</dt><dd className="font-display text-xl font-extrabold text-ink-950">{v}</dd><dd className="text-xs font-semibold text-slate-500">{l}</dd></div>
              ))}
            </dl>
          </div>

          {/* Quick-start panel — routes to real tool pages, never fakes processing */}
          <div className="card p-6 sm:p-7">
            <p className="font-display text-base font-bold text-ink-950">Start in seconds</p>
            <p className="mt-1 text-sm text-slate-500">Pick a popular tool, drop your file on its page, download the result.</p>
            <div className="mt-5 grid grid-cols-2 gap-3">
              {popularTools.slice(0, 6).map((t) => (
                <Link key={t.id} to={`/tool/${t.id}`} className="rounded-xl border border-slate-200 p-3.5 transition hover:border-accent/50 hover:bg-accent-soft/40">
                  <t.icon className="h-5 w-5 text-accent" />
                  <span className="mt-2 block text-sm font-bold text-ink-950">{t.name}</span>
                  <span className="text-xs text-slate-500">{t.acceptLabel}</span>
                </Link>
              ))}
            </div>
            <Link to="/tools" className="btn-ghost mt-5 w-full">Browse all {TOOLS.length} tools <ArrowRight className="h-4 w-4" /></Link>
            <p className="mt-4 flex items-center gap-2 text-xs font-semibold text-slate-500"><ShieldCheck className="h-4 w-4 shrink-0 text-teal2" /> Files are processed temporarily and auto-deleted. Nothing is stored permanently.</p>
          </div>
        </div>
      </section>

      {/* Favorites + recent (local only) */}
      {(favTools.length > 0 || recentTools.length > 0) && (
        <section className="mx-auto max-w-7xl px-4 pt-12 sm:px-6" aria-label="Your tools">
          {favTools.length > 0 && (
            <>
              <h2 className="font-display text-xl font-extrabold text-ink-950 dark:text-white">{t('common.favorites')}</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{favTools.slice(0, 8).map((tool) => <ToolCard key={tool.id} tool={tool} />)}</div>
            </>
          )}
          {recentTools.length > 0 && (
            <>
              <h2 className="mt-8 font-display text-xl font-extrabold text-ink-950 dark:text-white">{t('common.recent')}</h2>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{recentTools.slice(0, 4).map((tool) => <ToolCard key={tool.id} tool={tool} />)}</div>
            </>
          )}
        </section>
      )}

      {/* Categories */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6" aria-labelledby="cats">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h2 id="cats" className="font-display text-2xl font-extrabold text-ink-950 sm:text-3xl">Browse by category</h2><p className="mt-1 text-slate-600">Six toolkits covering documents, images and data files.</p></div>
          <Link to="/tools" className="text-sm font-bold text-accent hover:underline">View all tools →</Link>
        </div>
        <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {CATEGORIES.map((c) => {
            const count = TOOLS.filter((t) => t.category === c.id).length
            return (
              <Link key={c.id} to={`/category/${c.id}`} className="card group p-6 transition hover:-translate-y-0.5 hover:shadow-lift">
                <span className="flex h-12 w-12 items-center justify-center rounded-xl" style={{ background: c.soft, color: c.color }}><c.icon className="h-6 w-6" /></span>
                <span className="mt-4 block font-display text-lg font-bold text-ink-950">{c.name}</span>
                <span className="mt-1 block text-sm leading-relaxed text-slate-500">{c.blurb}</span>
                <span className="mt-4 inline-flex items-center gap-1 text-sm font-bold" style={{ color: c.color }}>{count} tools <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" /></span>
              </Link>
            )
          })}
        </div>
      </section>

      {/* Popular tools */}
      <section className="border-y border-slate-200 bg-white" aria-labelledby="pop">
        <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6">
          <h2 id="pop" className="font-display text-2xl font-extrabold text-ink-950 sm:text-3xl">Most popular tools</h2>
          <p className="mt-1 text-slate-600">The tools people reach for every day.</p>
          <div className="mt-7 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">{popularTools.map((t) => <ToolCard key={t.id} tool={t} />)}</div>
        </div>
      </section>

      {/* How it works */}
      <section className="mx-auto max-w-7xl px-4 py-14 sm:px-6" aria-labelledby="how">
        <h2 id="how" className="font-display text-2xl font-extrabold text-ink-950 sm:text-3xl">How it works</h2>
        <ol className="mt-7 grid gap-4 md:grid-cols-3">
          {[
            { icon: MousePointerClick, n: '1', t: 'Choose a tool & upload', d: 'Pick from the registry and drop your file in. Format and size are validated before anything runs.' },
            { icon: Settings2, n: '2', t: 'Configure & process', d: 'Set the options that matter — quality, pages, slides or sheets — then run real processing, never a simulation.' },
            { icon: Download, n: '3', t: 'Preview & download', d: 'Check sizes and savings, download your result, and files are automatically deleted.' },
          ].map((s) => (
            <li key={s.n} className="card p-6">
              <span className="flex items-center justify-between"><s.icon className="h-6 w-6 text-accent" /><span className="font-display text-3xl font-extrabold text-slate-200">{s.n}</span></span>
              <p className="mt-4 font-display text-base font-bold text-ink-950">{s.t}</p><p className="mt-1.5 text-sm leading-relaxed text-slate-500">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* Privacy */}
      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6" aria-labelledby="privacy">
        <div className="overflow-hidden rounded-3xl bg-ink-950 px-6 py-10 text-white sm:px-10">
          <div className="grid gap-8 lg:grid-cols-[1fr_auto] lg:items-center">
            <div>
              <h2 id="privacy" className="font-display text-2xl font-extrabold sm:text-3xl">Private by design</h2>
              <p className="mt-2 max-w-xl text-slate-300">No accounts. No permanent storage. Uploaded files live in isolated temporary folders, are processed, then deleted — with a hard maximum retention of 60 minutes.</p>
              <Link to="/privacy" className="mt-5 inline-flex items-center gap-1 text-sm font-bold text-white underline underline-offset-4">Read the privacy notice <ArrowRight className="h-4 w-4" /></Link>
            </div>
            <ul className="grid gap-3 text-sm font-semibold sm:grid-cols-3 lg:w-[430px] lg:grid-cols-1 xl:grid-cols-3">
              {[{ icon: Lock, t: 'Isolated job folders' }, { icon: Timer, t: 'Auto-delete ≤ 60 min' }, { icon: FileCheck2, t: 'Output validated first' }].map((f) => (
                <li key={f.t} className="rounded-xl bg-white/5 px-4 py-3 ring-1 ring-white/10"><f.icon className="mb-2 h-5 w-5 text-teal2" />{f.t}</li>
              ))}
            </ul>
          </div>
          <p className="mt-6 flex items-center gap-2 text-xs text-slate-400"><Zap className="h-4 w-4" /> Browser-side processing is used wherever practical, so files never leave your device for those tools.</p>
        </div>
      </section>
    </>
  )
}
