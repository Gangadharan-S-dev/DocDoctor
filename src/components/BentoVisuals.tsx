import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ArrowRight, GripVertical, Sparkles, EyeOff, FileArchive } from 'lucide-react'

/* ── 1. Cursor-Tracking Spotlight Bento Card ─────────────────────────────── */
export function SpotlightCard({
  children,
  className = '',
  glowColor = 'rgba(37, 99, 235, 0.16)',
  style,
}: {
  children: React.ReactNode
  className?: string
  glowColor?: string
  style?: React.CSSProperties
}) {
  const ref = useRef<HTMLDivElement>(null)
  const [pos, setPos] = useState<{ x: number; y: number; active: boolean }>({ x: 0, y: 0, active: false })

  const handleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = ref.current?.getBoundingClientRect()
    if (!rect) return
    setPos({ x: e.clientX - rect.left, y: e.clientY - rect.top, active: true })
  }

  return (
    <div
      ref={ref}
      onPointerMove={handleMove}
      onPointerLeave={() => setPos((p) => ({ ...p, active: false }))}
      className={className}
      style={style}
    >
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 transition-opacity duration-300"
        style={{
          opacity: pos.active ? 1 : 0,
          background: `radial-gradient(360px circle at ${pos.x}px ${pos.y}px, ${glowColor}, transparent 68%)`,
        }}
      />
      <div className="relative z-10 flex h-full flex-col justify-between">{children}</div>
    </div>
  )
}

/* ── 2. Smooth Scroll Reveal ─────────────────────────────────────────────── */
export function Reveal({ children, className = '', delayMs = 0 }: { children: React.ReactNode; className?: string; delayMs?: number }) {
  const ref = useRef<HTMLDivElement>(null)
  const [shown, setShown] = useState(() => typeof window === 'undefined' || !('IntersectionObserver' in window))

  useEffect(() => {
    const el = ref.current
    if (!el || shown) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setShown(true)
          obs.disconnect()
        }
      },
      { rootMargin: '0px 0px -40px 0px', threshold: 0.05 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [shown])

  return (
    <div
      ref={ref}
      className={`transition duration-500 ease-out ${shown ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'} ${className}`}
      style={delayMs ? { transitionDelay: `${delayMs}ms` } : undefined}
    >
      {children}
    </div>
  )
}

/* ── 3. Infinite Supported-Formats Ticker ────────────────────────────────── */
const FORMAT_BADGES = [
  { label: 'PDF', color: '#E5484D', to: '/category/pdf' },
  { label: 'HEIC → JPG', color: '#0EA5A0', to: '/tool/heic-to-jpg' },
  { label: 'WebP', color: '#0EA5A0', to: '/tool/webp-converter' },
  { label: 'AVIF', color: '#0EA5A0', to: '/tool/image-converter' },
  { label: 'PNG', color: '#0EA5A0', to: '/tool/compress-image' },
  { label: 'DOCX', color: '#1D6FF2', to: '/category/word' },
  { label: 'PPTX', color: '#E86A2C', to: '/category/powerpoint' },
  { label: 'XLSX', color: '#1F9D55', to: '/category/excel' },
  { label: 'CSV', color: '#1F9D55', to: '/tool/csv-tools' },
  { label: 'OCR · 13 Langs', color: '#7C3AED', to: '/tool/ocr-pdf' },
  { label: 'AES-256 PDF', color: '#E5484D', to: '/tool/protect-pdf' },
  { label: 'Blur & Redact', color: '#EC4899', to: '/tool/blur-image' },
  { label: 'ZIP', color: '#6D5DF6', to: '/tool/zip-files' },
  { label: 'JSON / XML', color: '#6D5DF6', to: '/tool/json-formatter' },
  { label: 'Passport 300 DPI', color: '#0EA5A0', to: '/tool/passport-photo' },
  { label: 'Animated GIF', color: '#F59E0B', to: '/tool/gif-maker' },
]

