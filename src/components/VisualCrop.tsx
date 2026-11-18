import { useState, useRef, useEffect } from 'react'
import { RotateCcw, Circle, Grid, Scan, Wand2, Crop as CropIcon, Sparkles } from 'lucide-react'
import {
  type PerspectiveQuad,
  type ScanEnhanceMode,
  computePerspectiveDimensions,
  warpPerspectiveImageData,
  applyScanEnhancement,
  autoDetectDocumentQuad,
} from '../processing/image'

export type CornerKey = 'tl' | 'tr' | 'br' | 'bl'

interface VisualCropProps {
  imageUrl: string
  crop: { x: number; y: number; w: number; h: number }
  onChange: (crop: { x: number; y: number; w: number; h: number }) => void
  circular?: boolean
  onCircularChange?: (circular: boolean) => void
  cornerRadius?: number
  onCornerRadiusChange?: (radius: number) => void
  imageDims?: { w: number; h: number } | null
  cropMode?: 'rect' | 'perspective'
  onCropModeChange?: (mode: 'rect' | 'perspective') => void
  perspectiveQuad?: PerspectiveQuad
  onPerspectiveQuadChange?: (quad: PerspectiveQuad) => void
  perspectiveAspect?: number | null
  onPerspectiveAspectChange?: (aspect: number | null) => void
  scanEnhance?: ScanEnhanceMode
  onScanEnhanceChange?: (mode: ScanEnhanceMode) => void
}

