import { useState, useRef, useEffect } from 'react'
import { RotateCcw, Circle } from 'lucide-react'

interface VisualCropProps {
  imageUrl: string
  crop: { x: number; y: number; w: number; h: number }
  onChange: (crop: { x: number; y: number; w: number; h: number }) => void
  circular?: boolean
  onCircularChange?: (circular: boolean) => void
  imageDims?: { w: number; h: number } | null
}

const PRESETS = [
  { label: 'Free', aspect: null },
  { label: '1:1 Square', aspect: 1 },
  { label: '4:5 Portrait', aspect: 4 / 5 },
  { label: '16:9 Landscape', aspect: 16 / 9 },
  { label: '9:16 Story / Reel', aspect: 9 / 16 },
  { label: '3:1 Banner', aspect: 3 / 1 },
  { label: '7:9 Passport / Visa', aspect: 7 / 9 },
]

export default function VisualCrop({
  imageUrl,
  crop,
  onChange,
  circular = false,
  onCircularChange,
  imageDims,
}: VisualCropProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const [activePreset, setActivePreset] = useState<string>('Free')
  const [draggingMode, setDraggingMode] = useState<'move' | 'resize' | null>(null)
  const dragStartRef = useRef<{ clientX: number; clientY: number; crop: { x: number; y: number; w: number; h: number } }>({ clientX: 0, clientY: 0, crop })

  // Render live crop preview canvas
  useEffect(() => {
    const canvas = previewCanvasRef.current
    if (!canvas) return
    let alive = true
    const img = new Image()
    img.src = imageUrl
    img.onload = () => {
      if (!alive) return
      const natW = img.naturalWidth || 800
      const natH = img.naturalHeight || 600
      const sw = Math.max(1, (crop.w / 100) * natW)
      const sh = Math.max(1, (crop.h / 100) * natH)
      const sx = (crop.x / 100) * natW
      const sy = (crop.y / 100) * natH

      const maxP = 200
      const aspect = sw / sh
      let pw = maxP
      let ph = maxP / aspect
      if (ph > maxP) {
        ph = maxP
        pw = maxP * aspect
      }
      canvas.width = Math.max(1, Math.round(pw))
      canvas.height = Math.max(1, Math.round(ph))
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.clearRect(0, 0, canvas.width, canvas.height)
      if (circular) {
        ctx.beginPath()
        ctx.arc(canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) / 2, 0, Math.PI * 2)
        ctx.clip()
      }
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
    }
    return () => { alive = false }
  }, [imageUrl, crop, circular])

  const handlePointerDown = (mode: 'move' | 'resize', e: React.PointerEvent) => {
    e.stopPropagation()
    setDraggingMode(mode)
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      crop: { ...crop },
    }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingMode || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const dxPct = ((e.clientX - dragStartRef.current.clientX) / rect.width) * 100
    const dyPct = ((e.clientY - dragStartRef.current.clientY) / rect.height) * 100
    const initial = dragStartRef.current.crop

    if (draggingMode === 'move') {
      const newX = Math.max(0, Math.min(100 - initial.w, initial.x + dxPct))
      const newY = Math.max(0, Math.min(100 - initial.h, initial.y + dyPct))
      onChange({
        ...crop,
        x: Math.round(newX),
        y: Math.round(newY),
      })
    } else if (draggingMode === 'resize') {
      const newW = Math.max(10, Math.min(100 - initial.x, initial.w + dxPct))
      const newH = Math.max(10, Math.min(100 - initial.y, initial.h + dyPct))
      onChange({
        ...crop,
        w: Math.round(newW),
        h: Math.round(newH),
      })
    }
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    setDraggingMode(null)
    try {
      (e.target as HTMLElement).releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }

  const applyPreset = (preset: typeof PRESETS[number]) => {
    setActivePreset(preset.label)
    if (!preset.aspect) return
    const targetW = 60
    const targetH = Math.round(targetW / preset.aspect)
    const clampedH = Math.min(90, Math.max(10, targetH))
    const clampedW = Math.min(90, Math.round(clampedH * preset.aspect))
    onChange({
      x: Math.round((100 - clampedW) / 2),
      y: Math.round((100 - clampedH) / 2),
      w: clampedW,
      h: clampedH,
    })
  }

  const resetFull = () => {
    setActivePreset('Free')
    onChange({ x: 0, y: 0, w: 100, h: 100 })
  }

  const outPixelsW = imageDims ? Math.round((crop.w / 100) * imageDims.w) : null
  const outPixelsH = imageDims ? Math.round((crop.h / 100) * imageDims.h) : null

  return (
    <div className="space-y-4">
      {/* Aspect Ratio Presets & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-xs font-bold text-slate-500 mr-1">Presets:</span>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              onClick={() => applyPreset(p)}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${activePreset === p.label ? 'bg-accent text-white shadow-sm' : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
            >
              {p.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2">
          {onCircularChange && (
            <button
              type="button"
              onClick={() => onCircularChange(!circular)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-bold transition ${circular ? 'border-accent bg-accent/10 text-accent ring-1 ring-accent' : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'}`}
              title="Clip output as a transparent circular avatar (PNG)"
            >
              <Circle className="h-3.5 w-3.5" /> Circle Avatar
            </button>
          )}

          <button
            type="button"
            onClick={resetFull}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-600 shadow-sm hover:bg-slate-50"
            title="Reset crop box to full image"
          >
            <RotateCcw className="h-3 w-3" /> Full
          </button>
        </div>
      </div>

      {/* Main Grid: Interactive Canvas & Live Cropped Preview */}
      <div className="grid gap-4 lg:grid-cols-3">
        {/* Visual Canvas Area */}
        <div className="lg:col-span-2">
          <div
            ref={containerRef}
            className="relative mx-auto max-h-[460px] w-full select-none overflow-hidden rounded-2xl border border-slate-200 bg-slate-900/90 shadow-md"
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
          >
            <img
              src={imageUrl}
              alt="To crop"
              className="mx-auto block max-h-[460px] w-full object-contain opacity-60"
            />

            {/* Highlighted Crop Area */}
            <div
              role="region"
              aria-label="Crop selection"
              onPointerDown={(e) => handlePointerDown('move', e)}
              className="absolute cursor-move border-2 border-accent bg-transparent shadow-[0_0_0_9999px_rgba(0,0,0,0.55)] transition-shadow"
              style={{
                left: `${crop.x}%`,
                top: `${crop.y}%`,
                width: `${crop.w}%`,
                height: `${crop.h}%`,
              }}
            >
              {/* Circular Guide when enabled */}
              {circular && (
                <div className="pointer-events-none absolute inset-0 rounded-full border-2 border-dashed border-amber-300 opacity-80" />
              )}

              {/* Rule of thirds grid lines */}
              <div className="pointer-events-none absolute inset-0 grid grid-cols-3 grid-rows-3 opacity-30">
                <div className="border-r border-b border-white" />
                <div className="border-r border-b border-white" />
                <div className="border-b border-white" />
                <div className="border-r border-b border-white" />
                <div className="border-r border-b border-white" />
                <div className="border-b border-white" />
                <div className="border-r border-white" />
                <div className="border-r border-white" />
                <div />
              </div>

              {/* Coordinate label */}
              <div className="pointer-events-none absolute -top-6 left-0 rounded bg-accent px-1.5 py-0.5 text-[10px] font-extrabold text-white shadow-sm">
                {crop.w}% × {crop.h}%
              </div>

              {/* Resize handle (bottom-right corner) */}
              <div
                onPointerDown={(e) => handlePointerDown('resize', e)}
                className="absolute -bottom-2 -right-2 flex h-5 w-5 cursor-nwse-resize items-center justify-center rounded-full border-2 border-white bg-accent shadow"
                title="Drag to resize"
              />
            </div>
          </div>
          <p className="mt-1.5 text-center text-xs text-slate-500">
            Drag the highlighted box to position, or drag the bottom-right corner dot to resize.
          </p>
        </div>

        {/* Live Cropped Output Preview */}
        <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <div>
            <div className="mb-2 flex items-center justify-between">
              <span className="text-xs font-extrabold uppercase tracking-wide text-slate-600">Live Crop Result</span>
              {circular && <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">Circular Clip</span>}
            </div>
            <div className="flex min-h-48 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-inner">
              <canvas
                ref={previewCanvasRef}
                className={`max-h-48 max-w-full object-contain ${circular ? 'rounded-full ring-2 ring-accent/30' : 'rounded-lg'}`}
              />
            </div>
          </div>

          <div className="mt-3 space-y-1.5 border-t border-slate-200/60 pt-3 text-xs">
            {outPixelsW && outPixelsH && (
              <div className="flex justify-between font-semibold text-slate-600">
                <span>Output Resolution:</span>
                <strong className="text-ink-950">{outPixelsW} × {outPixelsH} px</strong>
              </div>
            )}
            <div className="flex justify-between font-semibold text-slate-600">
              <span>Crop Area:</span>
              <strong className="text-ink-950">{crop.w}% × {crop.h}%</strong>
            </div>
            <div className="flex justify-between font-semibold text-slate-600">
              <span>Position:</span>
              <span className="text-slate-500">X: {crop.x}% · Y: {crop.y}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
