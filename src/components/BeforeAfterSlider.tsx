import { useRef, useState } from 'react'
import { GripVertical, Search } from 'lucide-react'

interface BeforeAfterSliderProps {
  originalUrl: string
  processedUrl: string
  originalLabel?: string
  processedLabel?: string
}

export default function BeforeAfterSlider({
  originalUrl,
  processedUrl,
  originalLabel = 'Original',
  processedLabel = 'Processed',
}: BeforeAfterSliderProps) {
  const [sliderPos, setSliderPos] = useState(50)
  const [loupeOn, setLoupeOn] = useState(false)
  const [loupe, setLoupe] = useState<{ x: number; y: number; pctX: number; pctY: number; w: number; h: number } | null>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleLoupeMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!loupeOn || e.pointerType === 'touch') return
    const rect = containerRef.current?.getBoundingClientRect()
    if (!rect || !rect.width || !rect.height) return
    const x = Math.max(0, Math.min(e.clientX - rect.left, rect.width))
    const y = Math.max(0, Math.min(e.clientY - rect.top, rect.height))
    setLoupe({
      x,
      y,
      pctX: (x / rect.width) * 100,
      pctY: (y / rect.height) * 100,
      w: rect.width,
      h: rect.height,
    })
  }

  return (
    <div className="space-y-2.5">
      {/* Studio HUD Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-bold text-slate-500 dark:text-slate-400">
        <span className="font-mono text-[11px] uppercase tracking-wider">
          SPLIT · <strong className="tabular-nums text-ink-950 dark:text-white">{sliderPos}%</strong> Original /{' '}
          <strong className="tabular-nums text-teal-600 dark:text-teal-300">{100 - sliderPos}%</strong> Output
        </span>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => {
              setLoupeOn((v) => !v)
              setLoupe(null)
            }}
            aria-pressed={loupeOn}
            title="Toggle 2× pixel inspection loupe"
            className={`inline-flex items-center gap-1 rounded-xl border px-2.5 py-1 text-[11px] font-extrabold transition ${
              loupeOn
                ? 'brand-grad border-transparent text-white shadow-xs'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-[#111a2e] dark:text-slate-300'
            }`}
          >
            <Search className="h-3 w-3" /> 2× Loupe
          </button>
        </div>
      </div>

      {/* Interactive Split Stage */}
      <div
        ref={containerRef}
        onPointerMove={handleLoupeMove}
        onPointerLeave={() => setLoupe(null)}
        className="relative mx-auto max-h-[460px] w-full select-none overflow-hidden rounded-2xl border border-slate-200/90 bg-slate-100 shadow-md dark:border-slate-700/80 dark:bg-[#0b1120]"
      >
        {/* Processed (Bottom layer) */}
        <img
          src={processedUrl}
          alt="Processed"
          className="mx-auto block max-h-[460px] w-full object-contain"
        />
        <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-teal-600/90 px-3 py-1 text-[11px] font-extrabold text-white shadow-sm backdrop-blur-md">
          {processedLabel}
        </span>

        {/* Original (Clipped top layer) */}
        <div
          className="pointer-events-none absolute inset-0"
          style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
        >
          <img
            src={originalUrl}
            alt="Original"
            className="mx-auto block h-full max-h-[460px] w-full object-contain"
          />
          <span className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-slate-950/80 px-3 py-1 text-[11px] font-extrabold text-white shadow-sm backdrop-blur-md">
            {originalLabel}
          </span>
        </div>

        {/* Specular Divider & Handle */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 z-10 w-0.5 bg-white shadow-[0_0_0_1px_rgba(15,23,42,0.18),0_0_14px_rgba(56,189,248,0.55)]"
          style={{ left: `${sliderPos}%` }}
        >
          <span className="absolute left-1/2 top-1/2 flex h-9 w-9 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-ink-950 text-white shadow-[0_0_18px_rgba(37,99,235,0.5)]">
            <GripVertical className="h-4 w-4" />
          </span>
        </div>

        {/* Optional 2× Optical Loupe Lens */}
        {loupeOn && loupe && (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute z-30 h-32 w-32 -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-full border-2 border-white shadow-[0_12px_32px_rgba(0,0,0,0.45),0_0_0_3px_var(--accent-glow)]"
            style={{
              left: `${loupe.x}px`,
              top: `${loupe.y}px`,
              backgroundImage: `url(${loupe.pctX < sliderPos ? originalUrl : processedUrl})`,
              backgroundRepeat: 'no-repeat',
              backgroundSize: `${loupe.w * 2}px ${loupe.h * 2}px`,
              backgroundPosition: `${-(loupe.x * 2 - 64)}px ${-(loupe.y * 2 - 64)}px`,
            }}
          >
            <span className="absolute bottom-1.5 left-1/2 -translate-x-1/2 rounded-full bg-slate-950/80 px-2 py-0.5 font-mono text-[9px] font-extrabold uppercase tracking-wider text-white">
              {loupe.pctX < sliderPos ? 'ORIG 2×' : 'OUT 2×'}
            </span>
          </div>
        )}

        {/* Accessible Range Input Overlay (mouse, touch, and ArrowLeft/ArrowRight keyboard support) */}
        <input
          type="range"
          min={2}
          max={98}
          value={sliderPos}
          aria-label="Compare original and processed image"
          onChange={(e) => setSliderPos(Number(e.target.value))}
          className="absolute inset-0 z-20 h-full w-full cursor-ew-resize opacity-0"
        />
      </div>
    </div>
  )
}
