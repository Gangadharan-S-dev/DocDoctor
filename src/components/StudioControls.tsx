import { useEffect, useState } from 'react'
import { Check, Copy, Download, Grid, SplitSquareVertical, X, ZoomIn, ZoomOut } from 'lucide-react'
import { formatSize } from '../data/tools'

/** Tactile filled-track Studio Slider that adapts automatically to the active Studio Accent theme. */
export function StudioSlider({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix = '',
  defaultValue,
}: {
  label: string
  value: number
  onChange: (n: number) => void
  min: number
  max: number
  step?: number
  suffix?: string
  defaultValue?: number
}) {
  const span = Math.max(0.0001, max - min)
  const pct = Math.max(0, Math.min(100, ((value - min) / span) * 100))

  return (
    <label className="block">
      <span className="mb-2 flex items-center justify-between gap-2 text-sm font-bold text-ink-950 dark:text-slate-100">
        <span>{label}</span>
        <span
          onDoubleClick={defaultValue !== undefined ? () => onChange(defaultValue) : undefined}
          title={defaultValue !== undefined ? 'Double-click to reset' : undefined}
          className="inline-flex items-center rounded-lg px-2 py-0.5 text-xs font-extrabold tabular-nums"
          style={{ backgroundColor: 'var(--accent-glow)', color: 'var(--color-accent)' }}
        >
          {value}{suffix}
        </span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(+e.target.value)}
        className="studio-range w-full"
        style={{ '--range-pct': `${pct}%` } as React.CSSProperties}
      />
    </label>
  )
}

/** Shimmer skeleton placeholder for lazy-loaded visual editors (VisualCrop, PdfPageGrid, Pickers). */
export function StudioSkeleton({ label = 'Loading studio editor…' }: { label?: string }) {
  return (
    <div className="space-y-3 py-3" role="status" aria-label={label}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="skeleton-shimmer h-8 w-44 rounded-xl" />
        <div className="flex gap-2">
          <div className="skeleton-shimmer h-8 w-20 rounded-xl" />
          <div className="skeleton-shimmer h-8 w-20 rounded-xl" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="skeleton-shimmer h-56 rounded-2xl lg:col-span-2" />
        <div className="skeleton-shimmer h-56 rounded-2xl" />
      </div>
      <span className="sr-only">{label}</span>
    </div>
  )
}

/** 3-Step Studio Progress Bar: 1. Upload -> 2. Customize -> 3. Download */
export function WorkspaceStepper({ step }: { step: 1 | 2 | 3 }) {
  const steps = [
    { n: 1 as const, label: 'Upload' },
    { n: 2 as const, label: 'Customize' },
    { n: 3 as const, label: 'Download' },
  ]
  return (
    <ol className="mb-5 flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-slate-50/80 px-3.5 py-2.5 dark:border-slate-800 dark:bg-[#0b1120]" aria-label="Workspace progress">
      {steps.map((s, idx) => {
        const done = step > s.n
        const active = step === s.n
        return (
          <li key={s.n} className="flex flex-1 items-center gap-2">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold transition duration-200 ${
                done
                  ? 'bg-teal-600 text-white shadow-xs'
                  : active
                    ? 'brand-grad text-white shadow-sm'
                    : 'bg-slate-200/90 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : s.n}
            </span>
            <span
              className={`text-xs font-extrabold tracking-tight ${
                active
                  ? 'text-ink-950 dark:text-white'
                  : done
                    ? 'text-teal-700 dark:text-teal-300'
                    : 'text-slate-400 dark:text-slate-500'
              }`}
            >
              {s.label}
            </span>
            {idx < steps.length - 1 && (
              <span
                aria-hidden
                className={`ml-auto h-[2px] flex-1 rounded-full transition duration-300 ${
                  done ? 'bg-teal-500' : 'bg-slate-200 dark:bg-slate-800'
                }`}
              />
            )}
          </li>
        )
      })}
    </ol>
  )
}

/** Animated radial SVG savings ring + size delta summary. */
export function SavingsGauge({
  savingsPct,
  totalIn,
  totalOut,
}: {
  savingsPct: number
  totalIn: number
  totalOut: number
}) {
  const clamped = Math.max(0, Math.min(99, savingsPct))
  const r = 20
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - clamped / 100)
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-teal-200/80 bg-white/90 px-3.5 py-2 shadow-2xs dark:border-teal-500/30 dark:bg-[#0b1120]">
      <div className="relative flex h-12 w-12 shrink-0 items-center justify-center">
        <svg className="h-12 w-12 -rotate-90" viewBox="0 0 48 48" aria-hidden>
          <circle cx="24" cy="24" r={r} fill="none" stroke="currentColor" strokeWidth="4.5" className="text-slate-200 dark:text-slate-800" />
          <circle
            cx="24"
            cy="24"
            r={r}
            fill="none"
            stroke="url(#dd-savings-grad)"
            strokeWidth="4.5"
            strokeLinecap="round"
            strokeDasharray={circ}
            strokeDashoffset={offset}
            className="transition-all duration-700"
          />
          <defs>
            <linearGradient id="dd-savings-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0d9488" />
              <stop offset="100%" stopColor="#10b981" />
            </linearGradient>
          </defs>
        </svg>
        <span className="absolute text-[11px] font-extrabold tabular-nums text-teal-700 dark:text-teal-300">
          -{clamped}%
        </span>
      </div>
      <div className="text-xs leading-tight">
        <p className="font-extrabold text-teal-700 dark:text-teal-300">
          Saved {formatSize(Math.max(0, totalIn - totalOut))}
        </p>
        <p className="mt-0.5 font-semibold text-slate-500 dark:text-slate-400">
          {formatSize(totalIn)} → {formatSize(totalOut)}
        </p>
      </div>
    </div>
  )
}

