import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router'
import { Stethoscope, Menu, X, Search, ShieldCheck, ChevronDown, Moon, Sun, Sparkles } from 'lucide-react'
import { CATEGORIES, TOOLS } from '../data/tools'
import { LANGS, useI18n, type Lang } from '../lib/i18n'
import DeveloperContact from './DeveloperContact'
import CommandPalette from './CommandPalette'
import Toaster from './Toaster'
import GlobalDropPortal from './GlobalDropPortal'
import QuickDock from './QuickDock'
import { ScrollProgressBar } from './FuturisticPrimitives'
import { showToast } from '../lib/toast'
import { runThemeTransition, syncThemeColor } from '../lib/viewTransition'

type AccentId = 'cobalt' | 'coral' | 'emerald' | 'violet'
const ACCENTS: { id: AccentId; label: string; dot: string }[] = [
  { id: 'cobalt', label: 'Cobalt', dot: '#2563eb' },
  { id: 'coral', label: 'Coral', dot: '#f43f5e' },
  { id: 'emerald', label: 'Emerald', dot: '#059669' },
  { id: 'violet', label: 'Violet', dot: '#7c3aed' },
]

function useAccent(): [AccentId, (next: AccentId) => void] {
  const [accent, setAccentState] = useState<AccentId>(() => {
    try {
      const saved = localStorage.getItem('docdoctor:accent') as AccentId | null
      if (saved && ACCENTS.some((a) => a.id === saved)) return saved
    } catch { /* ignore */ }
    return 'cobalt'
  })
  useEffect(() => {
    document.documentElement.dataset.accent = accent
    try { localStorage.setItem('docdoctor:accent', accent) } catch { /* ignore */ }
  }, [accent])
  const setAccent = (next: AccentId) => {
    setAccentState(next)
    const meta = ACCENTS.find((a) => a.id === next)
    if (meta) showToast(`Studio accent: ${meta.label}`, 'accent')
  }
  return [accent, setAccent]
}

export function Logo() {
  return (
    <Link to="/" className="group flex items-center gap-2 sm:gap-2.5" aria-label="DocDoctor home">
      <span className="brand-grad icon-3d flex h-9 w-9 items-center justify-center rounded-2xl text-white transition duration-200 group-hover:scale-105 sm:h-10 sm:w-10">
        <Stethoscope className="h-4.5 w-4.5 sm:h-5 sm:w-5" />
      </span>
      <span className="font-display text-lg font-extrabold tracking-tight text-ink-950 dark:text-white sm:text-xl">
        Doc<span className="brand-text-grad">Doctor</span>
      </span>
    </Link>
  )
}

function useTheme(): [boolean, () => void] {
  const [dark, setDark] = useState<boolean>(() => {
    try {
      const saved = localStorage.getItem('docdoctor:theme')
      if (saved) return saved === 'dark'
    } catch { /* ignore */ }
    return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: dark)').matches
  })
  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    syncThemeColor(dark)
    try { localStorage.setItem('docdoctor:theme', dark ? 'dark' : 'light') } catch { /* ignore */ }
  }, [dark])

  const toggle = () => {
    const next = !dark
    runThemeTransition(() => {
      document.documentElement.classList.toggle('dark', next)
      syncThemeColor(next)
      setDark(next)
    })
  }

  return [dark, toggle]
}