export function FormatMarquee() {
  const doubled = [...FORMAT_BADGES, ...FORMAT_BADGES]
  return (
    <div className="relative overflow-hidden border-b border-slate-200/80 bg-white/80 py-3.5 dark:border-slate-800/80 dark:bg-[#090e1a]/90" aria-label="Supported file formats">
      <div className="pointer-events-none absolute inset-y-0 left-0 z-10 w-16 bg-gradient-to-r from-white to-transparent dark:from-[#090e1a]" />
      <div className="pointer-events-none absolute inset-y-0 right-0 z-10 w-16 bg-gradient-to-l from-white to-transparent dark:from-[#090e1a]" />
      <div className="animate-marquee flex w-max items-center gap-3">
        {doubled.map((item, i) => (
          <Link
            key={`${item.label}-${i}`}
            to={item.to}
            tabIndex={i >= FORMAT_BADGES.length ? -1 : 0}
            aria-hidden={i >= FORMAT_BADGES.length ? true : undefined}
            className="inline-flex items-center gap-2 rounded-full border border-slate-200/80 bg-white px-3.5 py-1.5 text-xs font-extrabold text-ink-950 shadow-2xs transition duration-150 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-sm dark:border-slate-800 dark:bg-[#0e1525] dark:text-slate-200 dark:hover:border-slate-600 dark:hover:bg-[#162238]"
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: item.color }} />
            {item.label}
          </Link>
        ))}
      </div>
    </div>
  )
}

/* ── 4. Custom Animated SVG Mini-Visuals for Featured Bento Cards ────────── */
export function PdfBentoArt() {
  return (
    <div className="pointer-events-none relative hidden h-20 w-28 shrink-0 sm:block" aria-hidden>
      {/* Back page */}
      <div className="absolute right-1 top-2 h-16 w-12 rotate-6 rounded-xl border border-rose-200/90 bg-rose-50 shadow-xs transition duration-300 group-hover:translate-x-1 group-hover:rotate-12 dark:border-rose-500/30 dark:bg-rose-500/15" />
      {/* Middle page */}
      <div className="absolute right-5 top-1 h-16 w-12 -rotate-3 rounded-xl border border-rose-200 bg-white p-2 shadow-xs transition duration-300 group-hover:-translate-y-1 group-hover:-rotate-6 dark:border-slate-700 dark:bg-[#131d33]">
        <div className="h-1.5 w-6 rounded-full bg-rose-400/70" />
        <div className="mt-1.5 h-1 w-8 rounded-full bg-slate-200 dark:bg-slate-700" />
        <div className="mt-1 h-1 w-7 rounded-full bg-slate-200 dark:bg-slate-700" />
        <div className="mt-1 h-1 w-5 rounded-full bg-slate-200 dark:bg-slate-700" />
      </div>
      {/* Compression pill */}
      <span className="absolute bottom-0 right-0 rounded-full bg-rose-500 px-2 py-0.5 text-[10px] font-extrabold text-white shadow-sm transition duration-300 group-hover:scale-105">
        −78%
      </span>
    </div>
  )
}

export function ImageBentoArt() {
  return (
    <div className="pointer-events-none relative hidden h-20 w-28 shrink-0 sm:block" aria-hidden>
      {/* Framed colorful mini-photo */}
      <div className="absolute right-2 top-1 h-16 w-20 overflow-hidden rounded-2xl border border-teal-200/90 bg-gradient-to-br from-teal-400 via-cyan-500 to-blue-600 shadow-sm transition duration-300 group-hover:-rotate-2 group-hover:scale-105 dark:border-teal-500/40">
        <svg viewBox="0 0 80 64" className="h-full w-full">
          <circle cx="58" cy="18" r="8" fill="#fef08a" opacity="0.95" />
          <path d="M0 50 L24 28 L44 44 L58 32 L80 50 L80 64 L0 64 Z" fill="#0f172a" opacity="0.35" />
          <path d="M0 56 L30 34 L54 52 L80 40 L80 64 L0 64 Z" fill="#0f172a" opacity="0.5" />
        </svg>
      </div>
      {/* WebP badge */}
      <span className="absolute bottom-0 right-0 rounded-full bg-teal-600 px-2 py-0.5 text-[10px] font-extrabold text-white shadow-sm transition duration-300 group-hover:scale-105">
        WebP
      </span>
    </div>
  )
}