/** Zoomable Fullscreen Image Inspector Lightbox */
export function ImageLightbox({
  imageUrl,
  originalUrl,
  fileName,
  sizeBytes,
  onClose,
  onDownload,
  onCopy,
  copied,
}: {
  imageUrl: string
  originalUrl?: string | null
  fileName: string
  sizeBytes: number
  onClose: () => void
  onDownload: () => void
  onCopy?: () => void
  copied?: boolean
}) {
  const [zoom, setZoom] = useState<'fit' | 1 | 1.5 | 2>('fit')
  const [checker, setChecker] = useState(true)
  const [showOrig, setShowOrig] = useState(false)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  const activeSrc = showOrig && originalUrl ? originalUrl : imageUrl

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Inspect ${fileName}`}
      className="fixed inset-0 z-50 flex flex-col bg-slate-950/88 p-3 backdrop-blur-md sm:p-6"
      onClick={onClose}
    >
      {/* Top Toolbar */}
      <div
        className="mx-auto mb-3 flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-slate-900/90 px-4 py-2.5 text-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="min-w-0">
          <p className="truncate font-display text-sm font-extrabold">{fileName}</p>
          <p className="text-[11px] font-semibold text-slate-400">
            {formatSize(sizeBytes)} · {showOrig ? 'Viewing Original' : 'Viewing Output'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* Zoom presets */}
          <div className="flex items-center rounded-xl border border-white/10 bg-white/5 p-0.5 text-xs font-bold">
            {(['fit', 1, 1.5, 2] as const).map((z) => (
              <button
                key={String(z)}
                type="button"
                onClick={() => setZoom(z)}
                className={`rounded-lg px-2.5 py-1 transition ${
                  zoom === z ? 'brand-grad text-white shadow-xs' : 'text-slate-300 hover:text-white'
                }`}
              >
                {z === 'fit' ? 'Fit' : `${Math.round(z * 100)}%`}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={() => setZoom((z) => (z === 'fit' ? 1.5 : z === 1 ? 1.5 : z === 1.5 ? 2 : 'fit'))}
            aria-label="Toggle zoom"
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-200 transition hover:bg-white/10"
          >
            {zoom === 2 ? <ZoomOut className="h-4 w-4" /> : <ZoomIn className="h-4 w-4" />}
          </button>

          <button
            type="button"
            onClick={() => setChecker((c) => !c)}
            title="Toggle transparency checkerboard"
            className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-bold transition ${
              checker ? 'border-white/25 bg-white/15 text-white' : 'border-white/10 bg-white/5 text-slate-300 hover:bg-white/10'
            }`}
          >
            <Grid className="h-3.5 w-3.5" /> Alpha
          </button>

          {originalUrl && (
            <button
              type="button"
              onClick={() => setShowOrig((s) => !s)}
              className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1.5 text-xs font-bold transition ${
                showOrig ? 'border-amber-400/50 bg-amber-500/20 text-amber-200' : 'border-white/10 bg-white/5 text-slate-200 hover:bg-white/10'
              }`}
            >
              <SplitSquareVertical className="h-3.5 w-3.5" /> {showOrig ? 'Original' : 'Compare Orig'}
            </button>
          )}

          {onCopy && (
            <button
              type="button"
              onClick={onCopy}
              className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-white/10 px-3 py-1.5 text-xs font-bold text-white transition hover:bg-white/20"
            >
              {copied ? <><Check className="h-3.5 w-3.5 text-emerald-400" /> Copied</> : <><Copy className="h-3.5 w-3.5" /> Copy</>}
            </button>
          )}

          <button
            type="button"
            onClick={onDownload}
            className="brand-grad inline-flex items-center gap-1 rounded-xl px-3 py-1.5 text-xs font-extrabold text-white shadow-sm transition hover:brightness-110"
          >
            <Download className="h-3.5 w-3.5" /> Download
          </button>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close inspector"
            className="rounded-xl border border-white/10 bg-white/5 p-2 text-slate-300 transition hover:bg-white/15 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Zoomable Canvas Area */}
      <div
        className={`mx-auto flex flex-1 w-full max-w-6xl items-center justify-center overflow-auto rounded-3xl border border-white/10 p-4 ${
          checker ? 'checker-bg' : 'bg-slate-900'
        }`}
        onClick={(e) => e.stopPropagation()}
      >
        <img
          src={activeSrc}
          alt={fileName}
          style={
            zoom === 'fit'
              ? undefined
              : { transform: `scale(${zoom})`, transformOrigin: 'center center' }
          }
          className={`rounded-xl shadow-2xl transition-transform duration-200 ${
            zoom === 'fit' ? 'max-h-full max-w-full object-contain' : 'max-h-[75vh] max-w-none'
          }`}
        />
      </div>
    </div>
  )
}