export default function Layout({ children }: { children: React.ReactNode }) {
  const { pathname } = useLocation()
  const [open, setOpen] = useState(false)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [dark, toggleTheme] = useTheme()
  const [accent, setAccent] = useAccent()
  const { lang, setLang, t } = useI18n()

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((prev) => !prev)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  const linkCls = ({ isActive }: { isActive: boolean }) =>
    `rounded-xl px-3.5 py-2 text-sm font-bold transition ${
      isActive
        ? 'bg-ink-950 text-white shadow-xs dark:bg-white dark:text-ink-950'
        : 'text-slate-600 hover:bg-slate-100/80 hover:text-ink-950 dark:text-slate-300 dark:hover:bg-slate-800/80 dark:hover:text-white'
    }`

  return (
    <div className="flex min-h-screen flex-col">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-xl focus:bg-ink-950 focus:px-4 focus:py-2 focus:text-white">
        Skip to content
      </a>

      <header className="glass-bar sticky top-0 z-40">
        <ScrollProgressBar />
        <div className="mx-auto flex h-[68px] max-w-7xl items-center gap-1.5 px-3 sm:h-[72px] sm:gap-3 sm:px-6">
          <div className="shrink-0">
            <Logo />
          </div>

          <nav className="ml-3 hidden items-center gap-1 lg:flex" aria-label="Primary">
            <NavLink to="/" end className={linkCls}>{t('nav.home')}</NavLink>
            <NavLink to="/tools" className={linkCls}>{t('nav.allTools')}</NavLink>
            <div className="group relative">
              <button
                type="button"
                className="flex items-center gap-1 rounded-xl px-3.5 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-100/80 hover:text-ink-950 dark:text-slate-300 dark:hover:bg-slate-800/80 dark:hover:text-white"
              >
                {t('nav.categories')} <ChevronDown className="h-4 w-4 transition group-hover:rotate-180" />
              </button>
              <div className="invisible absolute left-0 top-full pt-2 opacity-0 transition duration-150 group-hover:visible group-hover:opacity-100 group-focus-within:visible group-focus-within:opacity-100">
                <div className="grid w-[520px] grid-cols-2 gap-2 rounded-3xl border border-slate-200/90 bg-white/95 p-3 shadow-lift backdrop-blur-xl dark:border-slate-700/80 dark:bg-[#0e1525]/95">
                  {CATEGORIES.map((c) => {
                    const count = TOOLS.filter((tool) => tool.category === c.id).length
                    return (
                      <Link
                        key={c.id}
                        to={`/category/${c.id}`}
                        data-category={c.id}
                        className="group/item flex items-center gap-3 rounded-2xl p-3 transition hover:bg-slate-50 dark:hover:bg-slate-800/70"
                      >
                        <span className="cat-icon-soft flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition group-hover/item:scale-105">
                          <c.icon className="h-5 w-5" />
                        </span>
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span className="text-sm font-bold text-ink-950 dark:text-slate-100">{c.name}</span>
                            <span className="cat-pill rounded-full px-1.5 py-0.5 font-mono text-[10px] font-bold tabular-nums">
                              {count}
                            </span>
                          </span>
                          <span className="block truncate text-xs text-slate-500 dark:text-slate-400">{c.tagline}</span>
                        </span>
                      </Link>
                    )
                  })}
                </div>
              </div>
            </div>
            <NavLink to="/about" className={linkCls}>{t('nav.about')}</NavLink>
          </nav>

          {/* Command Palette Trigger */}
          <button
            type="button"
            onClick={() => setPaletteOpen(true)}
            aria-label="Search tools (Ctrl+K)"
            className="ml-auto flex h-9 w-9 shrink-0 items-center justify-center gap-2.5 rounded-2xl border border-slate-200/90 bg-slate-100/70 px-0 text-left text-sm font-semibold text-slate-500 transition hover:border-accent/40 hover:bg-white hover:text-ink-950 hover:shadow-xs dark:border-slate-700/80 dark:bg-[#111a2e] dark:text-slate-400 dark:hover:border-blue-500/40 dark:hover:bg-[#162238] dark:hover:text-white sm:h-10 sm:w-auto sm:min-w-0 sm:flex-1 sm:justify-start sm:px-3.5 md:max-w-[280px]"
          >
            <Search className="h-4 w-4 shrink-0 text-accent" />
            <span className="hidden truncate sm:inline">{t('nav.searchPlaceholder')}</span>
            <kbd className="kbd-key ml-auto hidden shrink-0 px-2 sm:inline-flex">
              Ctrl K
            </kbd>
          </button>

          <span className="hidden shrink-0 items-center gap-1.5 rounded-full border border-teal-200/80 bg-teal-50/80 px-3 py-1.5 text-xs font-extrabold text-teal-700 dark:border-teal-500/30 dark:bg-teal-500/10 dark:text-teal-300 xl:inline-flex">
            <ShieldCheck className="h-3.5 w-3.5" /> {t('nav.free')}
          </span>

          {/* Arc-style Studio Accent Picker */}
          <div className="hidden shrink-0 items-center gap-1 rounded-xl border border-slate-200/80 bg-white px-2 py-1.5 dark:border-slate-700/80 dark:bg-[#111a2e] sm:flex" role="group" aria-label="Studio accent color">
            {ACCENTS.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setAccent(a.id)}
                title={`${a.label} accent`}
                aria-label={`${a.label} accent`}
                aria-pressed={accent === a.id}
                className={`h-4 w-4 rounded-full transition duration-150 ${
                  accent === a.id ? 'scale-115 ring-2 ring-slate-900 ring-offset-2 dark:ring-white dark:ring-offset-[#111a2e]' : 'opacity-65 hover:scale-110 hover:opacity-100'
                }`}
                style={{ backgroundColor: a.dot }}
              />
            ))}
          </div>

          <label className="sr-only" htmlFor="lang-select">Language</label>
          <select
            id="lang-select"
            value={lang}
            onChange={(e) => setLang(e.target.value as Lang)}
            className="shrink-0 rounded-xl border border-slate-200/90 bg-white px-2 py-2 text-xs font-bold text-slate-600 transition hover:border-slate-300 dark:border-slate-700/80 dark:bg-[#111a2e] dark:text-slate-200 sm:px-2.5"
            aria-label="Language"
          >
            {LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
          </select>

          <button
            type="button"
            onClick={toggleTheme}
            aria-label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-600 transition hover:border-slate-300 hover:bg-slate-50 active:scale-95 dark:border-slate-700/80 dark:bg-[#111a2e] dark:text-amber-300 dark:hover:bg-slate-800 sm:h-10 sm:w-10"
          >
            {dark ? (
              <Sun key="sun" className="animate-theme-icon h-4.5 w-4.5" />
            ) : (
              <Moon key="moon" className="animate-theme-icon h-4.5 w-4.5" />
            )}
          </button>

          <button
            type="button"
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-slate-200/80 bg-white text-slate-700 hover:bg-slate-50 dark:border-slate-700/80 dark:bg-[#111a2e] dark:text-slate-200 sm:h-10 sm:w-10 lg:hidden"
            aria-label="Toggle menu"
            aria-expanded={open}
            onClick={() => setOpen(!open)}
          >
            {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>

        {open && (
          <nav className="border-t border-slate-200/80 bg-white/95 px-4 py-4 backdrop-blur-xl dark:border-slate-800 dark:bg-[#0b1120]/95 lg:hidden" aria-label="Mobile">
            <div className="grid grid-cols-2 gap-2">
              <NavLink to="/" end onClick={() => setOpen(false)} className="rounded-2xl bg-slate-100/80 px-4 py-3 text-sm font-bold text-ink-950 dark:bg-slate-800/70 dark:text-white">{t('nav.home')}</NavLink>
              <NavLink to="/tools" onClick={() => setOpen(false)} className="rounded-2xl bg-slate-100/80 px-4 py-3 text-sm font-bold text-ink-950 dark:bg-slate-800/70 dark:text-white">{t('nav.allTools')}</NavLink>
              {CATEGORIES.map((c) => (
                <NavLink
                  key={c.id}
                  to={`/category/${c.id}`}
                  data-category={c.id}
                  onClick={() => setOpen(false)}
                  className="cat-pill flex items-center gap-2 rounded-2xl px-3.5 py-2.5 text-sm font-bold"
                >
                  <c.icon className="h-4 w-4 shrink-0" />
                  <span className="truncate">{c.name.replace(' Tools', '')}</span>
                </NavLink>
              ))}
              <NavLink to="/about" onClick={() => setOpen(false)} className="col-span-2 rounded-2xl border border-slate-200 px-4 py-2.5 text-center text-sm font-bold text-slate-600 dark:border-slate-700 dark:text-slate-300">{t('nav.about')}</NavLink>
            </div>
            <div className="mt-3 flex items-center justify-between rounded-2xl border border-slate-200/80 bg-slate-50/80 px-3.5 py-2.5 dark:border-slate-800 dark:bg-[#101828]" role="group" aria-label="Mobile studio accent color">
              <span className="text-xs font-extrabold text-slate-600 dark:text-slate-300">Studio accent</span>
              <div className="flex items-center gap-2">
                {ACCENTS.map((a) => (
                  <button
                    key={a.id}
                    type="button"
                    onClick={() => setAccent(a.id)}
                    aria-label={`${a.label} accent`}
                    aria-pressed={accent === a.id}
                    className={`h-5 w-5 rounded-full transition duration-150 ${
                      accent === a.id ? 'scale-115 ring-2 ring-slate-900 ring-offset-2 dark:ring-white dark:ring-offset-[#101828]' : 'opacity-70'
                    }`}
                    style={{ backgroundColor: a.dot }}
                  />
                ))}
              </div>
            </div>
          </nav>
        )}
      </header>

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        dark={dark}
        onToggleTheme={toggleTheme}
        accent={accent}
        onSetAccent={setAccent}
        lang={lang}
        onToggleLang={() => setLang(lang === 'en' ? 'es' : 'en')}
      />
      <GlobalDropPortal />
      <QuickDock onOpenSearch={() => setPaletteOpen(true)} />
      <Toaster />

      <main id="main" key={pathname} className="animate-page-enter flex-1">{children}</main>

      <footer className="mt-8 border-t border-slate-200/80 bg-[#070b14] pb-20 text-slate-300 dark:border-slate-800/90">
        <div className="brand-grad h-1 w-full" />
        <div className="mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:grid-cols-2 sm:px-6 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <div className="flex items-center gap-2.5">
              <span className="brand-grad flex h-9 w-9 items-center justify-center rounded-xl text-white shadow-sm">
                <Stethoscope className="h-4.5 w-4.5" />
              </span>
              <p className="font-display text-xl font-extrabold text-white">Doc<span className="brand-text-grad">Doctor</span></p>
            </div>
            <p className="mt-3 max-w-sm text-sm leading-relaxed text-slate-400">
              Every file. Every tool. One vibrant browser studio. Free file tools with local WASM processing and automatic deletion.
            </p>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              className="mt-5 inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3.5 py-2 text-xs font-bold text-slate-200 transition hover:bg-white/10"
            >
              <Sparkles className="h-3.5 w-3.5 text-accent" /> Quick-launch any tool (Ctrl+K)
            </button>
          </div>
          {CATEGORIES.slice(0, 3).map((c) => (
            <nav key={c.id} aria-label={c.name}>
              <p className="flex items-center gap-2 text-sm font-bold text-white">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: c.color }} />
                {c.name}
              </p>
              <ul className="mt-3 space-y-2 text-sm">
                <li><Link className="text-slate-400 transition hover:text-white" to={`/category/${c.id}`}>View all {c.name.toLowerCase()}</Link></li>
                <li><Link className="text-slate-400 transition hover:text-white" to="/tools">All {TOOLS.length} tools</Link></li>
              </ul>
            </nav>
          ))}
        </div>
        <div className="border-t border-white/10">
          <div className="mx-auto flex max-w-7xl flex-wrap items-center gap-x-6 gap-y-2 px-4 py-5 text-xs text-slate-400 sm:px-6">
            <span>© {new Date().getFullYear()} DocDoctor. Free to use.</span>
            <Link to="/privacy" className="hover:text-white">Privacy</Link>
            <Link to="/about" className="hover:text-white">About</Link>
            <span className="ml-auto inline-flex items-center gap-1.5 text-teal-300">
              <ShieldCheck className="h-3.5 w-3.5" /> On-device processing · Auto-delete ≤60 min
            </span>
          </div>
        </div>
        <DeveloperContact />
      </footer>
    </div>
  )
}
