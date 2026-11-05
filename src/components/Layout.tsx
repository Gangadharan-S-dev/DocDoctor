import { useState } from 'react'
import { Link, NavLink, useNavigate } from 'react-router-dom'
import { Stethoscope, Menu, X, Search, ShieldCheck, ChevronDown } from 'lucide-react'
import { CATEGORIES } from '../data/tools'

export function Logo() {
  return (
    <Link to="/" className="flex items-center gap-2.5" aria-label="DocDoctor home">
      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-ink-950 text-white"><Stethoscope className="h-5 w-5" /></span>
      <span className="font-display text-xl font-extrabold tracking-tight text-ink-950">Doc<span className="text-accent">Doctor</span></span>
    </Link>
  )
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false)
  const [q, setQ] = useState('')
  const navigate = useNavigate()
  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `rounded-lg px-3 py-2 text-sm font-bold transition ${isActive ? 'bg-slate-100 text-ink-950' : 'text-slate-600 hover:bg-slate-50 hover:text-ink-950'}`

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-ink-950 focus:px-4 focus:py-2 focus:text-white">Skip to content</a>
      <header className="sticky top-0 z-40 border-b border-slate-200/80 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-[68px] max-w-7xl items-center gap-3 px-4 sm:px-6">
          <Logo />
          <nav className="ml-4 hidden items-center gap-1 lg:flex" aria-label="Primary">
            <NavLink to="/" end className={linkCls}>Home</NavLink>
            <NavLink to="/tools" className={linkCls}>All Tools</NavLink>
            <div className="group relative">
              <button type="button" className="flex items-center gap-1 rounded-lg px-3 py-2 text-sm font-bold text-slate-600 hover:bg-slate-50 hover:text-ink-950">Categories <ChevronDown className="h-4 w-4" /></button>
              <div className="invisible absolute left-0 top-full w-72 rounded-2xl border border-slate-200 bg-white p-2 opacity-0 shadow-lift transition group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                {CATEGORIES.map((c) => (
                  <Link key={c.id} to={`/category/${c.id}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-slate-50">
                    <span className="flex h-9 w-9 items-center justify-center rounded-lg" style={{ background: c.soft, color: c.color }}><c.icon className="h-4.5 w-4.5" /></span>
                    <span><span className="block text-sm font-bold text-ink-950">{c.name}</span><span className="block text-xs text-slate-500">{c.tagline}</span></span>
                  </Link>
                ))}
              </div>
            </div>
            <NavLink to="/about" className={linkCls}>About</NavLink>
          </nav>
          <form className="ml-auto hidden max-w-xs flex-1 md:block" role="search" onSubmit={(e) => { e.preventDefault(); navigate(`/tools?q=${encodeURIComponent(q)}`) }}>
            <label className="relative block">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <span className="sr-only">Search tools</span>
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search 75 tools…" className="input py-2.5 pl-9" />
            </label>
          </form>
          <span className="chip ml-auto hidden shrink-0 sm:inline-flex md:ml-0"><ShieldCheck className="h-3.5 w-3.5 text-teal2" /> Free · No sign-up</span>
          <button type="button" className="rounded-lg p-2 hover:bg-slate-100 lg:hidden" aria-label="Toggle menu" aria-expanded={open} onClick={() => setOpen(!open)}>{open ? <X className="h-6 w-6" /> : <Menu className="h-6 w-6" />}</button>
        </div>
        {open && (
          <nav className="border-t border-slate-100 bg-white px-4 py-3 lg:hidden" aria-label="Mobile">
            <NavLink to="/" end onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm font-bold">Home</NavLink>
            <NavLink to="/tools" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm font-bold">All Tools</NavLink>
            {CATEGORIES.map((c) => <NavLink key={c.id} to={`/category/${c.id}`} onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm font-bold">{c.name}</NavLink>)}
            <NavLink to="/about" onClick={() => setOpen(false)} className="block rounded-lg px-3 py-2.5 text-sm font-bold">About</NavLink>
          </nav>
        )}
      </header>

      <main id="main" className="flex-1">{children}</main>

      <footer className="border-t border-slate-200 bg-ink-950 text-slate-300">
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <p className="font-display text-xl font-extrabold text-white">Doc<span className="text-accent">Doctor</span></p>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-400">Every file. Every tool. One place. Free file tools with automatic deletion — files are processed temporarily and never stored permanently.</p>
          </div>
          {CATEGORIES.slice(0, 3).map((c) => (
            <nav key={c.id} aria-label={c.name}>
              <p className="text-sm font-bold text-white">{c.name}</p>
              <ul className="mt-3 space-y-2 text-sm">
                <li><Link className="hover:text-white" to={`/category/${c.id}`}>View all {c.name.toLowerCase()}</Link></li>
                <li><Link className="hover:text-white" to="/tools">All tools</Link></li>
              </ul>
            </nav>
          ))}
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-5 text-xs text-slate-400 sm:px-6">
            <span>© {new Date().getFullYear()} DocDoctor. Free to use.</span>
            <Link to="/privacy" className="hover:text-white">Privacy</Link>
            <Link to="/about" className="hover:text-white">About</Link>
            <span className="ml-auto inline-flex items-center gap-1.5"><ShieldCheck className="h-3.5 w-3.5" /> Auto-delete after processing · Max retention 60 min</span>
          </div>
        </div>
      </footer>
    </div>
  )
}
