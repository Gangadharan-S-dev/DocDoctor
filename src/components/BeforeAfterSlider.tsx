import { useRef, useState } from 'react'

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
  const [isDragging, setIsDragging] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)

  const handleMove = (clientX: number) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const x = Math.max(0, Math.min(clientX - rect.left, rect.width))
    const pct = Math.round((x / rect.width) * 100)
    setSliderPos(pct)
  }

  const handlePointerDown = (e: React.PointerEvent) => {
    setIsDragging(true)
    handleMove(e.clientX)
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (isDragging) {
      handleMove(e.clientX)
    }
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    setIsDragging(false)
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs font-bold text-slate-500">
        <span>Drag slider to compare before / after quality</span>
        <span>{sliderPos}% Original / {100 - sliderPos}% Processed</span>
      </div>

      <div
        ref={containerRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        className="relative mx-auto max-h-[460px] w-full cursor-ew-resize select-none overflow-hidden rounded-2xl bg-slate-100 ring-1 ring-slate-200/80 shadow-md"
      >
        {/* Processed (Bottom layer) */}
        <img
          src={processedUrl}
          alt="Processed"
          className="block max-h-[460px] w-full object-contain mx-auto"
        />
        <div className="absolute bottom-3 right-3 rounded-lg bg-black/60 px-2.5 py-1 text-xs font-bold text-white backdrop-blur">
          {processedLabel}
        </div>

        {/* Original (Clipped top layer with clip-path) */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{ clipPath: `inset(0 ${100 - sliderPos}% 0 0)` }}
        >
          <img
            src={originalUrl}
            alt="Original"
            className="block max-h-[460px] w-full h-full object-contain mx-auto"
          />
          <div className="absolute bottom-3 left-3 rounded-lg bg-black/60 px-2.5 py-1 text-xs font-bold text-white backdrop-blur">
            {originalLabel}
          </div>
        </div>

        {/* Divider bar */}
        <div
          className="absolute inset-y-0 w-0.5 bg-white shadow-[0_0_10px_rgba(0,0,0,0.5)]"
          style={{ left: `${sliderPos}%` }}
        >
          <div className="absolute top-1/2 -translate-x-1/2 -translate-y-1/2 flex h-8 w-8 items-center justify-center rounded-full border-2 border-white bg-accent text-white shadow-lg">
            <span className="text-[10px] font-extrabold tracking-tighter">◀ ▶</span>
          </div>
        </div>
      </div>
    </div>
  )
}