const DEFAULT_QUAD: PerspectiveQuad = {
  tl: { x: 10, y: 10 },
  tr: { x: 90, y: 10 },
  br: { x: 90, y: 90 },
  bl: { x: 10, y: 90 },
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

const PERSPECTIVE_PRESETS: { label: string; aspect: number | null }[] = [
  { label: 'Auto (Edge Length)', aspect: null },
  { label: 'A4 Portrait', aspect: 210 / 297 },
  { label: 'A4 Landscape', aspect: 297 / 210 },
  { label: 'US Letter', aspect: 8.5 / 11 },
  { label: 'ID / Business Card', aspect: 85.6 / 54 },
  { label: '1:1 Square', aspect: 1 },
  { label: '16:9 Wide', aspect: 16 / 9 },
]

const CORNER_META: { key: CornerKey; short: string; name: string }[] = [
  { key: 'tl', short: 'TL', name: 'Top-Left' },
  { key: 'tr', short: 'TR', name: 'Top-Right' },
  { key: 'br', short: 'BR', name: 'Bottom-Right' },
  { key: 'bl', short: 'BL', name: 'Bottom-Left' },
]

export default function VisualCrop({
  imageUrl,
  crop,
  onChange,
  circular = false,
  onCircularChange,
  cornerRadius = 0,
  onCornerRadiusChange,
  imageDims,
  cropMode: controlledMode,
  onCropModeChange,
  perspectiveQuad: controlledQuad,
  onPerspectiveQuadChange,
  perspectiveAspect: controlledPerspAspect,
  onPerspectiveAspectChange,
  scanEnhance: controlledScanEnhance,
  onScanEnhanceChange,
}: VisualCropProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const loupeCanvasRef = useRef<HTMLCanvasElement>(null)
  const loadedImageRef = useRef<HTMLImageElement | null>(null)

  const [internalMode, setInternalMode] = useState<'rect' | 'perspective'>('rect')
  const [internalQuad, setInternalQuad] = useState<PerspectiveQuad>(DEFAULT_QUAD)
  const [internalPerspAspect, setInternalPerspAspect] = useState<number | null>(null)
  const [internalScanEnhance, setInternalScanEnhance] = useState<ScanEnhanceMode>('none')

  const cropMode = controlledMode ?? internalMode
  const setCropMode = (m: 'rect' | 'perspective') => {
    setInternalMode(m)
    onCropModeChange?.(m)
  }

  const quad = controlledQuad ?? internalQuad
  const setQuad = (q: PerspectiveQuad) => {
    setInternalQuad(q)
    onPerspectiveQuadChange?.(q)
  }

  const perspectiveAspect = controlledPerspAspect !== undefined ? controlledPerspAspect : internalPerspAspect
  const setPerspectiveAspect = (a: number | null) => {
    setInternalPerspAspect(a)
    onPerspectiveAspectChange?.(a)
  }

  const scanEnhance = controlledScanEnhance ?? internalScanEnhance
  const setScanEnhance = (s: ScanEnhanceMode) => {
    setInternalScanEnhance(s)
    onScanEnhanceChange?.(s)
  }

  const [activePreset, setActivePreset] = useState<string>('Free')
  const [activePerspPreset, setActivePerspPreset] = useState<string>('Auto (Edge Length)')
  const [showGrid, setShowGrid] = useState(true)
  const [draggingMode, setDraggingMode] = useState<'move' | 'resize' | 'quad-move' | CornerKey | null>(null)

  const dragStartRef = useRef<{
    clientX: number
    clientY: number
    crop: { x: number; y: number; w: number; h: number }
    quad: PerspectiveQuad
  }>({ clientX: 0, clientY: 0, crop, quad })

  // Render live crop preview canvas (both rectangle and perspective homography warp)
  useEffect(() => {
    const canvas = previewCanvasRef.current
    if (!canvas) return
    let alive = true
    const img = new Image()
    img.src = imageUrl
    img.onload = () => {
      if (!alive) return
      loadedImageRef.current = img
      const natW = img.naturalWidth || 800
      const natH = img.naturalHeight || 600
      const maxP = 220

      if (cropMode === 'perspective') {
        const { width: fullW, height: fullH } = computePerspectiveDimensions(natW, natH, quad, perspectiveAspect)
        const aspect = fullW / Math.max(1, fullH)
        let pw = maxP
        let ph = maxP / aspect
        if (ph > maxP) {
          ph = maxP
          pw = maxP * aspect
        }
        const dstW = Math.max(1, Math.round(pw))
        const dstH = Math.max(1, Math.round(ph))

        // Sample from a moderately sized working buffer so live dragging stays 60fps
        const workScale = Math.min(1, 480 / Math.max(natW, natH))
        const workW = Math.max(16, Math.round(natW * workScale))
        const workH = Math.max(16, Math.round(natH * workScale))
        const workCanvas = document.createElement('canvas')
        workCanvas.width = workW
        workCanvas.height = workH
        const workCtx = workCanvas.getContext('2d')
        if (!workCtx) return
        workCtx.drawImage(img, 0, 0, workW, workH)
        const srcData = workCtx.getImageData(0, 0, workW, workH)
        const { quadPx } = computePerspectiveDimensions(workW, workH, quad, perspectiveAspect)
        const warped = warpPerspectiveImageData(srcData, dstW, dstH, quadPx)
        if (scanEnhance !== 'none') {
          applyScanEnhancement(warped, scanEnhance)
        }

        const tempCanvas = document.createElement('canvas')
        tempCanvas.width = dstW
        tempCanvas.height = dstH
        tempCanvas.getContext('2d')!.putImageData(warped, 0, 0)

        canvas.width = dstW
        canvas.height = dstH
        const ctx = canvas.getContext('2d')
        if (!ctx) return
        ctx.clearRect(0, 0, dstW, dstH)
        if (circular) {
          ctx.beginPath()
          ctx.arc(dstW / 2, dstH / 2, Math.min(dstW, dstH) / 2, 0, Math.PI * 2)
          ctx.clip()
        } else if (cornerRadius > 0) {
          const r = Math.min((cornerRadius / 100) * Math.min(dstW, dstH), dstW / 2, dstH / 2)
          ctx.beginPath()
          ctx.moveTo(r, 0)
          ctx.lineTo(dstW - r, 0)
          ctx.quadraticCurveTo(dstW, 0, dstW, r)
          ctx.lineTo(dstW, dstH - r)
          ctx.quadraticCurveTo(dstW, dstH, dstW - r, dstH)
          ctx.lineTo(r, dstH)
          ctx.quadraticCurveTo(0, dstH, 0, dstH - r)
          ctx.lineTo(0, r)
          ctx.quadraticCurveTo(0, 0, r, 0)
          ctx.closePath()
          ctx.clip()
        }
        ctx.drawImage(tempCanvas, 0, 0)
      } else {
        const sw = Math.max(1, (crop.w / 100) * natW)
        const sh = Math.max(1, (crop.h / 100) * natH)
        const sx = (crop.x / 100) * natW
        const sy = (crop.y / 100) * natH

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
        } else if (cornerRadius > 0) {
          const r = Math.min((cornerRadius / 100) * Math.min(canvas.width, canvas.height), canvas.width / 2, canvas.height / 2)
          ctx.beginPath()
          ctx.moveTo(r, 0)
          ctx.lineTo(canvas.width - r, 0)
          ctx.quadraticCurveTo(canvas.width, 0, canvas.width, r)
          ctx.lineTo(canvas.width, canvas.height - r)
          ctx.quadraticCurveTo(canvas.width, canvas.height, canvas.width - r, canvas.height)
          ctx.lineTo(r, canvas.height)
          ctx.quadraticCurveTo(0, canvas.height, 0, canvas.height - r)
          ctx.lineTo(0, r)
          ctx.quadraticCurveTo(0, 0, r, 0)
          ctx.closePath()
          ctx.clip()
        }
        ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height)
        if (scanEnhance !== 'none') {
          const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
          applyScanEnhancement(imgData, scanEnhance)
          ctx.putImageData(imgData, 0, 0)
        }
      }
    }
    return () => { alive = false }
  }, [imageUrl, crop, circular, cornerRadius, cropMode, quad, perspectiveAspect, scanEnhance])

  // Render Precision Corner Magnifier Loupe when dragging a perspective corner
  const activeCornerKey: CornerKey | null =
    draggingMode === 'tl' || draggingMode === 'tr' || draggingMode === 'br' || draggingMode === 'bl'
      ? draggingMode
      : null

  useEffect(() => {
    if (!activeCornerKey || !loupeCanvasRef.current || !loadedImageRef.current) return
    const loupe = loupeCanvasRef.current
    const img = loadedImageRef.current
    const ctx = loupe.getContext('2d')
    if (!ctx) return
    const size = 96
    loupe.width = size
    loupe.height = size
    const pt = quad[activeCornerKey]
    const natW = img.naturalWidth || 800
    const natH = img.naturalHeight || 600
    const cx = (pt.x / 100) * natW
    const cy = (pt.y / 100) * natH
    const patchR = Math.max(16, Math.round(Math.min(natW, natH) * 0.06))

    ctx.fillStyle = '#0f172a'
    ctx.fillRect(0, 0, size, size)
    ctx.drawImage(img, cx - patchR, cy - patchR, patchR * 2, patchR * 2, 0, 0, size, size)

    // Crosshair inside loupe
    ctx.strokeStyle = 'rgba(29, 111, 242, 0.95)'
    ctx.lineWidth = 1.5
    ctx.beginPath()
    ctx.moveTo(size / 2, 0)
    ctx.lineTo(size / 2, size)
    ctx.moveTo(0, size / 2)
    ctx.lineTo(size, size / 2)
    ctx.stroke()
  }, [activeCornerKey, quad])

  const handlePointerDown = (
    mode: 'move' | 'resize' | 'quad-move' | CornerKey,
    e: React.PointerEvent,
  ) => {
    e.stopPropagation()
    setDraggingMode(mode)
    dragStartRef.current = {
      clientX: e.clientX,
      clientY: e.clientY,
      crop: { ...crop },
      quad: {
        tl: { ...quad.tl },
        tr: { ...quad.tr },
        br: { ...quad.br },
        bl: { ...quad.bl },
      },
    }
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!draggingMode || !containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    const dxPct = ((e.clientX - dragStartRef.current.clientX) / rect.width) * 100
    const dyPct = ((e.clientY - dragStartRef.current.clientY) / rect.height) * 100

    if (draggingMode === 'move') {
      const initial = dragStartRef.current.crop
      const newX = Math.max(0, Math.min(100 - initial.w, initial.x + dxPct))
      const newY = Math.max(0, Math.min(100 - initial.h, initial.y + dyPct))
      onChange({
        ...crop,
        x: Math.round(newX),
        y: Math.round(newY),
      })
    } else if (draggingMode === 'resize') {
      const initial = dragStartRef.current.crop
      const newW = Math.max(10, Math.min(100 - initial.x, initial.w + dxPct))
      const newH = Math.max(10, Math.min(100 - initial.y, initial.h + dyPct))
      onChange({
        ...crop,
        w: Math.round(newW),
        h: Math.round(newH),
      })
    } else if (draggingMode === 'quad-move') {
      const iq = dragStartRef.current.quad
      const minX = Math.min(iq.tl.x, iq.tr.x, iq.br.x, iq.bl.x)
      const maxX = Math.max(iq.tl.x, iq.tr.x, iq.br.x, iq.bl.x)
      const minY = Math.min(iq.tl.y, iq.tr.y, iq.br.y, iq.bl.y)
      const maxY = Math.max(iq.tl.y, iq.tr.y, iq.br.y, iq.bl.y)
      const clampedDx = Math.max(-minX, Math.min(100 - maxX, dxPct))
      const clampedDy = Math.max(-minY, Math.min(100 - maxY, dyPct))
      setQuad({
        tl: { x: Math.round((iq.tl.x + clampedDx) * 10) / 10, y: Math.round((iq.tl.y + clampedDy) * 10) / 10 },
        tr: { x: Math.round((iq.tr.x + clampedDx) * 10) / 10, y: Math.round((iq.tr.y + clampedDy) * 10) / 10 },
        br: { x: Math.round((iq.br.x + clampedDx) * 10) / 10, y: Math.round((iq.br.y + clampedDy) * 10) / 10 },
        bl: { x: Math.round((iq.bl.x + clampedDx) * 10) / 10, y: Math.round((iq.bl.y + clampedDy) * 10) / 10 },
      })
    } else if (draggingMode === 'tl' || draggingMode === 'tr' || draggingMode === 'br' || draggingMode === 'bl') {
      const startPt = dragStartRef.current.quad[draggingMode]
      const nx = Math.max(0, Math.min(100, Math.round((startPt.x + dxPct) * 10) / 10))
      const ny = Math.max(0, Math.min(100, Math.round((startPt.y + dyPct) * 10) / 10))
      setQuad({
        ...quad,
        [draggingMode]: { x: nx, y: ny },
      })
    }
  }

  const handlePointerUp = (e: React.PointerEvent) => {
    setDraggingMode(null)
    try {
      ;(e.target as HTMLElement).releasePointerCapture(e.pointerId)
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

  const applyPerspectivePreset = (preset: typeof PERSPECTIVE_PRESETS[number]) => {
    setActivePerspPreset(preset.label)
    setPerspectiveAspect(preset.aspect)
  }

  const handleAutoDetectEdges = () => {
    const img = loadedImageRef.current
    if (!img) return
    const detected = autoDetectDocumentQuad(img, img.naturalWidth || 800, img.naturalHeight || 600)
    setQuad(detected)
  }

  const resetFull = () => {
    if (cropMode === 'perspective') {
      setQuad(DEFAULT_QUAD)
      setActivePerspPreset('Auto (Edge Length)')
      setPerspectiveAspect(null)
    } else {
      setActivePreset('Free')
      onChange({ x: 0, y: 0, w: 100, h: 100 })
    }
  }

  // Bilinear point interpolation helper for drawing perspective grid lines inside SVG (0..100 space)
  const bilerp = (u: number, v: number) => {
    const topX = quad.tl.x + (quad.tr.x - quad.tl.x) * u
    const topY = quad.tl.y + (quad.tr.y - quad.tl.y) * u
    const botX = quad.bl.x + (quad.br.x - quad.bl.x) * u
    const botY = quad.bl.y + (quad.br.y - quad.bl.y) * u
    return {
      x: topX + (botX - topX) * v,
      y: topY + (botY - topY) * v,
    }
  }

  const perspDims =
    cropMode === 'perspective' && imageDims
      ? computePerspectiveDimensions(imageDims.w, imageDims.h, quad, perspectiveAspect)
      : null

  const outPixelsW =
    cropMode === 'perspective'
      ? perspDims?.width ?? null
      : imageDims
        ? Math.round((crop.w / 100) * imageDims.w)
        : null
  const outPixelsH =
    cropMode === 'perspective'
      ? perspDims?.height ?? null
      : imageDims
        ? Math.round((crop.h / 100) * imageDims.h)
        : null

  return (
    <div className="space-y-4">
      {/* Mode Switcher: Rectangle Crop vs Perspective Crop */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50/80 p-2">
        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Crop mode">
          <button
            type="button"
            role="tab"
            aria-selected={cropMode === 'rect'}
            onClick={() => setCropMode('rect')}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-extrabold transition ${
              cropMode === 'rect'
                ? 'bg-accent text-white shadow-sm'
                : 'text-slate-600 hover:bg-white hover:text-ink-950'
            }`}
          >
            <CropIcon className="h-3.5 w-3.5" /> Rectangle Crop
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={cropMode === 'perspective'}
            onClick={() => setCropMode('perspective')}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-extrabold transition ${
              cropMode === 'perspective'
                ? 'bg-accent text-white shadow-sm'
                : 'text-slate-600 hover:bg-white hover:text-ink-950'
            }`}
          >
            <Scan className="h-3.5 w-3.5" /> Perspective Crop (4-Point Warp)
          </button>
        </div>

        {/* Document / Photo Enhancement Filter */}
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="flex items-center gap-1 text-xs font-bold text-slate-500">
            <Sparkles className="h-3.5 w-3.5 text-amber-500" /> Filter:
          </span>
          {([
            ['none', 'Original Photo'],
            ['magic-color', 'Magic Color Scan'],
            ['bw-document', 'Crisp B&W Doc'],
          ] as [ScanEnhanceMode, string][]).map(([val, label]) => (
            <button
              key={val}
              type="button"
              onClick={() => setScanEnhance(val)}
              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                scanEnhance === val
                  ? 'bg-ink-950 text-white shadow-sm'
                  : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Aspect Ratio Presets & Controls */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {cropMode === 'rect' ? (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-slate-500 mr-1">Presets:</span>
            {PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPreset(p)}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                  activePreset === p.label
                    ? 'bg-accent text-white shadow-sm'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-slate-500 mr-1">Target Ratio:</span>
            {PERSPECTIVE_PRESETS.map((p) => (
              <button
                key={p.label}
                type="button"
                onClick={() => applyPerspectivePreset(p)}
                className={`rounded-lg px-2.5 py-1 text-xs font-bold transition ${
                  activePerspPreset === p.label
                    ? 'bg-accent text-white shadow-sm'
                    : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          {cropMode === 'perspective' && (
            <button
              type="button"
              onClick={handleAutoDetectEdges}
              className="flex items-center gap-1.5 rounded-lg border border-teal-300 bg-teal-50 px-2.5 py-1 text-xs font-extrabold text-teal-800 shadow-sm transition hover:bg-teal-100"
              title="Automatically detect document or card corners in the photo"
            >
              <Wand2 className="h-3.5 w-3.5" /> Auto-Detect Edges
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowGrid(!showGrid)}
            className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs font-bold transition ${
              showGrid
                ? 'border-accent bg-accent/10 text-accent'
                : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
            }`}
            title="Toggle rule-of-thirds composition grid"
          >
            <Grid className="h-3.5 w-3.5" /> Grid
          </button>

          {onCircularChange && (
            <button
              type="button"
              onClick={() => onCircularChange(!circular)}
              className={`flex items-center gap-1.5 rounded-lg border px-3 py-1 text-xs font-bold transition ${
                circular
                  ? 'border-accent bg-accent/10 text-accent ring-1 ring-accent'
                  : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
              }`}
              title="Clip output as a transparent circular avatar (PNG)"
            >
              <Circle className="h-3.5 w-3.5" /> Circle Avatar
            </button>
          )}

          <button
            type="button"
            onClick={resetFull}
            className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-bold text-slate-600 shadow-sm hover:bg-slate-50"
            title={cropMode === 'perspective' ? 'Reset 4 perspective corners' : 'Reset crop box to full image'}
          >
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
        </div>
      </div>

      {!circular && onCornerRadiusChange && (
        <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-2 text-xs">
          <span className="font-bold text-ink-950 shrink-0">Rounded Corners:</span>
          <input
            type="range"
            min={0}
            max={50}
            value={cornerRadius}
            onChange={(e) => onCornerRadiusChange(+e.target.value)}
            className="w-40 accent-[#1D6FF2]"
          />
          <span className="font-bold text-accent">{cornerRadius}%</span>
          {cornerRadius > 0 && <span className="text-slate-500">(Exports lossless transparent PNG)</span>}
        </div>
      )}

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
              className={`mx-auto block max-h-[460px] w-full object-contain ${
                cropMode === 'perspective' ? 'opacity-90' : 'opacity-60'
              }`}
            />

            {cropMode === 'rect' ? (
              /* Highlighted Rectangle Crop Area */
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
                {showGrid && (
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
                )}

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
            ) : (
              /* Interactive 4-Point Perspective Quad Overlay */
              <div
                role="region"
                aria-label="Perspective crop selection"
                className="absolute inset-0"
              >
                <svg
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  className="h-full w-full overflow-visible"
                >
                  {/* Dimmed backdrop outside the 4-corner polygon */}
                  <path
                    fillRule="evenodd"
                    d={`M 0 0 H 100 V 100 H 0 Z M ${quad.tl.x} ${quad.tl.y} L ${quad.tr.x} ${quad.tr.y} L ${quad.br.x} ${quad.br.y} L ${quad.bl.x} ${quad.bl.y} Z`}
                    fill="rgba(15, 23, 42, 0.58)"
                    className="pointer-events-none"
                  />

                  {/* Draggable interior polygon */}
                  <polygon
                    points={`${quad.tl.x},${quad.tl.y} ${quad.tr.x},${quad.tr.y} ${quad.br.x},${quad.br.y} ${quad.bl.x},${quad.bl.y}`}
                    fill="rgba(29, 111, 242, 0.08)"
                    stroke="#1D6FF2"
                    strokeWidth="0.65"
                    vectorEffect="non-scaling-stroke"
                    className="cursor-move"
                    onPointerDown={(e) => handlePointerDown('quad-move', e)}
                  />

                  {/* Perspective rule-of-thirds inner mesh lines */}
                  {showGrid &&
                    [1 / 3, 2 / 3].map((t) => {
                      const vTop = bilerp(t, 0)
                      const vBot = bilerp(t, 1)
                      const hLeft = bilerp(0, t)
                      const hRight = bilerp(1, t)
                      return (
                        <g key={t} className="pointer-events-none" opacity="0.45">
                          <line
                            x1={vTop.x}
                            y1={vTop.y}
                            x2={vBot.x}
                            y2={vBot.y}
                            stroke="#ffffff"
                            strokeWidth="1"
                            strokeDasharray="4,4"
                            vectorEffect="non-scaling-stroke"
                          />
                          <line
                            x1={hLeft.x}
                            y1={hLeft.y}
                            x2={hRight.x}
                            y2={hRight.y}
                            stroke="#ffffff"
                            strokeWidth="1"
                            strokeDasharray="4,4"
                            vectorEffect="non-scaling-stroke"
                          />
                        </g>
                      )
                    })}
                </svg>

                {/* 4 Draggable Corner Handles (compact 12px visual dot with comfortable hit area) */}
                {CORNER_META.map(({ key, name }) => {
                  const pt = quad[key]
                  const isActive = draggingMode === key
                  return (
                    <button
                      key={key}
                      type="button"
                      aria-label={`${name} perspective handle`}
                      onPointerDown={(e) => handlePointerDown(key, e)}
                      style={{ left: `${pt.x}%`, top: `${pt.y}%` }}
                      className="group absolute -translate-x-1/2 -translate-y-1/2 flex h-6 w-6 cursor-grab active:cursor-grabbing items-center justify-center rounded-full bg-transparent p-0 focus:outline-none"
                      title={`${name} (${Math.round(pt.x)}%, ${Math.round(pt.y)}%) — Drag to align corner`}
                    >
                      <span
                        className={`block h-3 w-3 rounded-full border-[1.5px] border-white shadow-md transition-transform ${
                          isActive
                            ? 'scale-125 bg-amber-500 ring-2 ring-amber-400/80'
                            : 'bg-accent group-hover:scale-125'
                        }`}
                      />
                    </button>
                  )
                })}

                {/* Precision Corner Magnifier Loupe while dragging a corner */}
                {activeCornerKey && (
                  <div
                    className={`pointer-events-none absolute top-3 ${
                      quad[activeCornerKey].x < 50 ? 'right-3' : 'left-3'
                    } flex flex-col items-center rounded-xl border-2 border-white bg-slate-900/95 p-1.5 shadow-xl`}
                  >
                    <canvas
                      ref={loupeCanvasRef}
                      className="h-20 w-20 rounded-lg border border-slate-700"
                    />
                    <span className="mt-1 text-[10px] font-extrabold text-white">
                      {activeCornerKey.toUpperCase()}: {quad[activeCornerKey].x.toFixed(1)}%, {quad[activeCornerKey].y.toFixed(1)}%
                    </span>
                  </div>
                )}
              </div>
            )}
          </div>
          <p className="mt-1.5 text-center text-xs text-slate-500">
            {cropMode === 'perspective'
              ? 'Drag the 4 corner handles (TL, TR, BR, BL) to the corners of a skewed document, receipt, whiteboard, or card to flatten and straighten it.'
              : 'Drag the highlighted box to position, or drag the bottom-right corner dot to resize.'}
          </p>
        </div>

        {/* Live Cropped Output Preview */}
        <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <div>
            <div className="mb-2 flex items-center justify-between gap-1">
              <span className="text-xs font-extrabold uppercase tracking-wide text-slate-600">
                {cropMode === 'perspective' ? 'Flattened Warp Result' : 'Live Crop Result'}
              </span>
              <div className="flex items-center gap-1">
                {cropMode === 'perspective' && (
                  <span className="rounded bg-blue-100 px-1.5 py-0.5 text-[10px] font-bold text-accent">
                    4-Pt Homography
                  </span>
                )}
                {circular && (
                  <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-800">
                    Circular Clip
                  </span>
                )}
              </div>
            </div>
            <div className="flex min-h-48 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white p-3 shadow-inner">
              <canvas
                ref={previewCanvasRef}
                className={`max-h-48 max-w-full object-contain ${
                  circular ? 'rounded-full ring-2 ring-accent/30' : 'rounded-lg'
                }`}
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
            {cropMode === 'rect' ? (
              <>
                <div className="flex justify-between font-semibold text-slate-600">
                  <span>Crop Area:</span>
                  <strong className="text-ink-950">{crop.w}% × {crop.h}%</strong>
                </div>
                <div className="flex justify-between font-semibold text-slate-600">
                  <span>Position:</span>
                  <span className="text-slate-500">X: {crop.x}% · Y: {crop.y}%</span>
                </div>
              </>
            ) : (
              <div className="grid grid-cols-2 gap-1.5 pt-1 text-[11px] font-semibold text-slate-600">
                <div className="rounded-lg bg-white px-2 py-1 ring-1 ring-slate-200/80">
                  <span className="text-slate-400">TL:</span> {Math.round(quad.tl.x)}%, {Math.round(quad.tl.y)}%
                </div>
                <div className="rounded-lg bg-white px-2 py-1 ring-1 ring-slate-200/80">
                  <span className="text-slate-400">TR:</span> {Math.round(quad.tr.x)}%, {Math.round(quad.tr.y)}%
                </div>
                <div className="rounded-lg bg-white px-2 py-1 ring-1 ring-slate-200/80">
                  <span className="text-slate-400">BL:</span> {Math.round(quad.bl.x)}%, {Math.round(quad.bl.y)}%
                </div>
                <div className="rounded-lg bg-white px-2 py-1 ring-1 ring-slate-200/80">
                  <span className="text-slate-400">BR:</span> {Math.round(quad.br.x)}%, {Math.round(quad.br.y)}%
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
