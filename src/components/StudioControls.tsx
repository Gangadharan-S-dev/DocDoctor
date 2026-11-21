import { useEffect, useState, type ReactNode } from 'react'
import { Check, Copy, Download, Grid, SplitSquareVertical, Workflow, X, ZoomIn, ZoomOut } from 'lucide-react'
import { formatSize, type CategoryId } from '../data/tools'
import StudioDialog from './StudioDialog'

/**
 * WCAG AA category badge/pill driven by CSS custom properties (`data-category`).
 * Ensures >=4.5:1 text contrast in both light and dark modes for all 6 categories.
 */
export function CategoryPill({
  category,
  children,
  className = '',
}: {
  category: CategoryId
  children: ReactNode
  className?: string
}) {
  return (
    <span
      data-category={category}
      className={`cat-pill inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[11px] font-extrabold tracking-wide ${className}`}
    >
      {children}
    </span>
  )
}

/**
 * Reusable elevated Studio Panel container for tool configuration blocks.
 */
export function StudioPanel({
  title,
  subtitle,
  action,
  children,
  className = '',
}: {
  title?: string
  subtitle?: string
  action?: ReactNode
  children: ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-2xl border border-slate-200/85 bg-surface-2/75 p-4 dark:border-slate-800/90 dark:bg-surface-2/85 ${className}`}>
      {(title || action) && (
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div>
            {title && <p className="font-display text-sm font-extrabold text-fg-primary">{title}</p>}
            {subtitle && <p className="mt-0.5 text-xs text-fg-muted">{subtitle}</p>}
          </div>
          {action}
        </div>
      )}
      {children}
    </div>
  )
}

/**
 * Visual multi-step tool chaining pipeline bar showing completed steps,
 * active tool stage, and live payload size telemetry.
 */
export function PipelineBreadcrumb({
  steps,
  currentToolName,
  category,
  fileCount,
  totalBytes,
}: {
  steps: string[]
  currentToolName: string
  category?: CategoryId
  fileCount?: number
  totalBytes?: number
}) {
  if (steps.length === 0) return null

  return (
    <div
      data-category={category}
      className="mb-4 flex flex-wrap items-center justify-between gap-2.5 rounded-2xl border border-slate-200/85 bg-surface-2/80 px-3.5 py-2.5 text-xs font-bold text-fg-primary shadow-2xs dark:border-slate-800 dark:bg-surface-2/90"
      aria-label="Multi-step workflow pipeline"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="cat-pill inline-flex items-center gap-1.5 rounded-lg px-2 py-1 font-mono text-[10px] font-extrabold uppercase tracking-widest">
          <Workflow className="h-3.5 w-3.5 shrink-0" aria-hidden />
          Pipeline
        </span>

        {steps.map((stepName, idx) => (
          <span key={`${stepName}-${idx}`} className="inline-flex items-center gap-1.5">
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-surface-1 px-2.5 py-1 text-[11px] font-bold text-fg-secondary ring-1 ring-slate-200/90 dark:ring-slate-700/80">
              <span className="flex h-4 w-4 items-center justify-center rounded-full bg-teal-500/15 text-teal-700 dark:text-teal-300">
                <Check className="h-2.5 w-2.5" aria-hidden />
              </span>
              <span>{stepName}</span>
            </span>
            <span
              aria-hidden
              className="h-[2px] w-3.5 rounded-full"
              style={{ background: 'linear-gradient(90deg, #14b8a6, var(--ws-cat))' }}
            />
          </span>
        ))}

        <span
          className="inline-flex items-center gap-1.5 rounded-xl px-2.5 py-1 text-[11px] font-extrabold text-white shadow-sm"
          style={{ backgroundColor: 'var(--ws-cat)' }}
        >
          <span className="h-1.5 w-1.5 rounded-full bg-white" aria-hidden />
          <span>{currentToolName}</span>
        </span>
      </div>

      {typeof fileCount === 'number' && fileCount > 0 && (
        <span className="inline-flex items-center gap-1.5 rounded-lg bg-surface-1 px-2.5 py-1 font-mono text-[11px] font-bold tabular-nums text-fg-muted ring-1 ring-slate-200/80 dark:ring-slate-700/80">
          <span>{fileCount} {fileCount === 1 ? 'file' : 'files'}</span>
          {typeof totalBytes === 'number' && totalBytes > 0 && (
            <>
              <span aria-hidden className="text-slate-300 dark:text-slate-600">·</span>
              <span>{formatSize(totalBytes)}</span>
            </>
          )}
        </span>
      )}
    </div>
  )
}

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
          className="inline-flex items-center rounded-lg px-2 py-0.5 font-mono text-xs font-bold tabular-nums"
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

/** 3-Step Studio Progress Bar: 1. Upload -> 2. Customize -> 3. Download (adapts to category color). */
export function WorkspaceStepper({ step, category }: { step: 1 | 2 | 3; category?: CategoryId }) {
  const steps = [
    { n: 1 as const, label: 'Upload' },
    { n: 2 as const, label: 'Customize' },
    { n: 3 as const, label: 'Download' },
  ]
  return (
    <ol
      data-category={category}
      className="mb-5 flex items-center gap-2 rounded-2xl border border-slate-200/80 bg-surface-2/70 px-3.5 py-2.5 dark:border-slate-800 dark:bg-[#0b1120]"
      aria-label="Workspace progress"
    >
      {steps.map((s, idx) => {
        const done = step > s.n
        const active = step === s.n
        return (
          <li key={s.n} className="flex flex-1 items-center gap-2">
            <span
              className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full font-mono text-[11px] font-bold transition duration-200 ${
                done
                  ? 'bg-teal-600 text-white shadow-xs'
                  : active
                    ? 'text-white shadow-sm'
                    : 'bg-slate-200/90 text-slate-500 dark:bg-slate-800 dark:text-slate-400'
              }`}
              style={
                active
                  ? {
                      backgroundColor: category ? 'var(--ws-cat)' : undefined,
                      backgroundImage: category ? undefined : 'var(--accent-grad)',
                      boxShadow: `0 0 0 4px ${category ? 'var(--ws-cat-glow)' : 'var(--accent-glow)'}`,
                    }
                  : undefined
              }
            >
              {done ? <Check className="h-3.5 w-3.5" /> : s.n}
            </span>
            <span
              className={`text-xs font-extrabold tracking-tight ${
                active
                  ? 'text-fg-primary'
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

/** Animated radial SVG savings ring + size delta summary with smooth count-up. */
export function SavingsGauge({
  savingsPct,
  totalIn,
  totalOut,
}: {
  savingsPct: number
  totalIn: number
  totalOut: number
}) {
  const target = Math.max(0, Math.min(99, savingsPct))
  const [displayPct, setDisplayPct] = useState(target)

  useEffect(() => {
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    const start = performance.now()
    const dur = reduced || target <= 0 ? 0 : 520
    const tick = (now: number) => {
      const p = dur === 0 ? 1 : Math.min(1, (now - start) / dur)
      const eased = 1 - Math.pow(1 - p, 3)
      setDisplayPct(Math.round(target * eased))
      if (p < 1) raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [target])

  const r = 20
  const circ = 2 * Math.PI * r
  const offset = circ * (1 - displayPct / 100)
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
            className="transition-all duration-150"
          />
          <defs>
            <linearGradient id="dd-savings-grad" x1="0%" y1="0%" x2="100%" y2="100%">
              <stop offset="0%" stopColor="#0d9488" />
              <stop offset="100%" stopColor="#10b981" />
            </linearGradient>
          </defs>
        </svg>
        <span className="absolute font-mono text-[10px] font-bold tabular-nums text-teal-700 dark:text-teal-300">
          -{displayPct}%
        </span>
      </div>
      <div className="text-xs leading-tight">
        <p className="font-extrabold text-teal-700 dark:text-teal-300">
          Saved <span className="font-mono tabular-nums">{formatSize(Math.max(0, totalIn - totalOut))}</span>
        </p>
        <p className="mt-0.5 font-mono text-[11px] font-semibold tabular-nums text-slate-500 dark:text-slate-400">
          {formatSize(totalIn)} → {formatSize(totalOut)}
        </p>
      </div>
    </div>
  )
}

/** Zoomable Fullscreen Image Inspector Lightbox powered by StudioDialog. */
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
  const [checker, setChecker] = useState(false)
  const [showOrig, setShowOrig] = useState(false)

  const activeSrc = showOrig && originalUrl ? originalUrl : imageUrl

  return (
    <StudioDialog
      open
      onClose={onClose}
      ariaLabel={`Inspect ${fileName}`}
      placement="fullscreen"
      beam={false}
    >
      {/* Top Toolbar */}
      <div className="mx-auto mb-3 flex w-full max-w-6xl flex-wrap items-center justify-between gap-2 rounded-2xl border border-white/10 bg-[#0d1425]/95 px-4 py-2.5 text-white shadow-xl">
        <div className="min-w-0">
          <p className="truncate font-display text-sm font-extrabold">{fileName}</p>
          <p className="font-mono text-[11px] font-semibold tabular-nums text-slate-400">
            {formatSize(sizeBytes)} · {showOrig ? 'Viewing Original' : 'Viewing Output'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {/* Zoom presets */}
          <div className="flex items-center rounded-xl border border-white/10 bg-white/5 p-0.5 font-mono text-xs font-bold">
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
          checker ? 'checker-bg' : 'bg-[#090e1a]'
        }`}
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
    </StudioDialog>
  )
}