export function WordBentoArt() {
  return (
    <div className="pointer-events-none relative hidden h-14 w-20 shrink-0 sm:block" aria-hidden>
      <div className="absolute right-1 top-0.5 h-12 w-14 rounded-xl border border-blue-200 bg-white p-2 shadow-xs transition duration-300 group-hover:-translate-y-0.5 group-hover:-rotate-3 dark:border-blue-500/30 dark:bg-[#131d33]">
        <div className="h-1.5 w-7 rounded-full bg-blue-500/80" />
        <div className="mt-1.5 h-1 w-10 rounded-full bg-slate-200 dark:bg-slate-700" />
        <div className="mt-1 h-1 w-8 rounded-full bg-slate-200 dark:bg-slate-700" />
        <div className="mt-1 h-1 w-9 rounded-full bg-slate-200 dark:bg-slate-700" />
      </div>
      <span className="absolute bottom-0 right-0 rounded-full bg-blue-600 px-1.5 py-0.5 text-[9px] font-extrabold text-white shadow-xs transition group-hover:scale-105">
        DOCX
      </span>
    </div>
  )
}

export function PptBentoArt() {
  return (
    <div className="pointer-events-none relative hidden h-14 w-20 shrink-0 sm:block" aria-hidden>
      <div className="absolute right-0.5 top-2 h-10 w-14 rotate-6 rounded-xl border border-orange-200 bg-orange-50 transition duration-300 group-hover:rotate-12 dark:border-orange-500/30 dark:bg-orange-500/15" />
      <div className="absolute right-2.5 top-0.5 h-10 w-14 rounded-xl border border-orange-200 bg-white p-1.5 shadow-xs transition duration-300 group-hover:-translate-y-0.5 dark:border-slate-700 dark:bg-[#131d33]">
        <div className="h-1.5 w-6 rounded-full bg-orange-500/80" />
        <div className="mt-1.5 flex gap-1">
          <span className="h-4 w-5 rounded bg-orange-100 dark:bg-orange-500/20" />
          <span className="h-4 flex-1 rounded bg-slate-100 dark:bg-slate-800" />
        </div>
      </div>
      <span className="absolute bottom-0 right-0 rounded-full bg-orange-500 px-1.5 py-0.5 text-[9px] font-extrabold text-white shadow-xs transition group-hover:scale-105">
        PPTX
      </span>
    </div>
  )
}

export function ExcelBentoArt() {
  return (
    <div className="pointer-events-none relative hidden h-14 w-20 shrink-0 sm:block" aria-hidden>
      <div className="absolute right-1 top-0.5 grid h-11 w-14 grid-cols-3 gap-0.5 rounded-xl border border-emerald-200 bg-white p-1.5 shadow-xs transition duration-300 group-hover:-translate-y-0.5 group-hover:rotate-2 dark:border-emerald-500/30 dark:bg-[#131d33]">
        <span className="col-span-3 h-2 rounded-sm bg-emerald-500/80" />
        {Array.from({ length: 6 }).map((_, i) => (
          <span key={i} className="rounded-sm bg-emerald-100 dark:bg-emerald-500/20" />
        ))}
      </div>
      <span className="absolute bottom-0 right-0 rounded-full bg-emerald-600 px-1.5 py-0.5 text-[9px] font-extrabold text-white shadow-xs transition group-hover:scale-105">
        XLSX
      </span>
    </div>
  )
}

