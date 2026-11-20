import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  Search, ShieldCheck, MousePointerClick, Settings2, Download, Lock, Timer,
  ArrowRight, ArrowUpRight, FileCheck2, Sparkles, X, File as FileIcon, Files, Zap, Workflow,
} from 'lucide-react'
import { CATEGORIES, TOOLS, categoryById, formatSize, popularTools, toolById, toolsByCategory, type CategoryId, type Tool } from '../data/tools'
import ToolCard from '../components/ToolCard'
import {
  ExcelBentoArt, FormatMarquee, Hero3DFileStack, ImageBentoArt, LivePlayground, OtherBentoArt,
  PdfBentoArt, PptBentoArt, PrivacyGlassVault3D, Reveal, SpotlightCard, WordBentoArt,
} from '../components/BentoVisuals'
import { BorderBeam, GridBeamCanvas, MagneticWrap, TelemetryStrip } from '../components/FuturisticPrimitives'
import { getFavorites, getRecent, onPrefsChange } from '../lib/prefs'
import { suggestToolsForFiles } from '../lib/smartSuggest'
import { showToast } from '../lib/toast'
import { useI18n } from '../lib/i18n'

const QUICK_PICKS_BY_CAT: Record<CategoryId, string[]> = {
  pdf: ['compress-pdf', 'merge-pdf', 'split-pdf', 'sign-pdf', 'ocr-pdf'],
  image: ['compress-image-kb', 'blur-image', 'passport-photo', 'resize-image', 'heic-to-jpg'],
  word: ['docx-to-pdf', 'docx-page-remover', 'compress-docx'],
  powerpoint: ['pptx-to-pdf', 'compress-powerpoint', 'merge-presentations'],
  excel: ['csv-to-excel', 'excel-to-csv', 'merge-excel'],
  other: ['zip-files', 'extract-zip', 'json-formatter', 'csv-tools', 'markdown-converter'],
}

const WORKFLOW_RECIPES = [
  {
    id: 'exam-photo',
    title: 'Exam & Visa Portal Photo',
    desc: 'Crop biometric 300 DPI passport photo, then hit exact 20 KB / 50 KB upload limits.',
    color: '#0EA5A0',
    steps: [
      { id: 'passport-photo', label: 'Passport 300 DPI' },
      { id: 'compress-image-kb', label: 'Compress to 50 KB' },
    ],
  },
  {
    id: 'job-pack',
    title: 'Job Application PDF Pack',
    desc: 'Combine resume + certificates, shrink file size for email, and add a drawn signature.',
    color: '#E5484D',
    steps: [
      { id: 'merge-pdf', label: 'Merge PDF' },
      { id: 'compress-pdf', label: 'Compress' },
      { id: 'sign-pdf', label: 'Sign PDF' },
    ],
  },
  {
    id: 'safe-share',
    title: 'Share-Safe Private Document',
    desc: 'Permanently blur ID numbers/faces and strip hidden EXIF camera GPS metadata.',
    color: '#7C3AED',
    steps: [
      { id: 'blur-image', label: 'Blur & Redact' },
      { id: 'image-metadata', label: 'Scrub EXIF' },
    ],
  },
]

