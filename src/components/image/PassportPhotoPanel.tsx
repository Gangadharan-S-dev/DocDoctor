import { useRef, useEffect, useState, type JSX } from 'react'
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Printer,
  UserCheck,
  Scissors,
  Eye,
} from 'lucide-react'
import {
  PASSPORT_PRESETS,
  type PassportSettings,
  type PassportPresetId,
  type PassportOutputMode,
  type PassportSheetPreset,
} from '../../processing/imageExtraTypes'
import {
  resolvePassportDimensions,
  computePassportCropPixels,
  computeSheetLayout,
  SHEET_DIMENSIONS_MM,
} from '../../processing/imageExtraMath'

interface PassportPhotoPanelProps {
  file: File | undefined
  value: PassportSettings
  onChange: (next: PassportSettings) => void
}

export default function PassportPhotoPanel({
  file,
  value,
  onChange,
}: PassportPhotoPanelProps): JSX.Element {
  const singleCanvasRef = useRef<HTMLCanvasElement>(null)
  const sheetCanvasRef = useRef<HTMLCanvasElement>(null)
  const loadedImgRef = useRef<HTMLImageElement | null>(null)
  const dragRef = useRef<{
    active: boolean
    startX: number
    startY: number
    panX: number
    panY: number
  }>({ active: false, startX: 0, startY: 0, panX: 0, panY: 0 })

  const [showGuide, setShowGuide] = useState(true)
  const [srcDims, setSrcDims] = useState<{ w: number; h: number } | null>(null)

  const dims = resolvePassportDimensions(
    value.presetId,
    value.customWidthMm,
    value.customHeightMm,
    value.dpi,
  )

  const sheetLayout = computeSheetLayout({
    sheetPreset: value.sheetPreset,
    photoWidthMm: dims.widthMm,
    photoHeightMm: dims.heightMm,
    gapMm: value.gapMm,
    marginMm: value.marginMm,
    copies: value.copies,
    dpi: value.dpi,
  })

  const update = (patch: Partial<PassportSettings>) => {
    onChange({ ...value, ...patch })
  }

  // Render live interactive portrait preview & sheet tiling preview
  useEffect(() => {
    if (!file) return
    let alive = true
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => {
      if (!alive) return
      loadedImgRef.current = img
      const natW = img.naturalWidth || 800
      const natH = img.naturalHeight || 800
      setSrcDims({ w: natW, h: natH })

      const singleCanvas = singleCanvasRef.current
      if (singleCanvas) {
        const previewH = 280
        const previewW = Math.max(120, Math.round(previewH * dims.aspect))
        singleCanvas.width = previewW
        singleCanvas.height = previewH
        const sctx = singleCanvas.getContext('2d')
        if (sctx) {
          const crop = computePassportCropPixels(natW, natH, dims.aspect, {
            zoom: value.zoom,
            panX: value.panX,
            panY: value.panY,
          })
          const padRatio = value.paddingMm / Math.max(10, dims.widthMm)
          const padPx = Math.round(previewW * padRatio)
          const innerW = Math.max(16, previewW - padPx * 2)
          const innerH = Math.max(16, previewH - padPx * 2)

          sctx.fillStyle = value.bgColor || '#ffffff'
          sctx.fillRect(0, 0, previewW, previewH)
          sctx.imageSmoothingEnabled = true
          sctx.imageSmoothingQuality = 'high'
          sctx.drawImage(img, crop.sx, crop.sy, crop.sw, crop.sh, padPx, padPx, innerW, innerH)

          if (value.borderPx > 0) {
            const bw = Math.max(1, Math.round((value.borderPx / dims.widthPx) * previewW))
            sctx.strokeStyle = value.borderColor || '#cbd5e1'
            sctx.lineWidth = bw
            sctx.strokeRect(bw / 2, bw / 2, previewW - bw, previewH - bw)
          }

          // Render Sheet Preview using singleCanvas
          const sheetCanvas = sheetCanvasRef.current
          if (sheetCanvas) {
            const maxSheetPreview = 260
            const sheetAspect = sheetLayout.sheetWidthMm / sheetLayout.sheetHeightMm
            let sw = maxSheetPreview
            let sh = Math.round(maxSheetPreview / sheetAspect)
            if (sh > maxSheetPreview) {
              sh = maxSheetPreview
              sw = Math.round(maxSheetPreview * sheetAspect)
            }
            sheetCanvas.width = sw
            sheetCanvas.height = sh
            const shCtx = sheetCanvas.getContext('2d')
            if (shCtx) {
              shCtx.fillStyle = '#ffffff'
              shCtx.fillRect(0, 0, sw, sh)
              const scaleMmX = sw / sheetLayout.sheetWidthMm
              const scaleMmY = sh / sheetLayout.sheetHeightMm

              for (const cell of sheetLayout.cells) {
                const cx = cell.xMm * scaleMmX
                const cy = cell.yMm * scaleMmY
                const cw = cell.wMm * scaleMmX
                const ch = cell.hMm * scaleMmY
                shCtx.drawImage(singleCanvas, cx, cy, cw, ch)
                if (value.cutMarks) {
                  shCtx.strokeStyle = '#94a3b8'
                  shCtx.lineWidth = 0.75
                  shCtx.strokeRect(cx, cy, cw, ch)
                }
              }
            }
          }
        }
      }
    }
    img.src = url
    return () => {
      alive = false
      URL.revokeObjectURL(url)
    }
  }, [
    file,
    dims.aspect,
    dims.widthMm,
    dims.heightMm,
    dims.widthPx,
    value.zoom,
    value.panX,
    value.panY,
    value.bgColor,
    value.paddingMm,
    value.borderPx,
    value.borderColor,
    value.cutMarks,
    sheetLayout,
  ])

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      panX: value.panX,
      panY: value.panY,
    }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!dragRef.current.active) return
    const dx = e.clientX - dragRef.current.startX
    const dy = e.clientY - dragRef.current.startY
    // Dragging image right means moving crop window left (negative panX)
    const nextPanX = Math.max(-100, Math.min(100, Math.round(dragRef.current.panX - dx * 0.8)))
    const nextPanY = Math.max(-100, Math.min(100, Math.round(dragRef.current.panY - dy * 0.8)))
    update({ panX: nextPanX, panY: nextPanY })
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current.active = false
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }

  const activePreset = PASSPORT_PRESETS.find((p) => p.id === value.presetId)

  return (
    <div className="space-y-5">
      {/* Preset & DPI Selector */}
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block sm:col-span-2">
          <span className="mb-1.5 block text-sm font-bold text-ink-950">
            Country / ID Size Preset
          </span>
          <select
            value={value.presetId}
            onChange={(e) => update({ presetId: e.target.value as PassportPresetId })}
            className="input"
          >
            {PASSPORT_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.label}
              </option>
            ))}
          </select>
          {activePreset && (
            <span className="mt-1 block text-xs text-slate-500">
              {activePreset.description} — Exact output:{' '}
              <strong className="text-accent">
                {dims.widthPx} × {dims.heightPx} px @ {value.dpi} DPI
              </strong>{' '}
              ({dims.widthMm} × {dims.heightMm} mm)
            </span>
          )}
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-bold text-ink-950">
            Print Density (DPI)
          </span>
          <select
            value={value.dpi}
            onChange={(e) => update({ dpi: +e.target.value })}
            className="input"
          >
            <option value={300}>300 DPI (Official Standard)</option>
            <option value={600}>600 DPI (High-Res Lab Print)</option>
            <option value={200}>200 DPI (Compact Portal)</option>
          </select>
        </label>
      </div>

      {value.presetId === 'custom' && (
        <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-3.5 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-ink-950">Width (mm)</span>
            <input
              type="number"
              min={15}
              max={150}
              step={0.5}
              value={value.customWidthMm}
              onChange={(e) => update({ customWidthMm: Math.max(10, +e.target.value) })}
              className="input !py-2"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-ink-950">Height (mm)</span>
            <input
              type="number"
              min={15}
              max={200}
              step={0.5}
              value={value.customHeightMm}
              onChange={(e) => update({ customHeightMm: Math.max(10, +e.target.value) })}
              className="input !py-2"
            />
          </label>
        </div>
      )}

      {/* Interactive Crop & Live Sheet Preview Grid */}
      <div className="grid gap-5 lg:grid-cols-2">
        {/* Left: Interactive Draggable/Zoomable Biometric Frame */}
        <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <UserCheck className="h-4 w-4 text-accent" />
              <span className="text-xs font-extrabold uppercase tracking-wide text-ink-950">
                Interactive Biometric Crop
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowGuide((g) => !g)}
                className={`flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] font-bold transition ${
                  showGuide
                    ? 'border-accent bg-accent/10 text-accent'
                    : 'border-slate-200 bg-white text-slate-600'
                }`}
              >
                <Eye className="h-3 w-3" /> Face Oval Guide
              </button>
              <button
                type="button"
                onClick={() => update({ zoom: 1, panX: 0, panY: 0 })}
                className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-bold text-slate-600 hover:bg-slate-100"
              >
                <RotateCcw className="h-3 w-3" /> Reset
              </button>
            </div>
          </div>

          <div
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className="relative mx-auto flex cursor-grab active:cursor-grabbing select-none items-center justify-center overflow-hidden rounded-xl border-2 border-accent bg-slate-900/90 shadow-md"
            title="Drag to align face inside the biometric oval"
          >
            <canvas ref={singleCanvasRef} className="block max-h-[280px] w-auto" />

            {/* Biometric Face & Shoulders Oval Overlay */}
            {showGuide && (
              <svg
                viewBox="0 0 100 130"
                preserveAspectRatio="none"
                className="pointer-events-none absolute inset-0 h-full w-full"
              >
                {/* Head top & chin guide lines */}
                <line
                  x1="15"
                  y1="14"
                  x2="85"
                  y2="14"
                  stroke="#38bdf8"
                  strokeWidth="0.7"
                  strokeDasharray="3,2"
                />
                <line
                  x1="20"
                  y1="86"
                  x2="80"
                  y2="86"
                  stroke="#38bdf8"
                  strokeWidth="0.7"
                  strokeDasharray="3,2"
                />
                {/* Eye level zone */}
                <line
                  x1="22"
                  y1="46"
                  x2="78"
                  y2="46"
                  stroke="#f59e0b"
                  strokeWidth="0.8"
                  strokeDasharray="2,2"
                />
                {/* Center vertical axis */}
                <line
                  x1="50"
                  y1="8"
                  x2="50"
                  y2="122"
                  stroke="rgba(255,255,255,0.45)"
                  strokeWidth="0.5"
                  strokeDasharray="2,3"
                />
                {/* Biometric Head Oval */}
                <ellipse
                  cx="50"
                  cy="50"
                  rx="27"
                  ry="36"
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="1.2"
                  strokeDasharray="4,2"
                />
                {/* Shoulders curve */}
                <path
                  d="M 10 128 Q 22 98 50 98 Q 78 98 90 128"
                  fill="none"
                  stroke="rgba(56,189,248,0.7)"
                  strokeWidth="1"
                  strokeDasharray="3,3"
                />
              </svg>
            )}
          </div>

          {/* Zoom and Pan Controls */}
          <div className="mt-3 space-y-2">
            <div className="flex items-center gap-2">
              <ZoomOut className="h-4 w-4 text-slate-400" />
              <input
                type="range"
                min={1}
                max={3}
                step={0.05}
                value={value.zoom}
                onChange={(e) => update({ zoom: +e.target.value })}
                aria-label="Zoom"
                className="flex-1 accent-accent"
              />
              <ZoomIn className="h-4 w-4 text-slate-400" />
              <span className="w-12 text-right text-xs font-extrabold text-accent">
                {Math.round(value.zoom * 100)}%
              </span>
            </div>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <label className="flex items-center gap-2">
                <span className="font-bold text-slate-500">Pan X:</span>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  value={value.panX}
                  onChange={(e) => update({ panX: +e.target.value })}
                  className="flex-1 accent-accent"
                />
              </label>
              <label className="flex items-center gap-2">
                <span className="font-bold text-slate-500">Pan Y:</span>
                <input
                  type="range"
                  min={-100}
                  max={100}
                  value={value.panY}
                  onChange={(e) => update({ panY: +e.target.value })}
                  className="flex-1 accent-accent"
                />
              </label>
            </div>
            <p className="text-center text-[11px] text-slate-500">
              Drag the photo or use sliders so the head fits the blue oval and eyes align with the amber line.
              {srcDims && ` (Source: ${srcDims.w}×${srcDims.h} px)`}
            </p>
          </div>
        </div>

        {/* Right: Printable Multi-Copy Sheet Preview */}
        <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <Printer className="h-4 w-4 text-accent" />
              <span className="text-xs font-extrabold uppercase tracking-wide text-ink-950">
                Printable Sheet Layout ({sheetLayout.cells.length} Copies)
              </span>
            </div>
            <span className="rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-200">
              {sheetLayout.cols} × {sheetLayout.rows} Grid (Max {sheetLayout.maxCapacity})
            </span>
          </div>

          <div className="mx-auto flex min-h-[220px] items-center justify-center rounded-xl border border-slate-200 bg-slate-200/70 p-3 shadow-inner">
            <canvas
              ref={sheetCanvasRef}
              className="block max-h-[240px] w-auto rounded bg-white shadow"
            />
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="block text-xs">
              <span className="mb-1 block font-bold text-ink-950">Paper Sheet Size</span>
              <select
                value={value.sheetPreset}
                onChange={(e) => {
                  const nextPreset = e.target.value as PassportSheetPreset
                  const nextLayout = computeSheetLayout({
                    sheetPreset: nextPreset,
                    photoWidthMm: dims.widthMm,
                    photoHeightMm: dims.heightMm,
                    gapMm: value.gapMm,
                    marginMm: value.marginMm,
                    copies: 0,
                    dpi: value.dpi,
                  })
                  update({
                    sheetPreset: nextPreset,
                    copies: nextLayout.maxCapacity,
                  })
                }}
                className="input !py-1.5 text-xs"
              >
                {(Object.keys(SHEET_DIMENSIONS_MM) as PassportSheetPreset[]).map((k) => (
                  <option key={k} value={k}>
                    {SHEET_DIMENSIONS_MM[k].label}
                  </option>
                ))}
              </select>
            </label>

            <label className="block text-xs">
              <span className="mb-1 flex justify-between font-bold text-ink-950">
                <span>Copies on Sheet</span>
                <span className="text-accent">
                  {sheetLayout.cells.length} / {sheetLayout.maxCapacity}
                </span>
              </span>
              <input
                type="range"
                min={1}
                max={Math.max(1, sheetLayout.maxCapacity)}
                value={Math.min(value.copies, sheetLayout.maxCapacity)}
                onChange={(e) => update({ copies: +e.target.value })}
                className="mt-2 w-full accent-accent"
              />
            </label>
          </div>
        </div>
      </div>

      {/* Output Files, Border/Padding & Portal Size Ceiling */}
      <div className="grid gap-4 rounded-2xl border border-slate-200 bg-white p-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="block">
          <span className="mb-1.5 block text-xs font-bold text-ink-950">
            Download Output
          </span>
          <select
            value={value.outputMode}
            onChange={(e) => update({ outputMode: e.target.value as PassportOutputMode })}
            className="input !py-2 text-xs"
          >
            <option value="both">Single JPG + Printable PDF Sheet</option>
            <option value="single">Single Passport Photo JPG Only</option>
            <option value="sheet-pdf">Printable Sheet (PDF Only)</option>
            <option value="sheet-jpg">Printable Sheet (JPG Image Only)</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 flex justify-between text-xs font-bold text-ink-950">
            <span>White Margin Padding</span>
            <span className="text-accent">{value.paddingMm} mm</span>
          </span>
          <input
            type="range"
            min={0}
            max={4}
            step={0.5}
            value={value.paddingMm}
            onChange={(e) => update({ paddingMm: +e.target.value })}
            className="mt-2 w-full accent-accent"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 flex justify-between text-xs font-bold text-ink-950">
            <span>Photo Border Frame</span>
            <span className="text-accent">{value.borderPx} px</span>
          </span>
          <input
            type="range"
            min={0}
            max={12}
            step={1}
            value={value.borderPx}
            onChange={(e) => update({ borderPx: +e.target.value })}
            className="mt-2 w-full accent-accent"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 flex justify-between text-xs font-bold text-ink-950">
            <span>Portal Max KB Limit</span>
            <span className="text-accent">
              {value.targetSizeKB > 0 ? `≤ ${value.targetSizeKB} KB` : 'No Limit'}
            </span>
          </span>
          <div className="flex gap-1.5">
            <input
              type="number"
              min={0}
              max={2000}
              step={10}
              placeholder="0 = off"
              value={value.targetSizeKB || ''}
              onChange={(e) => update({ targetSizeKB: Math.max(0, +e.target.value) })}
              className="input !py-1.5 !px-2.5 text-xs"
            />
            {[50, 100].map((kb) => (
              <button
                key={kb}
                type="button"
                onClick={() => update({ targetSizeKB: value.targetSizeKB === kb ? 0 : kb })}
                className={`rounded-lg border px-2 py-1 text-[11px] font-bold transition ${
                  value.targetSizeKB === kb
                    ? 'border-accent bg-accent text-white'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:bg-slate-100'
                }`}
              >
                {kb}KB
              </button>
            ))}
          </div>
        </label>
      </div>

      {/* Sheet spacing & crop marks bar */}
      {value.outputMode !== 'single' && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-xs">
          <div className="flex flex-wrap items-center gap-4">
            <label className="flex items-center gap-2 font-bold text-ink-950">
              <span>Gap Between Photos:</span>
              <input
                type="number"
                min={0}
                max={15}
                step={0.5}
                value={value.gapMm}
                onChange={(e) => update({ gapMm: Math.max(0, +e.target.value) })}
                className="input !w-16 !py-1 !px-2 text-xs"
              />
              <span className="text-slate-500">mm</span>
            </label>

            <label className="flex items-center gap-2 font-bold text-ink-950">
              <span>Page Margin:</span>
              <input
                type="number"
                min={0}
                max={25}
                step={1}
                value={value.marginMm}
                onChange={(e) => update({ marginMm: Math.max(0, +e.target.value) })}
                className="input !w-16 !py-1 !px-2 text-xs"
              />
              <span className="text-slate-500">mm</span>
            </label>
          </div>

          <label className="flex cursor-pointer items-center gap-2 font-bold text-ink-950">
            <input
              type="checkbox"
              checked={value.cutMarks}
              onChange={(e) => update({ cutMarks: e.target.checked })}
              className="h-4 w-4 accent-accent"
            />
            <Scissors className="h-3.5 w-3.5 text-accent" />
            Include Hairline Cut Marks & Crop Ticks
          </label>
        </div>
      )}
    </div>
  )
}
