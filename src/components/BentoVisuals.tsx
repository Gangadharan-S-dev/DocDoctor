import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ArrowRight, GripVertical, Sparkles, EyeOff, FileArchive, Lock, ShieldCheck, CloudUpload, ScanLine } from 'lucide-react'
import { BorderBeam } from './FuturisticPrimitives'

/* ── 1. Zero-Re-Render 3D Tilt + Specular Spotlight Bento Card ───────────── */
export function SpotlightCard({
  children,
  className = '',
  glowColor = 'rgba(37, 99, 235, 0.16)',
  style,
  tilt = true,
  maxTilt = 3,
}: {
  children: React.ReactNode
  className?: string
  glowColor?: string
  style?: React.CSSProperties
  tilt?: boolean
  maxTilt?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])

  const handleMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch') return
    const el = ref.current
    if (!el) return
    const clientX = e.clientX
    const clientY = e.clientY
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const x = clientX - rect.left
      const y = clientY - rect.top
      el.style.setProperty('--mx', `${x.toFixed(1)}px`)
      el.style.setProperty('--my', `${y.toFixed(1)}px`)
      el.style.setProperty('--spot-o', '1')
      if (tilt) {
        const nx = (x / rect.width - 0.5) * 2
        const ny = (y / rect.height - 0.5) * 2
        el.dataset.tilting = 'true'
        el.style.setProperty('--rx', `${(-ny * maxTilt).toFixed(2)}deg`)
        el.style.setProperty('--ry', `${(nx * maxTilt).toFixed(2)}deg`)
        el.style.setProperty('--ty', '-3px')
      }
    })
  }

  const handleLeave = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    const el = ref.current
    if (!el) return
    delete el.dataset.tilting
    el.style.setProperty('--spot-o', '0')
    el.style.setProperty('--rx', '0deg')
    el.style.setProperty('--ry', '0deg')
    el.style.setProperty('--ty', '0px')
  }

  return (
    <div
      ref={ref}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      className={`${tilt ? 'tilt-card ' : ''}${className}`}
      style={style}
    >
      {/* Dynamic color spotlight */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 transition-opacity duration-300"
        style={{
          opacity: 'var(--spot-o, 0)',
          background: `radial-gradient(380px circle at var(--mx, 50%) var(--my, 50%), ${glowColor}, transparent 68%)`,
        }}
      />
      {/* Subtle 3D glass specular sheen */}
      {tilt && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-0 z-0 transition-opacity duration-300"
          style={{
            opacity: 'calc(var(--spot-o, 0) * 0.45)',
            background: 'radial-gradient(280px circle at var(--mx, 50%) var(--my, 50%), rgba(255,255,255,0.26), transparent 62%)',
          }}
        />
      )}
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

/* ── 4. 3D Isometric Category Sculptures for Bento Cards ─────────────────── */
export function PdfBentoArt() {
  return (
    <div className="scene-3d pointer-events-none relative hidden h-22 w-30 shrink-0 sm:block" aria-hidden>
      <div className="iso-deck-l relative h-full w-full">
        {/* Back 3D page layer */}
        <div
          className="absolute right-2 top-3 h-16 w-13 rounded-xl border border-rose-300/70 bg-rose-100/90 shadow-md dark:border-rose-500/40 dark:bg-rose-500/20"
          style={{ transform: 'translateZ(-4px) rotateZ(7deg)' }}
        />
        {/* Middle 3D sheet */}
        <div
          className="absolute right-5 top-2 h-16 w-13 rounded-xl border border-rose-200 bg-white p-2 shadow-lg dark:border-slate-700 dark:bg-[#131d33]"
          style={{ transform: 'translateZ(10px) rotateZ(-2deg)' }}
        >
          <div className="h-1.5 w-6 rounded-full bg-rose-500" />
          <div className="mt-1.5 h-1 w-8 rounded-full bg-slate-200 dark:bg-slate-700" />
          <div className="mt-1 h-1 w-7 rounded-full bg-slate-200 dark:bg-slate-700" />
          <div className="mt-1 h-1 w-5 rounded-full bg-slate-200 dark:bg-slate-700" />
        </div>
        {/* Floating 3D compression badge */}
        <span
          className="icon-3d absolute bottom-0 right-0 rounded-full bg-gradient-to-br from-rose-500 to-red-600 px-2.5 py-0.5 text-[10px] font-extrabold text-white"
          style={{ transform: 'translateZ(24px)' }}
        >
          −78%
        </span>
      </div>
    </div>
  )
}

export function ImageBentoArt() {
  return (
    <div className="scene-3d pointer-events-none relative hidden h-22 w-30 shrink-0 sm:block" aria-hidden>
      <div className="iso-deck-r relative h-full w-full">
        {/* Shadow depth plate */}
        <div
          className="absolute right-1 top-2.5 h-16 w-20 rounded-2xl border border-teal-400/30 bg-teal-500/20"
          style={{ transform: 'translateZ(-6px)' }}
        />
        {/* 3D Floating Photo Prism */}
        <div
          className="absolute right-2.5 top-1 h-16 w-20 overflow-hidden rounded-2xl border border-white/50 bg-gradient-to-br from-teal-400 via-cyan-500 to-blue-600 shadow-lg"
          style={{ transform: 'translateZ(10px)' }}
        >
          <svg viewBox="0 0 80 64" className="h-full w-full">
            <circle cx="58" cy="18" r="8" fill="#fef08a" opacity="0.95" />
            <path d="M0 50 L24 28 L44 44 L58 32 L80 50 L80 64 L0 64 Z" fill="#0f172a" opacity="0.35" />
            <path d="M0 56 L30 34 L54 52 L80 40 L80 64 L0 64 Z" fill="#0f172a" opacity="0.5" />
          </svg>
        </div>
        {/* Floating 3D Crop Reticle corner */}
        <div
          className="absolute right-4 top-2.5 h-6 w-6 rounded-tl-lg border-l-2 border-t-2 border-white/85"
          style={{ transform: 'translateZ(20px)' }}
        />
        {/* Floating 3D WebP badge */}
        <span
          className="icon-3d absolute bottom-0 right-0 rounded-full bg-gradient-to-br from-teal-500 to-emerald-600 px-2.5 py-0.5 text-[10px] font-extrabold text-white"
          style={{ transform: 'translateZ(26px)' }}
        >
          WebP
        </span>
      </div>
    </div>
  )
}

export function WordBentoArt() {
  return (
    <div className="scene-3d pointer-events-none relative hidden h-16 w-22 shrink-0 sm:block" aria-hidden>
      <div className="iso-deck-l relative h-full w-full">
        <div
          className="absolute right-0.5 top-2 h-12 w-14 rounded-xl border border-blue-200/70 bg-blue-100/70 dark:border-blue-500/30 dark:bg-blue-500/15"
          style={{ transform: 'translateZ(-4px)' }}
        />
        <div
          className="absolute right-2 top-0.5 h-12 w-14 rounded-xl border border-blue-200 bg-white p-2 shadow-md dark:border-blue-500/40 dark:bg-[#131d33]"
          style={{ transform: 'translateZ(10px)' }}
        >
          <div className="h-1.5 w-7 rounded-full bg-blue-500" />
          <div className="mt-1.5 h-1 w-10 rounded-full bg-slate-200 dark:bg-slate-700" />
          <div className="mt-1 h-1 w-8 rounded-full bg-slate-200 dark:bg-slate-700" />
          <div className="mt-1 h-1 w-9 rounded-full bg-slate-200 dark:bg-slate-700" />
        </div>
        <span
          className="icon-3d absolute bottom-0 right-0 rounded-full bg-gradient-to-br from-blue-500 to-indigo-600 px-2 py-0.5 text-[9px] font-extrabold text-white"
          style={{ transform: 'translateZ(22px)' }}
        >
          DOCX
        </span>
      </div>
    </div>
  )
}

export function PptBentoArt() {
  return (
    <div className="scene-3d pointer-events-none relative hidden h-16 w-22 shrink-0 sm:block" aria-hidden>
      <div className="iso-deck-l relative h-full w-full">
        <div
          className="absolute right-0 top-2.5 h-10 w-14 rounded-xl border border-orange-300/70 bg-orange-100/90 dark:border-orange-500/30 dark:bg-orange-500/20"
          style={{ transform: 'translateZ(-4px) rotateZ(7deg)' }}
        />
        <div
          className="absolute right-2.5 top-0.5 h-10 w-14 rounded-xl border border-orange-200 bg-white p-1.5 shadow-md dark:border-slate-700 dark:bg-[#131d33]"
          style={{ transform: 'translateZ(10px)' }}
        >
          <div className="h-1.5 w-6 rounded-full bg-orange-500" />
          <div className="mt-1.5 flex gap-1">
            <span className="h-4 w-5 rounded bg-orange-200/80 dark:bg-orange-500/30" />
            <span className="h-4 flex-1 rounded bg-slate-100 dark:bg-slate-800" />
          </div>
        </div>
        <span
          className="icon-3d absolute bottom-0 right-0 rounded-full bg-gradient-to-br from-orange-500 to-amber-600 px-2 py-0.5 text-[9px] font-extrabold text-white"
          style={{ transform: 'translateZ(22px)' }}
        >
          PPTX
        </span>
      </div>
    </div>
  )
}

export function ExcelBentoArt() {
  return (
    <div className="scene-3d pointer-events-none relative hidden h-16 w-22 shrink-0 sm:block" aria-hidden>
      <div className="iso-deck-r relative h-full w-full">
        {/* 3D Base Grid */}
        <div
          className="absolute right-1.5 top-1.5 grid h-11 w-14 grid-cols-3 gap-0.5 rounded-xl border border-emerald-200 bg-white p-1.5 shadow-md dark:border-emerald-500/35 dark:bg-[#131d33]"
          style={{ transform: 'translateZ(4px)' }}
        >
          <span className="col-span-3 h-2 rounded-sm bg-emerald-500/85" />
          {Array.from({ length: 6 }).map((_, i) => (
            <span key={i} className="rounded-sm bg-emerald-100 dark:bg-emerald-500/20" />
          ))}
        </div>
        {/* Raised 3D Bar Columns popping above sheet */}
        <div className="absolute right-3 bottom-3 flex items-end gap-1" style={{ transform: 'translateZ(16px)' }}>
          <span className="h-3 w-2 rounded-t bg-emerald-400 shadow-sm transition-all duration-300 group-hover:h-4" />
          <span className="h-5 w-2 rounded-t bg-emerald-500 shadow-sm transition-all duration-300 group-hover:h-6" />
          <span className="h-7 w-2 rounded-t bg-teal-500 shadow-sm transition-all duration-300 group-hover:h-8" />
        </div>
        <span
          className="icon-3d absolute bottom-0 right-0 rounded-full bg-gradient-to-br from-emerald-500 to-green-600 px-2 py-0.5 text-[9px] font-extrabold text-white"
          style={{ transform: 'translateZ(24px)' }}
        >
          XLSX
        </span>
      </div>
    </div>
  )
}

export function OtherBentoArt() {
  const faceCls =
    'absolute inset-0 flex items-center justify-center rounded-lg border border-violet-400/60 bg-violet-100/80 font-mono text-[9px] font-extrabold text-violet-700 dark:border-violet-400/50 dark:bg-violet-950/75 dark:text-violet-200'
  return (
    <div className="scene-3d pointer-events-none relative hidden h-14 w-18 shrink-0 items-center justify-center sm:flex" aria-hidden>
      <div className="preserve-3d animate-cube-mini relative h-9 w-9">
        <span className={faceCls} style={{ transform: 'translateZ(18px)' }}>{'{ }'}</span>
        <span className={faceCls} style={{ transform: 'rotateY(180deg) translateZ(18px)' }}>ZIP</span>
        <span className={faceCls} style={{ transform: 'rotateY(90deg) translateZ(18px)' }}>CSV</span>
        <span className={faceCls} style={{ transform: 'rotateY(-90deg) translateZ(18px)' }}>XML</span>
        <span className={faceCls} style={{ transform: 'rotateX(90deg) translateZ(18px)' }} />
        <span className={faceCls} style={{ transform: 'rotateX(-90deg) translateZ(18px)' }} />
      </div>
    </div>
  )
}

/* ── 4B. 3D Floating Glass Document Stack for Homepage Smart Dropzone ────── */
export function Hero3DFileStack({ dragActive }: { dragActive: boolean }) {
  const cards = [
    { label: 'PDF', color: '#E5484D', rest: 'translate3d(-74px, 8px, -24px) rotateZ(-16deg) rotateY(18deg)', pull: 'translate3d(-52px, 2px, -14px) rotateZ(-10deg) rotateY(10deg)' },
    { label: 'PNG', color: '#0EA5A0', rest: 'translate3d(74px, 8px, -24px) rotateZ(16deg) rotateY(-18deg)', pull: 'translate3d(52px, 2px, -14px) rotateZ(10deg) rotateY(-10deg)' },
    { label: 'DOCX', color: '#1D6FF2', rest: 'translate3d(-44px, -2px, -10px) rotateZ(-8deg) rotateY(10deg)', pull: 'translate3d(-32px, -4px, -4px) rotateZ(-4deg) rotateY(4deg)' },
    { label: 'XLSX', color: '#1F9D55', rest: 'translate3d(44px, -2px, -10px) rotateZ(8deg) rotateY(-10deg)', pull: 'translate3d(32px, -4px, -4px) rotateZ(4deg) rotateY(-4deg)' },
  ]

  return (
    <div className="scene-3d relative mx-auto flex h-24 w-60 items-center justify-center" aria-hidden>
      <div
        className="preserve-3d relative flex h-full w-full items-center justify-center transition-transform duration-500 ease-out"
        style={{ transform: dragActive ? 'rotateX(8deg) scale(1.05)' : 'rotateX(14deg)' }}
      >
        {cards.map((c) => (
          <div
            key={c.label}
            className="absolute z-10 flex h-14 w-11 flex-col justify-between rounded-xl border border-slate-200/90 bg-white p-1.5 shadow-md transition-transform duration-400 ease-out dark:border-slate-700 dark:bg-[#131d33]"
            style={{ transform: dragActive ? c.pull : c.rest }}
          >
            <span className="h-1.5 w-6 rounded-full" style={{ backgroundColor: c.color }} />
            <div className="space-y-1">
              <span className="block h-1 w-full rounded-full bg-slate-200 dark:bg-slate-700" />
              <span className="block h-1 w-2/3 rounded-full bg-slate-200 dark:bg-slate-700" />
            </div>
            <span className="text-[8px] font-extrabold tracking-wide" style={{ color: c.color }}>
              {c.label}
            </span>
          </div>
        ))}

        {/* Center 3D Levitating Upload Orb — always cleanly in front on Z-axis */}
        <div
          className="relative z-30 transition-transform duration-300"
          style={{ transform: dragActive ? 'translateZ(36px) scale(1.1)' : 'translateZ(26px)' }}
        >
          <span className="brand-grad icon-3d animate-bento-float flex h-14 w-14 items-center justify-center rounded-2xl text-white ring-4 ring-white/85 dark:ring-[#0a1020]">
            <CloudUpload className="h-6.5 w-6.5" />
          </span>
        </div>
      </div>
    </div>
  )
}

/* ── 4C. Interactive 6-Faced 3D Glass Security Vault Cube (GPU-Safe) ─────── */
export function PrivacyGlassVault3D() {
  const faceCls =
    'absolute inset-0 flex flex-col items-center justify-center rounded-2xl border border-teal-300/35 bg-gradient-to-br from-blue-500/25 via-slate-900/65 to-teal-400/25 shadow-[inset_0_1px_1px_rgba(255,255,255,0.28)]'

  return (
    <div className="scene-3d group/vault relative mx-auto flex h-44 w-44 shrink-0 items-center justify-center select-none" aria-hidden>
      {/* Ambient core glow (zero-blur radial gradient) */}
      <span
        className="pointer-events-none absolute h-40 w-40 rounded-full transition-transform duration-500 group-hover/vault:scale-115"
        style={{ background: 'radial-gradient(circle, rgba(45, 212, 191, 0.28) 0%, rgba(59, 130, 246, 0.14) 45%, transparent 72%)' }}
      />

      {/* 3D Orbiting Security Ring */}
      <div
        className="animate-orbit-3d pointer-events-none absolute h-38 w-38 rounded-full border border-dashed border-teal-300/40"
        style={{ boxShadow: '0 0 24px rgba(20, 184, 166, 0.25)' }}
      />

      {/* 6-Faced 3D Glass Cube */}
      <div className="preserve-3d animate-cube-3d relative h-24 w-24">
        <div className={faceCls} style={{ transform: 'translateZ(48px)' }}>
          <Lock className="h-7 w-7 text-teal-300 drop-shadow" />
          <span className="mt-1 text-[9px] font-extrabold uppercase tracking-widest text-white/85">Local</span>
        </div>
        <div className={faceCls} style={{ transform: 'rotateY(180deg) translateZ(48px)' }}>
          <ShieldCheck className="h-7 w-7 text-blue-300 drop-shadow" />
          <span className="mt-1 text-[9px] font-extrabold uppercase tracking-widest text-white/85">AES-256</span>
        </div>
        <div className={faceCls} style={{ transform: 'rotateY(90deg) translateZ(48px)' }}>
          <span className="font-display text-sm font-extrabold text-teal-300">0 MB</span>
          <span className="text-[9px] font-bold text-white/80">Cloud</span>
        </div>
        <div className={faceCls} style={{ transform: 'rotateY(-90deg) translateZ(48px)' }}>
          <span className="font-display text-sm font-extrabold text-blue-300">WASM</span>
          <span className="text-[9px] font-bold text-white/80">On-Device</span>
        </div>
        <div className={faceCls} style={{ transform: 'rotateX(90deg) translateZ(48px)' }} />
        <div className={faceCls} style={{ transform: 'rotateX(-90deg) translateZ(48px)' }} />
      </div>
    </div>
  )
}

/* ── 5. Interactive Live Before/After Playground ─────────────────────────── */
type DemoMode = 'compress' | 'redact' | 'scan'

function DemoScene({ mode, side }: { mode: DemoMode; side: 'before' | 'after' }) {
  if (mode === 'scan') {
    const isClean = side === 'after'
    return (
      <div className="relative h-full w-full select-none overflow-hidden bg-gradient-to-br from-slate-900 via-slate-950 to-indigo-950">
        <svg viewBox="0 0 640 340" className="h-full w-full" preserveAspectRatio="xMidYMid slice">
          <defs>
            <linearGradient id={`desk-shadow-${side}`} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#0f172a" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#020617" stopOpacity="0.08" />
            </linearGradient>
          </defs>
          {/* Ambient blueprint grid */}
          <path d="M0 80 H640 M0 160 H640 M0 240 H640 M160 0 V340 M320 0 V340 M480 0 V340" stroke="#38bdf8" strokeOpacity="0.1" strokeWidth="1" />
          {isClean ? (
            <>
              {/* Clean flattened scanned page */}
              <rect x="130" y="28" width="380" height="284" rx="14" fill="#ffffff" />
              <rect x="158" y="54" width="140" height="14" rx="7" fill="#0f172a" />
              <rect x="438" y="54" width="46" height="14" rx="7" fill="#0d9488" />
              <rect x="158" y="88" width="324" height="8" rx="4" fill="#334155" />
              <rect x="158" y="108" width="290" height="8" rx="4" fill="#475569" />
              <rect x="158" y="128" width="310" height="8" rx="4" fill="#475569" />
              <rect x="158" y="162" width="324" height="72" rx="10" fill="#f1f5f9" stroke="#cbd5e1" strokeWidth="1.5" />
              <rect x="176" y="180" width="120" height="8" rx="4" fill="#0f172a" />
              <rect x="176" y="200" width="220" height="8" rx="4" fill="#64748b" />
              <rect x="158" y="256" width="324" height="30" rx="10" fill="#dcfce7" />
              <text x="320" y="275" textAnchor="middle" fill="#15803d" fontSize="11" fontWeight="800" fontFamily="monospace">
                HOMOGRAPHY DESKEWED · SAUVOLA ENHANCED · 300 DPI
              </text>
            </>
          ) : (
            <>
              {/* Tilted skewed photo with desk shadow & 4-point corner handles */}
              <polygon points="150,52 510,34 484,296 116,274" fill="#d6d3c9" />
              <polygon points="150,52 510,34 484,296 116,274" fill={`url(#desk-shadow-${side})`} />
              <g transform="matrix(0.96, -0.05, -0.09, 0.94, 34, 24)" opacity="0.68">
                <rect x="158" y="54" width="140" height="14" rx="7" fill="#44403c" />
                <rect x="158" y="88" width="310" height="8" rx="4" fill="#57534e" />
                <rect x="158" y="108" width="275" height="8" rx="4" fill="#57534e" />
                <rect x="158" y="128" width="295" height="8" rx="4" fill="#57534e" />
                <rect x="158" y="162" width="310" height="72" rx="10" fill="#c7c2b6" />
              </g>
              {/* 4-point warp quad outline */}
              <polygon points="150,52 510,34 484,296 116,274" fill="none" stroke="#38bdf8" strokeWidth="2.5" strokeDasharray="8 6" />
              {[
                [150, 52],
                [510, 34],
                [484, 296],
                [116, 274],
              ].map(([cx, cy]) => (
                <g key={`${cx}-${cy}`}>
                  <circle cx={cx} cy={cy} r="9" fill="#0ea5e9" fillOpacity="0.25" />
                  <circle cx={cx} cy={cy} r="5" fill="#ffffff" stroke="#0284c7" strokeWidth="2.5" />
                </g>
              ))}
            </>
          )}
        </svg>
      </div>
    )
  }

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
  const [mode, setMode] = useState<DemoMode>('compress')
  const [split, setSplit] = useState(52)

  const meta =
    mode === 'compress'
      ? {
          beforeTitle: '4.2 MB PNG',
          afterTitle: '180 KB WebP (−96%)',
          beforeTag: 'Original · 4.2 MB',
          afterTag: 'WebP · 180 KB',
          primaryTo: '/tool/compress-image',
          primaryLabel: 'Try Compress Image',
          secondaryTo: '/tool/compress-image-kb',
          secondaryLabel: 'Compress to 50 KB',
        }
      : mode === 'redact'
        ? {
            beforeTitle: 'PII Exposed',
            afterTitle: 'Safely Redacted',
            beforeTag: 'Original Document',
            afterTag: 'Redacted Copy',
            primaryTo: '/tool/blur-image',
            primaryLabel: 'Try Blur & Redact',
            secondaryTo: '/tool/passport-photo',
            secondaryLabel: 'Passport Photo Maker',
          }
        : {
            beforeTitle: 'Skewed Photo',
            afterTitle: 'Flat 300 DPI Scan',
            beforeTag: 'Camera Capture',
            afterTag: 'Deskewed Scan',
            primaryTo: '/tool/crop-image',
            primaryLabel: 'Try 4-Point Scan Crop',
            secondaryTo: '/tool/ocr-pdf',
            secondaryLabel: 'OCR PDF (13 Langs)',
          }

  return (
    <section className="mx-auto max-w-7xl px-4 pt-14 sm:px-6" aria-labelledby="playground-heading">
      <Reveal>
        <SpotlightCard tilt={false} className="bento-card p-6 sm:p-8" glowColor="rgba(37, 99, 235, 0.12)">
          <BorderBeam durationSec={10} />
          <div className="grid gap-8 lg:grid-cols-[.88fr_1.12fr] lg:items-center">
            {/* Left narrative & mode switcher */}
            <div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3 py-1 font-mono text-[11px] font-extrabold uppercase tracking-wider text-accent dark:bg-blue-500/15 dark:text-blue-300">
                <Sparkles className="h-3.5 w-3.5" /> Interactive live preview
              </span>
              <h2 id="playground-heading" className="display-section mt-3 font-display font-extrabold text-ink-950 dark:text-white">
                See studio-grade WASM results before you upload
              </h2>
              <p className="mt-2.5 text-sm leading-relaxed text-slate-600 dark:text-slate-300">
                Drag the divider to compare pixel-sharp on-device compression, permanent privacy redaction, and 4-point document deskewing — zero watermarks, zero cloud queues.
              </p>

              {/* Mode toggle pills */}
              <div className="mt-5 inline-flex flex-wrap gap-1 rounded-2xl border border-slate-200/90 bg-slate-100/80 p-1 dark:border-slate-700/80 dark:bg-[#0a1020]" role="tablist" aria-label="Demo mode">
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'compress'}
                  onClick={() => setMode('compress')}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-extrabold transition ${
                    mode === 'compress'
                      ? 'bg-white text-ink-950 shadow-xs dark:bg-[#162238] dark:text-white'
                      : 'text-slate-500 hover:text-ink-950 dark:text-slate-400 dark:hover:text-white'
                  }`}
                >
                  <FileArchive className="h-3.5 w-3.5 text-teal2" /> Compress
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'redact'}
                  onClick={() => setMode('redact')}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-extrabold transition ${
                    mode === 'redact'
                      ? 'bg-white text-ink-950 shadow-xs dark:bg-[#162238] dark:text-white'
                      : 'text-slate-500 hover:text-ink-950 dark:text-slate-400 dark:hover:text-white'
                  }`}
                >
                  <EyeOff className="h-3.5 w-3.5 text-rose-500" /> Blur &amp; Redact
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={mode === 'scan'}
                  onClick={() => setMode('scan')}
                  className={`inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-extrabold transition ${
                    mode === 'scan'
                      ? 'bg-white text-ink-950 shadow-xs dark:bg-[#162238] dark:text-white'
                      : 'text-slate-500 hover:text-ink-950 dark:text-slate-400 dark:hover:text-white'
                  }`}
                >
                  <ScanLine className="h-3.5 w-3.5 text-blue-500" /> Perspective Scan
                </button>
              </div>

              {/* Savings metric strip */}
              <div className="mt-5 grid grid-cols-2 gap-3">
                <div className="rounded-2xl border border-slate-200/80 bg-slate-50/80 p-3.5 dark:border-slate-800 dark:bg-[#0b1120]">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-slate-400">Before</p>
                  <p className="mt-0.5 font-display text-lg font-extrabold text-ink-950 dark:text-white">
                    {meta.beforeTitle}
                  </p>
                </div>
                <div className="rounded-2xl border border-teal-200/80 bg-teal-50/70 p-3.5 dark:border-teal-500/30 dark:bg-teal-500/10">
                  <p className="font-mono text-[10px] font-bold uppercase tracking-widest text-teal-700 dark:text-teal-300">After</p>
                  <p className="mt-0.5 font-display text-lg font-extrabold text-teal-800 dark:text-teal-200">
                    {meta.afterTitle}
                  </p>
                </div>
              </div>

              <div className="mt-6 flex flex-wrap gap-3">
                <Link to={meta.primaryTo} className="btn-accent">
                  {meta.primaryLabel} <ArrowRight className="h-4 w-4" />
                </Link>
                <Link to={meta.secondaryTo} className="btn-ghost">
                  {meta.secondaryLabel}
                </Link>
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
              <span className="pointer-events-none absolute left-3.5 top-3.5 rounded-full bg-slate-950/85 px-3 py-1 text-[11px] font-extrabold text-white">
                {meta.beforeTag}
              </span>
              <span className="pointer-events-none absolute right-3.5 top-3.5 rounded-full bg-teal-600/95 px-3 py-1 text-[11px] font-extrabold text-white">
                {meta.afterTag}
              </span>

              {/* Precision HUD split telemetry */}
              <span className="pointer-events-none absolute bottom-3 right-3.5 rounded-full border border-white/15 bg-slate-950/85 px-2.5 py-0.5 font-mono text-[10px] font-bold tracking-wider text-slate-200 tabular-nums">
                SPLIT · {split}%
              </span>

              {/* Vertical divider & glowing handle */}
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-white shadow-[0_0_16px_rgba(56,189,248,0.65)]"
                style={{ left: `${split}%` }}
              >
                <span className="absolute left-1/2 top-1/2 flex h-10 w-10 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-ink-950 text-white shadow-[0_0_20px_rgba(37,99,235,0.5)]">
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