export default function Home() {
  const [q, setQ] = useState('')
  const [popCat, setPopCat] = useState<'all' | CategoryId>('all')
  const [favIds, setFavIds] = useState<string[]>(() => getFavorites())
  const [recentIds, setRecentIds] = useState<string[]>(() => getRecent())
  const [smartFiles, setSmartFiles] = useState<File[]>([])
  const [dragActive, setDragActive] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const { t } = useI18n()
  const navigate = useNavigate()

  useEffect(() => onPrefsChange(() => { setFavIds(getFavorites()); setRecentIds(getRecent()) }), [])

  const favTools = useMemo(() => favIds.map((id) => toolById(id)).filter((x): x is Tool => !!x), [favIds])
  const recentTools = useMemo(() => recentIds.map((id) => toolById(id)).filter((x): x is Tool => !!x && !favIds.includes(x.id)), [recentIds, favIds])
  const results = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return []
    return TOOLS.filter((tool) => `${tool.name} ${tool.description} ${tool.acceptLabel}`.toLowerCase().includes(s)).slice(0, 6)
  }, [q])

  const { tools: smartSuggestions, batchLabel } = useMemo(
    () => suggestToolsForFiles(smartFiles),
    [smartFiles],
  )
  const smartTotalSize = useMemo(() => smartFiles.reduce((acc, f) => acc + f.size, 0), [smartFiles])

  const handleSmartPick = useCallback((files: FileList | File[]) => {
    const arr = Array.from(files)
    if (arr.length) setSmartFiles(arr)
  }, [])

  // Support Ctrl+V paste right on the homepage hero (single or multiple files)
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return
      const pasted = Array.from(e.clipboardData?.files ?? [])
      if (pasted.length) {
        e.preventDefault()
        setSmartFiles(pasted)
        showToast(
          pasted.length === 1 ? `Pasted ${pasted[0].name} — pick an action` : `Pasted ${pasted.length} files — pick a batch tool`,
          'success',
        )
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [])

  const pdfCat = categoryById('pdf')
  const imgCat = categoryById('image')
  const wordCat = categoryById('word')
  const pptCat = categoryById('powerpoint')
  const excelCat = categoryById('excel')
  const otherCat = categoryById('other')

  const catCount = (id: CategoryId) => TOOLS.filter((tool) => tool.category === id).length

  return (
    <>
      {/* ── Spatial Telemetry & Bento Hero ───────────────────────────── */}
      <section className="bento-hero-mesh relative overflow-hidden border-b border-slate-200/80 dark:border-slate-800/80">
        <GridBeamCanvas />
        <div className="relative z-10 mx-auto grid max-w-7xl gap-10 px-4 py-14 sm:px-6 lg:grid-cols-[1.08fr_.92fr] lg:items-center lg:py-20">
          <div>
            <div
              className="hero-stagger inline-flex items-center gap-2 rounded-full border border-blue-200/80 bg-white/95 px-3.5 py-1.5 text-xs font-extrabold text-blue-700 shadow-2xs dark:border-blue-500/30 dark:bg-blue-500/15 dark:text-blue-300"
              style={{ '--stagger': '0ms' } as React.CSSProperties}
            >
              <Sparkles className="h-3.5 w-3.5" />
              <span>{t('home.kicker')}</span>
            </div>

            <h1
              className="hero-stagger display-hero mt-5 font-display font-extrabold text-ink-950 dark:text-white"
              style={{ '--stagger': '70ms' } as React.CSSProperties}
            >
              {t('home.titleA')}
              <br />
              <span className="brand-text-grad">
                {t('home.titleB')}
              </span>
            </h1>

            <p
              className="hero-stagger mt-5 max-w-lg text-base leading-relaxed text-slate-600 dark:text-slate-300 sm:text-lg"
              style={{ '--stagger': '130ms' } as React.CSSProperties}
            >
              {t('home.sub')}
            </p>

            {/* Live Browser Engine Telemetry Strip */}
            <div className="hero-stagger" style={{ '--stagger': '180ms' } as React.CSSProperties}>
              <TelemetryStrip toolCount={TOOLS.length} />
            </div>

            {/* Hero search */}
            <form
              role="search"
              className="hero-stagger relative mt-6 max-w-lg"
              style={{ '--stagger': '230ms' } as React.CSSProperties}
              onSubmit={(e) => { e.preventDefault(); navigate(`/tools?q=${encodeURIComponent(q)}`) }}
            >
              <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <label className="sr-only" htmlFor="hero-search">Search tools</label>
              <input
                id="hero-search"
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder='Try "compress pdf", "passport photo" or "blur image"…'
                className="input rounded-2xl py-4 pl-12 pr-28 text-base shadow-bento"
                autoComplete="off"
              />
              <button
                type="submit"
                className="brand-grad absolute right-2 top-1/2 -translate-y-1/2 rounded-xl px-4 py-2.5 text-sm font-bold text-white shadow-sm transition hover:brightness-110 active:scale-[.98]"
              >
                Search
              </button>
              {q.trim() && (
                <div className="animate-bento-pop absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-slate-200/90 bg-white/95 p-1.5 shadow-lift backdrop-blur-xl dark:border-slate-700 dark:bg-[#0e1525]/95">
                  {results.length === 0 ? (
                    <p className="px-4 py-3 text-sm text-slate-500">
                      No tools match “{q}”. <Link to="/tools" className="font-bold text-accent">Browse all tools</Link>
                    </p>
                  ) : (
                    results.map((tool) => {
                      const c = categoryById(tool.category)
                      return (
                        <Link
                          key={tool.id}
                          to={`/tool/${tool.id}`}
                          className="flex items-center gap-3 rounded-xl px-3.5 py-2.5 transition hover:bg-slate-50 dark:hover:bg-slate-800/70"
                        >
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: `${c.color}18`, color: c.color }}>
                            <tool.icon className="h-4 w-4" />
                          </span>
                          <span className="text-sm font-bold text-ink-950 dark:text-white">{tool.name}</span>
                          <span className="truncate text-xs text-slate-500 dark:text-slate-400">{tool.description}</span>
                        </Link>
                      )
                    })
                  )}
                </div>
              )}
            </form>

            {/* Primary CTA & Spatial Telemetry KPI Strip */}
            <div
              className="hero-stagger mt-6 flex flex-wrap items-center gap-3"
              style={{ '--stagger': '280ms' } as React.CSSProperties}
            >
              <MagneticWrap>
                <Link to="/tools" className="btn-accent">
                  Explore all {TOOLS.length} tools <ArrowRight className="h-4 w-4" />
                </Link>
              </MagneticWrap>
              <Link to="/tool/compress-pdf" className="btn-ghost">
                Compress PDF
              </Link>
              <Link to="/tool/compress-image" className="btn-ghost hidden sm:inline-flex">
                Compress Image
              </Link>
            </div>

            <dl
              className="hero-stagger mt-7 grid max-w-lg grid-cols-3 gap-3"
              style={{ '--stagger': '330ms' } as React.CSSProperties}
            >
              {[
                { v: `${TOOLS.length}`, l: 'real tools', tag: 'ENGINES', bg: 'bg-blue-500/10 text-blue-700 dark:text-blue-300 border-blue-200/70 dark:border-blue-500/25' },
                { v: '100%', l: 'free forever', tag: 'ACCESS', bg: 'bg-teal-500/10 text-teal-700 dark:text-teal-300 border-teal-200/70 dark:border-teal-500/25' },
                { v: '0 MB', l: 'cloud stored', tag: 'PRIVACY', bg: 'bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-200/70 dark:border-violet-500/25' },
              ].map((s) => (
                <div key={s.l} className={`rounded-2xl border px-3.5 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.22)] ${s.bg}`}>
                  <dt className="font-mono text-[9px] font-extrabold uppercase tracking-[0.14em] opacity-70">{s.tag}</dt>
                  <dd className="mt-0.5 font-display text-xl font-extrabold tabular-nums">{s.v}</dd>
                  <dd className="text-[11px] font-bold opacity-85">{s.l}</dd>
                </div>
              ))}
            </dl>
          </div>

          {/* ── Right Hero: Spatial Glass Smart Drop Studio Card ─────── */}
          <div
            className="hero-stagger glass-spatial glass-grain p-6 sm:p-7"
            style={{ '--stagger': '160ms' } as React.CSSProperties}
          >
            <BorderBeam durationSec={8} />
            <div className="relative z-10 flex items-center justify-between gap-2">
              <div>
                <p className="flex items-center gap-2 font-display text-base font-extrabold text-ink-950 dark:text-white">
                  <span>{smartFiles.length > 0 ? 'Pick an instant action' : 'Smart Drop Studio'}</span>
                  <span className="rounded-md bg-accent-soft px-1.5 py-0.5 font-mono text-[10px] font-extrabold uppercase tracking-wider text-accent dark:bg-blue-500/15 dark:text-blue-300">
                    {smartFiles.length > 1 ? `BATCH · ${smartFiles.length}` : 'MULTI-FILE'}
                  </span>
                </p>
                <p className="mt-0.5 text-xs font-medium text-slate-500 dark:text-slate-400">
                  {smartFiles.length > 0
                    ? `${batchLabel || 'Ready'} — click any tool below to launch pre-loaded.`
                    : 'Drop 1 or multiple files (or press Ctrl+V) for instant 1-click suggestions.'}
                </p>
              </div>
              {smartFiles.length > 0 && (
                <button
                  type="button"
                  onClick={() => setSmartFiles([])}
                  aria-label="Clear dropped files"
                  className="rounded-xl p-1.5 text-slate-400 transition hover:bg-slate-100 hover:text-ink-950 dark:hover:bg-slate-800 dark:hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>

            {smartFiles.length > 0 ? (
              <div className="animate-bento-pop mt-5">
                <div className="flex items-center gap-3 rounded-2xl border border-blue-200/80 bg-blue-50/70 p-3.5 dark:border-blue-500/30 dark:bg-blue-500/10">
                  <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-sm">
                    {smartFiles.length > 1 ? <Files className="h-5 w-5" /> : <FileIcon className="h-5 w-5" />}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-display text-sm font-bold text-ink-950 dark:text-white">
                      {smartFiles.length === 1
                        ? smartFiles[0].name
                        : `${smartFiles[0].name} + ${smartFiles.length - 1} more`}
                    </p>
                    <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                      {formatSize(smartTotalSize)} · {batchLabel}
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 gap-2.5">
                  {smartSuggestions.map((tool) => {
                    const c = categoryById(tool.category)
                    const toPass = tool.multiple ? smartFiles : smartFiles.slice(0, 1)
                    return (
                      <button
                        key={tool.id}
                        type="button"
                        onClick={() => navigate(`/tool/${tool.id}`, { state: { chainedFiles: toPass } })}
                        className="group flex items-center gap-2.5 rounded-2xl border border-slate-200/90 bg-white p-3 text-left transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-card dark:border-slate-700/80 dark:bg-[#121b30] dark:hover:border-slate-600"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: `${c.color}18`, color: c.color }}>
                          <tool.icon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-xs font-extrabold text-ink-950 dark:text-white">{tool.name}</span>
                          <span className="block truncate text-[10px] font-semibold text-slate-400">
                            {toPass.length > 1 ? `Open with ${toPass.length} files →` : 'Open with file →'}
                          </span>
                        </span>
                      </button>
                    )
                  })}
                </div>
              </div>
            ) : (
              <>
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => fileInputRef.current?.click()}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click() } }}
                  onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
                  onDragLeave={() => setDragActive(false)}
                  onDrop={(e) => { e.preventDefault(); setDragActive(false); handleSmartPick(e.dataTransfer.files) }}
                  className={`group/drop relative mt-4 cursor-pointer rounded-2xl border-2 border-dashed p-5 text-center transition duration-200 ${
                    dragActive
                      ? 'scale-[1.01] border-accent bg-accent-soft/80 ring-4 ring-accent/15'
                      : 'border-slate-300/90 bg-slate-50/75 hover:border-accent/60 hover:bg-accent-soft/35 dark:border-slate-700/90 dark:bg-[#090f1e]/85 dark:hover:border-accent/60'
                  }`}
                >
                  {/* Precision HUD corner reticles */}
                  <span aria-hidden className="pointer-events-none absolute left-2.5 top-2.5 h-3 w-3 rounded-tl border-l-2 border-t-2 border-accent/40 transition group-hover/drop:border-accent" />
                  <span aria-hidden className="pointer-events-none absolute right-2.5 top-2.5 h-3 w-3 rounded-tr border-r-2 border-t-2 border-accent/40 transition group-hover/drop:border-accent" />
                  <span aria-hidden className="pointer-events-none absolute bottom-2.5 left-2.5 h-3 w-3 rounded-bl border-b-2 border-l-2 border-accent/40 transition group-hover/drop:border-accent" />
                  <span aria-hidden className="pointer-events-none absolute bottom-2.5 right-2.5 h-3 w-3 rounded-br border-b-2 border-r-2 border-accent/40 transition group-hover/drop:border-accent" />

                  <Hero3DFileStack dragActive={dragActive} />
                  <p className="mt-2 font-display text-sm font-extrabold text-ink-950 dark:text-white">
                    Drop 1 or multiple PDFs, images, or Office files
                  </p>
                  <div className="mt-2.5 flex flex-wrap items-center justify-center gap-1.5">
                    {[
                      { label: 'PDF', color: '#E5484D' },
                      { label: 'JPG / PNG', color: '#0EA5A0' },
                      { label: 'HEIC', color: '#0EA5A0' },
                      { label: 'DOCX', color: '#1D6FF2' },
                      { label: 'PPTX', color: '#E86A2C' },
                      { label: 'XLSX', color: '#1F9D55' },
                    ].map((badge) => (
                      <span
                        key={badge.label}
                        className="rounded-lg px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide"
                        style={{ backgroundColor: `${badge.color}18`, color: badge.color }}
                      >
                        {badge.label}
                      </span>
                    ))}
                  </div>
                  <input
                    ref={fileInputRef}
                    type="file"
                    multiple
                    className="hidden"
                    onChange={(e) => { if (e.target.files) handleSmartPick(e.target.files); e.target.value = '' }}
                  />
                </div>

                {/* Quick-launch popular tiles */}
                <div className="mt-4 grid grid-cols-2 gap-2.5">
                  {popularTools.slice(0, 4).map((tool) => {
                    const c = categoryById(tool.category)
                    return (
                      <Link
                        key={tool.id}
                        to={`/tool/${tool.id}`}
                        className="group flex items-center gap-2.5 rounded-2xl border border-slate-200/80 bg-white p-3 transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-card dark:border-slate-800 dark:bg-[#111a2e] dark:hover:border-slate-700"
                      >
                        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl transition group-hover:scale-105" style={{ backgroundColor: `${c.color}18`, color: c.color }}>
                          <tool.icon className="h-4.5 w-4.5" />
                        </span>
                        <span className="min-w-0">
                          <span className="block truncate text-xs font-extrabold text-ink-950 dark:text-white">{tool.name}</span>
                          <span className="block truncate text-[10px] font-semibold text-slate-400">{tool.acceptLabel.split(',')[0]}</span>
                        </span>
                      </Link>
                    )
                  })}
                </div>
              </>
            )}

            <div className="mt-4 flex items-center justify-between gap-2 pt-3 border-t border-slate-100 dark:border-slate-800/80">
              <span className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 dark:text-slate-400">
                <ShieldCheck className="h-4 w-4 shrink-0 text-teal2" /> Files stay on your device
              </span>
              <Link to="/tools" className="inline-flex items-center gap-1 text-xs font-extrabold text-accent hover:underline">
                All {TOOLS.length} tools <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* ── Supported Formats Infinite Ticker ────────────────────────── */}
      <FormatMarquee />

      {/* ── Favorites & Recent (local only) ───────────────────────────── */}
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

      {/* ── Interactive Live Before/After Playground ─────────────────── */}
      <LivePlayground />

      {/* ── One-Click Chained Workflow Recipes ────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 pt-12 sm:px-6" aria-labelledby="recipes-heading">
        <Reveal>
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="inline-flex items-center gap-1.5 font-mono text-[11px] font-extrabold uppercase tracking-widest text-accent">
                <Workflow className="h-3.5 w-3.5" /> Multi-step studio chains
              </p>
              <h2 id="recipes-heading" className="display-section mt-1 font-display font-extrabold text-ink-950 dark:text-white">
                One-click workflow recipes
              </h2>
            </div>
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
              Outputs pass directly between tools in browser memory
            </span>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            {WORKFLOW_RECIPES.map((r) => (
              <div
                key={r.id}
                className="bento-card group flex flex-col justify-between p-5 hover:-translate-y-0.5 hover:shadow-lift"
                style={{ backgroundImage: `radial-gradient(280px circle at 96% 8%, ${r.color}1c, transparent 62%)` }}
              >
                <div>
                  <h3 className="font-display text-base font-extrabold text-ink-950 dark:text-white">{r.title}</h3>
                  <p className="mt-1 text-xs leading-relaxed text-slate-600 dark:text-slate-300">{r.desc}</p>
                  <div className="mt-4 flex flex-wrap items-center gap-1.5">
                    {r.steps.map((st, idx) => (
                      <span key={st.id} className="inline-flex items-center gap-1.5">
                        <Link
                          to={`/tool/${st.id}`}
                          className="rounded-xl border border-slate-200/80 bg-white/95 px-2.5 py-1 text-[11px] font-extrabold text-ink-950 transition hover:border-accent hover:text-accent dark:border-slate-700/80 dark:bg-[#131d33] dark:text-slate-100"
                        >
                          {st.label}
                        </Link>
                        {idx < r.steps.length - 1 && (
                          <ArrowRight className="h-3 w-3 shrink-0" style={{ color: r.color }} aria-hidden />
                        )}
                      </span>
                    ))}
                  </div>
                </div>
                <Link
                  to={`/tool/${r.steps[0].id}`}
                  className="mt-5 inline-flex items-center gap-1 text-xs font-extrabold transition group-hover:translate-x-0.5"
                  style={{ color: r.color }}
                >
                  Start recipe <ArrowUpRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            ))}
          </div>
        </Reveal>
      </section>

      {/* ── Asymmetric Vibrant Bento Category Grid ────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6" aria-labelledby="cats">
        <Reveal>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-widest text-accent">Six vibrant toolkits</p>
            <h2 id="cats" className="mt-1 font-display text-2xl font-extrabold text-ink-950 dark:text-white sm:text-3xl">
              Browse by category
            </h2>
          </div>
          <Link to="/tools" className="btn-ghost !py-2 !px-4 text-xs">
            View all {TOOLS.length} tools <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>

        <div className="mt-8 grid gap-5 lg:grid-cols-6">
          {/* Featured Large Bento Tiles: PDF & Image with Spotlight + Custom SVG Art */}
          {[pdfCat, imgCat].map((c) => {
            const quickIds = QUICK_PICKS_BY_CAT[c.id]
            const quickTools = quickIds.map((id) => toolById(id)).filter((x): x is Tool => !!x)
            return (
              <SpotlightCard
                key={c.id}
                glowColor={`${c.color}22`}
                className="bento-card group flex flex-col justify-between p-7 hover:-translate-y-1 hover:shadow-lift lg:col-span-3"
                style={{
                  backgroundImage: `radial-gradient(380px circle at 95% 5%, ${c.color}20, transparent 62%)`,
                }}
              >
                <div>
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex items-center gap-3">
                      <span
                        className="icon-3d flex h-14 w-14 items-center justify-center rounded-2xl transition duration-200 group-hover:scale-105"
                        style={{ backgroundColor: c.color, color: '#fff' }}
                      >
                        <c.icon className="h-7 w-7" />
                      </span>
                      <Link
                        to={`/category/${c.id}`}
                        className="inline-flex items-center gap-1 rounded-full px-3.5 py-1.5 text-xs font-extrabold transition hover:brightness-95"
                        style={{ backgroundColor: `${c.color}18`, color: c.color }}
                      >
                        {catCount(c.id)} tools <ArrowUpRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                    {c.id === 'pdf' ? <PdfBentoArt /> : <ImageBentoArt />}
                  </div>
                  <Link to={`/category/${c.id}`} className="mt-4 block">
                    <h3 className="font-display text-2xl font-extrabold text-ink-950 transition group-hover:opacity-80 dark:text-white">
                      {c.name}
                    </h3>
                    <p className="mt-1.5 max-w-md text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                      {c.blurb}
                    </p>
                  </Link>
                </div>

                {/* Quick-launch pills inside the Bento tile */}
                <div className="mt-6 flex flex-wrap gap-2 pt-4 border-t border-slate-200/70 dark:border-slate-800/80">
                  {quickTools.map((tool) => (
                    <Link
                      key={tool.id}
                      to={`/tool/${tool.id}`}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/90 px-3 py-1.5 text-xs font-bold text-ink-950 transition hover:-translate-y-0.5 hover:shadow-xs dark:border-slate-700/80 dark:bg-[#131d33] dark:text-slate-100"
                    >
                      <tool.icon className="h-3.5 w-3.5" style={{ color: c.color }} />
                      {tool.name}
                    </Link>
                  ))}
                </div>
              </SpotlightCard>
            )
          })}

          {/* Companion Vibrant Bento Tiles: Word, PowerPoint, Excel */}
          {[wordCat, pptCat, excelCat].map((c) => {
            const quickTools = QUICK_PICKS_BY_CAT[c.id].map((id) => toolById(id)).filter((x): x is Tool => !!x)
            return (
              <SpotlightCard
                key={c.id}
                glowColor={`${c.color}20`}
                className="bento-card group flex flex-col justify-between p-6 hover:-translate-y-1 hover:shadow-lift lg:col-span-2"
                style={{
                  backgroundImage: `radial-gradient(280px circle at 95% 5%, ${c.color}1c, transparent 62%)`,
                }}
              >
                <div>
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex items-center gap-2.5">
                      <span
                        className="icon-3d flex h-12 w-12 items-center justify-center rounded-2xl transition duration-200 group-hover:scale-105"
                        style={{ backgroundColor: c.color, color: '#fff' }}
                      >
                        <c.icon className="h-6 w-6" />
                      </span>
                      <span
                        className="rounded-full px-3 py-1 text-xs font-extrabold"
                        style={{ backgroundColor: `${c.color}18`, color: c.color }}
                      >
                        {catCount(c.id)} tools
                      </span>
                    </div>
                    {c.id === 'word' ? <WordBentoArt /> : c.id === 'powerpoint' ? <PptBentoArt /> : <ExcelBentoArt />}
                  </div>
                  <Link to={`/category/${c.id}`} className="mt-4 block">
                    <h3 className="font-display text-lg font-extrabold text-ink-950 dark:text-white">{c.name}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{c.tagline}</p>
                  </Link>
                </div>

                <div className="mt-5 flex flex-wrap gap-1.5">
                  {quickTools.map((tool) => (
                    <Link
                      key={tool.id}
                      to={`/tool/${tool.id}`}
                      className="rounded-xl border border-slate-200/80 bg-white/80 px-2.5 py-1 text-[11px] font-bold text-slate-700 transition hover:border-slate-300 dark:border-slate-700/80 dark:bg-[#131d33] dark:text-slate-200"
                    >
                      {tool.name}
                    </Link>
                  ))}
                </div>
              </SpotlightCard>
            )
          })}

          {/* Full-width Companion Bento Strip: Other File Tools */}
          <SpotlightCard
            glowColor={`${otherCat.color}1f`}
            tilt={false}
            className="bento-card group p-6 hover:shadow-lift lg:col-span-6"
            style={{
              backgroundImage: `radial-gradient(420px circle at 5% 50%, ${otherCat.color}1c, transparent 60%)`,
            }}
          >
            <div className="flex flex-col justify-between gap-5 sm:flex-row sm:items-center">
              <div className="flex items-center gap-4">
                <span
                  className="icon-3d flex h-13 w-13 shrink-0 items-center justify-center rounded-2xl transition group-hover:scale-105"
                  style={{ backgroundColor: otherCat.color, color: '#fff' }}
                >
                  <otherCat.icon className="h-6 w-6" />
                </span>
                <div>
                  <Link to={`/category/${otherCat.id}`} className="inline-flex items-center gap-2">
                    <h3 className="font-display text-lg font-extrabold text-ink-950 dark:text-white">{otherCat.name}</h3>
                    <span className="rounded-full px-2.5 py-0.5 text-xs font-extrabold" style={{ backgroundColor: `${otherCat.color}18`, color: otherCat.color }}>
                      {catCount(otherCat.id)} tools
                    </span>
                  </Link>
                  <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{otherCat.blurb}</p>
                </div>
                <OtherBentoArt />
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {QUICK_PICKS_BY_CAT.other.map((id) => toolById(id)).filter((x): x is Tool => !!x).map((tool) => (
                  <Link
                    key={tool.id}
                    to={`/tool/${tool.id}`}
                    className="rounded-xl border border-slate-200/80 bg-white px-3 py-1.5 text-xs font-bold text-ink-950 transition hover:-translate-y-0.5 hover:shadow-xs dark:border-slate-700/80 dark:bg-[#131d33] dark:text-slate-100"
                  >
                    {tool.name}
                  </Link>
                ))}
                <Link to={`/category/${otherCat.id}`} className="inline-flex items-center gap-1 px-2 text-xs font-extrabold" style={{ color: otherCat.color }}>
                  Explore all <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>
            </div>
          </SpotlightCard>
        </div>
        </Reveal>
      </section>

      {/* ── Popular Tools with Interactive Category Tabs ──────────────── */}
      <section className="border-y border-slate-200/80 bg-white/70 dark:border-slate-800/80 dark:bg-[#0a1020]/70" aria-labelledby="pop">
        <div className="mx-auto max-w-7xl px-4 py-16 sm:px-6">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-widest text-rose-500">Everyday favorites</p>
              <h2 id="pop" className="mt-1 font-display text-2xl font-extrabold text-ink-950 dark:text-white sm:text-3xl">
                Most popular tools
              </h2>
            </div>
            <Link
              to={popCat === 'all' ? '/tools' : `/category/${popCat}`}
              className="text-sm font-extrabold text-accent hover:underline"
            >
              {popCat === 'all' ? `Browse all ${TOOLS.length} →` : `All ${categoryById(popCat).name} →`}
            </Link>
          </div>

          {/* Interactive category filter pills */}
          <div className="mt-5 flex flex-wrap gap-2" role="tablist" aria-label="Filter popular tools by category">
            <button
              type="button"
              role="tab"
              aria-selected={popCat === 'all'}
              onClick={() => setPopCat('all')}
              className={`rounded-full px-3.5 py-1.5 text-xs font-extrabold transition ${
                popCat === 'all'
                  ? 'bg-ink-950 text-white shadow-xs dark:bg-white dark:text-ink-950'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-[#111a2e] dark:text-slate-300'
              }`}
            >
              All Popular
            </button>
            {CATEGORIES.map((c) => {
              const active = popCat === c.id
              return (
                <button
                  key={c.id}
                  type="button"
                  role="tab"
                  aria-selected={active}
                  onClick={() => setPopCat(c.id)}
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

          <div className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {(popCat === 'all' ? popularTools : toolsByCategory(popCat).slice(0, 8)).map((tool) => (
              <ToolCard key={tool.id} tool={tool} />
            ))}
          </div>
        </div>
      </section>

      {/* ── How It Works (Vibrant Bento Steps) ────────────────────────── */}
      <section className="mx-auto max-w-7xl px-4 py-16 sm:px-6" aria-labelledby="how">
        <p className="text-xs font-extrabold uppercase tracking-widest text-teal2">Zero friction</p>
        <h2 id="how" className="mt-1 font-display text-2xl font-extrabold text-ink-950 dark:text-white sm:text-3xl">
          How DocDoctor works
        </h2>
        <ol className="mt-8 grid gap-5 md:grid-cols-3">
          {[
            { icon: MousePointerClick, n: '01', color: '#2563eb', t: 'Drop or paste your file', d: 'Pick any tool or drop straight onto the homepage. Format and size are validated instantly.' },
            { icon: Settings2, n: '02', color: '#7c3aed', t: 'Tweak & run on-device', d: 'Adjust quality, pages, crop, or OCR language — powered by real WASM & Web Workers, never simulated.' },
            { icon: Download, n: '03', color: '#0d9488', t: 'Download or chain next', d: 'Inspect before/after savings, download immediately, or send your output straight into the next tool.' },
          ].map((s) => (
            <li key={s.n} className="bento-card p-6">
              <div className="flex items-center justify-between">
                <span className="icon-3d flex h-12 w-12 items-center justify-center rounded-2xl text-white" style={{ backgroundColor: s.color }}>
                  <s.icon className="h-6 w-6" />
                </span>
                <span className="font-display text-4xl font-extrabold tracking-tight opacity-15" style={{ color: s.color }}>{s.n}</span>
              </div>
              <p className="mt-5 font-display text-lg font-extrabold text-ink-950 dark:text-white">{s.t}</p>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      {/* ── Vibrant Privacy Bento Banner with 3D Rotating Glass Vault ─── */}
      <section className="mx-auto max-w-7xl px-4 pb-16 sm:px-6" aria-labelledby="privacy">
        <Reveal>
        <SpotlightCard
          glowColor="rgba(59, 130, 246, 0.22)"
          tilt={false}
          className="relative overflow-hidden rounded-[2rem] border border-slate-800/90 bg-[#060913] px-6 py-10 text-white shadow-lift sm:px-10 sm:py-12"
          style={{
            backgroundImage:
              'radial-gradient(460px circle at 92% 8%, rgba(37, 99, 235, 0.22), transparent 62%), radial-gradient(420px circle at 10% 92%, rgba(20, 184, 166, 0.18), transparent 60%)',
          }}
        >
          <BorderBeam durationSec={9} />
          <div className="relative grid gap-8 lg:grid-cols-[1.05fr_auto_.95fr] lg:items-center">
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-teal-400/30 bg-teal-400/10 px-3 py-1 font-mono text-[11px] font-extrabold uppercase tracking-wider text-teal-300">
                <Lock className="h-3.5 w-3.5" /> Zero-knowledge architecture
              </span>
              <h2 id="privacy" className="display-section mt-4 font-display font-extrabold">
                Private by design. Built for speed.
              </h2>
              <p className="mt-2.5 max-w-xl text-sm leading-relaxed text-slate-300 sm:text-base">
                No accounts. No watermarks. No permanent storage. All browser tools run 100% locally in your browser memory, and optional server conversions auto-delete within 60 minutes.
              </p>
              <Link to="/privacy" className="mt-5 inline-flex items-center gap-1.5 text-sm font-extrabold text-blue-300 hover:text-white">
                Read the privacy notice <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            <PrivacyGlassVault3D />

            <ul className="grid gap-3 sm:grid-cols-3 lg:grid-cols-1">
              {[
                { icon: Zap, label: 'On-device WASM', sub: 'Instant local speed', color: '#3b82f6' },
                { icon: Timer, label: 'Auto-delete', sub: '≤60 min hard cap', color: '#14b8a6' },
                { icon: FileCheck2, label: 'Real engines', sub: 'Verified outputs', color: '#a855f7' },
              ].map((item) => (
                <li key={item.label} className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.06] p-3.5">
                  <span className="icon-3d flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-white" style={{ backgroundColor: item.color }}>
                    <item.icon className="h-4.5 w-4.5" />
                  </span>
                  <div>
                    <p className="text-sm font-extrabold text-white">{item.label}</p>
                    <p className="text-xs text-slate-400">{item.sub}</p>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        </SpotlightCard>
        </Reveal>
      </section>
    </>
  )
}