export function OtherBentoArt() {
  return (
    <div className="pointer-events-none relative hidden h-12 w-20 shrink-0 items-center justify-center sm:flex" aria-hidden>
      <div className="flex h-11 w-16 items-center justify-center rounded-xl border border-violet-200 bg-violet-50/80 font-mono text-xs font-extrabold text-violet-600 shadow-xs transition duration-300 group-hover:scale-105 dark:border-violet-500/30 dark:bg-violet-500/15 dark:text-violet-300">
        {'{ }'}
      </div>
      <span className="absolute bottom-0 right-0 rounded-full bg-violet-600 px-1.5 py-0.5 text-[9px] font-extrabold text-white shadow-xs">
        ZIP
      </span>
    </div>
  )
}

/* ── 5. Interactive Live Before/After Playground ─────────────────────────── */
function DemoScene({ mode, side }: { mode: 'compress' | 'redact'; side: 'before' | 'after' }) {
  if (mode === 'redact') {
    const isRedacted = side === 'after'
    return (
      <div className="relative h-full w-full select-none overflow-hidden bg-gradient-to-br from-slate-900 via-indigo-950 to-slate-900">
        <svg viewBox="0 0 640 340" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
          <defs>
            <linearGradient id={`card-bg-${side}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="100%" stopColor="#f1f5f9" />
            </linearGradient>
            <filter id="redact-blur">
              <feGaussianBlur stdDeviation="6" />
            </filter>
          </defs>
          {/* Subtle glowing orbs */}
          <circle cx="90" cy="60" r="110" fill="#ec4899" opacity="0.18" />
          <circle cx="560" cy="290" r="120" fill="#3b82f6" opacity="0.2" />
          {/* ID / Invoice Card */}
          <rect x="105" y="42" width="430" height="256" rx="24" fill={`url(#card-bg-${side})`} />
          <rect x="105" y="42" width="430" height="54" rx="24" fill="#0f172a" />
          <rect x="105" y="72" width="430" height="24" fill="#0f172a" />
          <circle cx="140" cy="69" r="10" fill="#f43f5e" />
          <rect x="162" y="63" width="130" height="12" rx="6" fill="#e2e8f0" />
          <rect x="445" y="61" width="66" height="16" rx="8" fill="#14b8a6" />

          {/* Portrait avatar */}
          <rect x="135" y="120" width="96" height="114" rx="16" fill="#dbeafe" />
          <g filter={isRedacted ? 'url(#redact-blur)' : undefined}>
            <circle cx="183" cy="160" r="22" fill="#2563eb" />
            <path d="M148 220 C148 196 218 196 218 220 Z" fill="#1e40af" />
          </g>
          {isRedacted && (
            <rect x="145" y="148" width="76" height="26" rx="8" fill="#0f172a" opacity="0.88" />
          )}

          {/* Sensitive fields */}
          <text x="255" y="136" fill="#64748b" fontSize="11" fontWeight="700" fontFamily="sans-serif">FULL NAME</text>
          <text x="255" y="158" fill="#0f172a" fontSize="18" fontWeight="800" fontFamily="sans-serif">Alex Morgan</text>

          <text x="255" y="188" fill="#64748b" fontSize="11" fontWeight="700" fontFamily="sans-serif">ID NUMBER &amp; EMAIL</text>
          {isRedacted ? (
            <>
              <rect x="252" y="196" width="195" height="22" rx="6" fill="#0f172a" />
              <rect x="252" y="226" width="235" height="22" rx="6" fill="#ec4899" opacity="0.25" />
              <rect x="258" y="232" width="220" height="10" rx="5" fill="#be185d" opacity="0.55" filter="url(#redact-blur)" />
            </>
          ) : (
            <>
              <text x="255" y="212" fill="#0f172a" fontSize="15" fontWeight="700" fontFamily="monospace">ID-4829-9104-7731</text>
              <text x="255" y="240" fill="#2563eb" fontSize="14" fontWeight="700" fontFamily="monospace">alex.morgan@private.io</text>
            </>
          )}

          {/* Footer stamp */}
          <rect x="135" y="254" width="370" height="22" rx="11" fill={isRedacted ? '#dcfce7' : '#fee2e2'} />
          <text x="320" y="269" textAnchor="middle" fill={isRedacted ? '#15803d' : '#b91c1c'} fontSize="11" fontWeight="800" fontFamily="sans-serif">
            {isRedacted ? 'PII PERMANENTLY REDACTED · SAFE TO SHARE' : 'SENSITIVE DATA EXPOSED · REDACT BEFORE SHARING'}
          </text>
        </svg>
      </div>
    )
  }

  return (
    <div className="relative h-full w-full select-none overflow-hidden bg-gradient-to-br from-indigo-600 via-blue-500 to-teal-400">
      <svg viewBox="0 0 640 340" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={`sky-${mode}-${side}`} x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#1e1b4b" />
            <stop offset="48%" stopColor="#2563eb" />
            <stop offset="100%" stopColor="#14b8a6" />
          </linearGradient>
          <radialGradient id={`sun-${mode}-${side}`} cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#fef08a" />
            <stop offset="70%" stopColor="#fb923c" />
            <stop offset="100%" stopColor="#f43f5e" stopOpacity="0" />
          </radialGradient>
        </defs>
        <rect width="640" height="340" fill={`url(#sky-${mode}-${side})`} />
        <circle cx="485" cy="92" r="78" fill={`url(#sun-${mode}-${side})`} />
        <path d="M0 245 Q150 155 310 220 T640 190 L640 340 L0 340 Z" fill="#0f172a" opacity="0.35" />
        <path d="M0 278 Q200 215 390 262 T640 235 L640 340 L0 340 Z" fill="#090e1a" opacity="0.62" />
        {/* Crisp foreground subject (camera/document emblem) */}
        <g transform="translate(215, 76)">
          <rect x="0" y="20" width="210" height="162" rx="30" fill="#ffffff" />
          <rect x="14" y="34" width="182" height="134" rx="20" fill="#0f172a" />
          <circle cx="105" cy="101" r="46" fill="#2563eb" />
          <circle cx="105" cy="101" r="30" fill="#0ea5a0" />
          <circle cx="105" cy="101" r="14" fill="#ffffff" />
          <circle cx="116" cy="90" r="5" fill="#fef08a" />
          <rect x="70" y="6" width="70" height="22" rx="10" fill="#f43f5e" />
          <circle cx="174" cy="54" r="7" fill="#fbbf24" />
        </g>
      </svg>
    </div>
  )
}

export function LivePlayground() {
  const [mode, setMode] = useState<'compress' | 'redact'>('compress')
  const [split, setSplit] = useState(52)

  return (
    <section className="mx-auto max-w-7xl px-4 pt-14 sm:px-6" aria-labelledby="playground-heading">
      <Reveal>
        <SpotlightCard className="bento-card p-6 sm:p-8" glowColor="rgba(37, 99, 235, 0.12)">
          <div className="grid gap-8 lg:grid-cols-[.88fr_1.12fr] lg:items-center">
            {/* Left narrative & mode switcher */}
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-1 text-xs font-extrabold text-accent dark:bg-blue-500/15 dark:text-blue-300">
                <Sparkles className="h-3.5 w-3.5" /> Interactive live preview
              </span>
              <h2 id="playground-heading" className="mt-3 font-display text-2xl font-extrabold tracking-tight text-ink-950 dark:text-white sm:text-3xl">
                See studio-grade WASM results before you upload
              </h2>
              <p className="mt-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                Drag the divider to compare pixel-sharp on-device compression and permanent privacy redaction — zero watermarks, zero cloud queues.
              </p>

              {/* Mode toggle pills */}
              <div className="mt-5 inline-flex rounded-2xl border border-slate-200/90 bg-slate-100/80 p-1 dark:border-slate-700/80 dark:bg-[#0a1020]" role="tablist" aria-label="Demo mode">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'compress'}
                  onClick={() => setMode('compress')}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-extrabold transition ${
                    mode === 'compress'
                      ? 'bg-white text-ink-950 shadow-xs dark:bg-[#162238] dark:text-white'
                      : 'text-slate-500 hover:text-ink-950 dark:text-slate-400 dark:hover:text-white'
                  }`}
                >
                  <FileArchive className="h-3.5 w-3.5 text-teal2" /> Image Compression
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'redact'}
                  onClick={() => setMode('redact')}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-extrabold transition ${
                    mode === 'redact'
                      ? 'bg-white text-ink-950 shadow-xs dark:bg-[#162238] dark:text-white'
                      : 'text-slate-500 hover:text-ink-950 dark:text-slate-400 dark:hover:text-white'
                  }`}
                >
                  <EyeOff className="h-3.5 w-3.5 text-rose-500" /> Blur &amp; Redact
                </button>
              </div>

              {/* Savings metric strip */}
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-[#0b1120]">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Before</p>
                  <p className="mt-0.5 font-display text-lg font-extrabold text-ink-950 dark:text-white">
                    {mode === 'compress' ? '4.2 MB PNG' : 'PII Exposed'}
                  </p>
                </div>
                <div className="rounded-2xl border border-teal-200/80 bg-teal-50/70 p-3.5 dark:border-teal-500/30 dark:bg-teal-500/10">
                  <p className="text-[11px] font-bold uppercase tracking-wider text-teal-700 dark:text-teal-300">After</p>
                  <p className="mt-0.5 font-display text-lg font-extrabold text-teal-800 dark:text-teal-200">
                    {mode === 'compress' ? '180 KB WebP (−96%)' : 'Safely Redacted'}
                  </p>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link
                  to={mode === 'compress' ? '/tool/compress-image' : '/tool/blur-image'}
                  className="btn-accent"
                >
                  Try {mode === 'compress' ? 'Compress Image' : 'Blur & Redact'} <ArrowRight className="h-4 w-4" />
                </Link>
                {mode === 'compress' ? (
                  <Link to="/tool/compress-image-kb" className="btn-ghost">
                    Compress to 50 KB
                  </Link>
                ) : (
                  <Link to="/tool/passport-photo" className="btn-ghost">
                    Passport Photo Maker
                  </Link>
                )}
              </div>
            </div>

            {/* Right interactive Before/After slider */}
            <div className="relative h-64 overflow-hidden rounded-3xl border border-slate-200/90 shadow-card dark:border-slate-700/80 sm:h-76">
              {/* After layer (full) */}
              <DemoScene mode={mode} side="after" />

              {/* Before layer (clipped by split %) */}
              <div
                className="absolute inset-0"
                style={{ clipPath: `inset(0 ${100 - split}% 0 0)` }}
              >
                <DemoScene mode={mode} side="before" />
              </div>

              {/* Labels */}
              <span className="pointer-events-none absolute left-3.5 top-3.5 rounded-full bg-slate-950/75 px-3 py-1 text-[11px] font-extrabold text-white backdrop-blur">
                {mode === 'compress' ? 'Original · 4.2 MB' : 'Original Document'}
              </span>
              <span className="pointer-events-none absolute right-3.5 top-3.5 rounded-full bg-teal-600/90 px-3 py-1 text-[11px] font-extrabold text-white backdrop-blur">
                {mode === 'compress' ? 'WebP · 180 KB' : 'Redacted Copy'}
              </span>

              {/* Vertical divider & handle */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-white shadow-[0_0_12px_rgba(0,0,0,0.45)]"
                style={{ left: `${split}%` }}
              >
                <span className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-ink-950 text-white shadow-lg">
                  <GripVertical className="h-4 w-4" />
                </span>
              </div>

              {/* Accessible range input overlay */}
              <input
                type="range"
                min={8}
                max={92}
                value={split}
                aria-label="Drag to compare before and after"
                onChange={(e) => setSplit(Number(e.target.value))}
                className="absolute inset-0 z-20 h-full w-full cursor-ew-resize opacity-0"
              />
            </div>
          </div>
        </SpotlightCard>
      </Reveal>
    </section>
  )
}
