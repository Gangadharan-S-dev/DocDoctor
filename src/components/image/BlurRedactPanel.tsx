import { useRef, useState, useEffect, type JSX } from 'react'
import {
  Plus,
  Trash2,
  ShieldAlert,
  EyeOff,
  Grid,
  Square,
  Layers,
} from 'lucide-react'
import type {
  BlurSettings,
  RedactRegion,
  RedactStyle,
} from '../../processing/imageExtraTypes'
import { normalizeRedactRegion } from '../../processing/imageExtraMath'
import { applyRedactionToCanvas } from '../../processing/imageExtra'

interface BlurRedactPanelProps {
  files: File[]
  value: BlurSettings
  onChange: (next: BlurSettings) => void
}

const STYLE_LABELS: { id: RedactStyle; label: string }[] = [
  { id: 'blur', label: 'Gaussian Box Blur' },
  { id: 'pixelate', label: 'Censor Pixelate' },
  { id: 'blackout', label: 'Solid Blackout' },
]

export default function BlurRedactPanel({
  files,
  value,
  onChange,
}: BlurRedactPanelProps): JSX.Element {
  const firstFile = files[0]
  const containerRef = useRef<HTMLDivElement>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)

  const [selectedId, setSelectedId] = useState<string | null>(
    value.regions[0]?.id ?? null,
  )
  const [interaction, setInteraction] = useState<{
    type: 'draw' | 'move' | 'resize'
    regionId: string
    startX: number
    startY: number
    initial: RedactRegion
  } | null>(null)

  const update = (patch: Partial<BlurSettings>) => {
    onChange({ ...value, ...patch })
  }

  // Draw live destructive redaction preview on the canvas
  useEffect(() => {
    if (!firstFile) return
    let alive = true
    const url = URL.createObjectURL(firstFile)
    const img = new Image()
    img.onload = () => {
      if (!alive) return
      const canvas = previewCanvasRef.current
      if (!canvas) return
      const natW = img.naturalWidth || 800
      const natH = img.naturalHeight || 600
      const scale = Math.min(1, 760 / Math.max(natW, natH))
      const cw = Math.max(16, Math.round(natW * scale))
      const ch = Math.max(16, Math.round(natH * scale))
      canvas.width = cw
      canvas.height = ch
      const ctx = canvas.getContext('2d', { willReadFrequently: true })
      if (!ctx) return
      ctx.drawImage(img, 0, 0, cw, ch)
      applyRedactionToCanvas(canvas, value)
    }
    img.src = url
    return () => {
      alive = false
      URL.revokeObjectURL(url)
    }
  }, [firstFile, value])

  const getRelPct = (clientX: number, clientY: number) => {
    const el = containerRef.current
    if (!el) return { x: 0, y: 0 }
    const rect = el.getBoundingClientRect()
    const x = Math.max(0, Math.min(100, ((clientX - rect.left) / Math.max(1, rect.width)) * 100))
    const y = Math.max(0, Math.min(100, ((clientY - rect.top) / Math.max(1, rect.height)) * 100))
    return { x, y }
  }

  const nextRegionId = (regions: RedactRegion[]): string => {
    let max = 0
    for (const r of regions) {
      const m = r.id.match(/(\d+)$/)
      if (m) max = Math.max(max, Number(m[1]))
    }
    return `reg-${max + 1}`
  }

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (value.scope !== 'regions') return
    const pt = getRelPct(e.clientX, e.clientY)
    const newId = nextRegionId(value.regions)
    const newReg: RedactRegion = {
      id: newId,
      x: Math.round(pt.x),
      y: Math.round(pt.y),
      w: 12,
      h: 10,
      style: value.defaultStyle,
    }
    const nextRegions = [...value.regions, newReg]
    update({ regions: nextRegions })
    setSelectedId(newId)
    setInteraction({
      type: 'draw',
      regionId: newId,
      startX: pt.x,
      startY: pt.y,
      initial: newReg,
    })
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  const handleRegionPointerDown = (
    mode: 'move' | 'resize',
    reg: RedactRegion,
    e: React.PointerEvent,
  ) => {
    e.stopPropagation()
    const pt = getRelPct(e.clientX, e.clientY)
    setSelectedId(reg.id)
    setInteraction({
      type: mode,
      regionId: reg.id,
      startX: pt.x,
      startY: pt.y,
      initial: { ...reg },
    })
    if (containerRef.current) {
      containerRef.current.setPointerCapture(e.pointerId)
    }
  }

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interaction) return
    const pt = getRelPct(e.clientX, e.clientY)
    const dx = pt.x - interaction.startX
    const dy = pt.y - interaction.startY

    const nextRegions = value.regions.map((r) => {
      if (r.id !== interaction.regionId) return r
      if (interaction.type === 'draw') {
        return normalizeRedactRegion({
          ...r,
          x: Math.min(interaction.startX, pt.x),
          y: Math.min(interaction.startY, pt.y),
          w: Math.max(4, Math.abs(pt.x - interaction.startX)),
          h: Math.max(4, Math.abs(pt.y - interaction.startY)),
        })
      }
      if (interaction.type === 'move') {
        return normalizeRedactRegion({
          ...r,
          x: Math.max(0, Math.min(100 - interaction.initial.w, interaction.initial.x + dx)),
          y: Math.max(0, Math.min(100 - interaction.initial.h, interaction.initial.y + dy)),
        })
      }
      // resize
      return normalizeRedactRegion({
        ...r,
        w: Math.max(4, Math.min(100 - interaction.initial.x, interaction.initial.w + dx)),
        h: Math.max(4, Math.min(100 - interaction.initial.y, interaction.initial.h + dy)),
      })
    })
    update({ regions: nextRegions })
  }

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!interaction) return
    setInteraction(null)
    try {
      e.currentTarget.releasePointerCapture(e.pointerId)
    } catch {
      // ignore
    }
  }

  const addBox = () => {
    const offset = (value.regions.length * 7) % 45
    const newReg: RedactRegion = {
      id: nextRegionId(value.regions),
      x: 15 + offset,
      y: 15 + offset,
      w: 35,
      h: 20,
      style: value.defaultStyle,
    }
    update({ regions: [...value.regions, newReg] })
    setSelectedId(newReg.id)
  }

  const removeBox = (id: string) => {
    const next = value.regions.filter((r) => r.id !== id)
    update({ regions: next })
    if (selectedId === id) {
      setSelectedId(next[0]?.id ?? null)
    }
  }

  const updateRegionStyle = (id: string, style: RedactStyle) => {
    update({
      regions: value.regions.map((r) => (r.id === id ? { ...r, style } : r)),
    })
  }

  return (
    <div className="space-y-4">
      {/* Scope Switcher: Region Redaction vs Whole-Image Blur */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => update({ scope: 'regions' })}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-extrabold transition ${
              value.scope === 'regions'
                ? 'bg-accent text-white shadow-sm'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
            }`}
          >
            <EyeOff className="h-3.5 w-3.5" /> Region Redaction Boxes
          </button>
          <button
            type="button"
            onClick={() => update({ scope: 'whole' })}
            className={`flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-extrabold transition ${
              value.scope === 'whole'
                ? 'bg-accent text-white shadow-sm'
                : 'border border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
            }`}
          >
            <Layers className="h-3.5 w-3.5" /> Whole-Image Blur (Supports Batch)
          </button>
        </div>

        <div className="flex items-center gap-1.5 text-xs font-bold text-emerald-700">
          <ShieldAlert className="h-4 w-4 text-emerald-600" />
          <span>Destructive pixel replacement (irreversible in output)</span>
        </div>
      </div>

      {files.length > 1 && value.scope === 'regions' && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-semibold text-amber-800">
          Multiple files uploaded ({files.length}): Region Redaction processes the first image (
          <strong>{firstFile?.name}</strong>). Switch to <strong>Whole-Image Blur</strong> above to
          process all {files.length} images as a batch.
        </div>
      )}

      {/* Style & Intensity Controls */}
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <span className="mb-1.5 block text-xs font-bold text-ink-950">
            {value.scope === 'whole' ? 'Redaction Mode' : 'Default New Box Mode'}
          </span>
          <div className="flex flex-wrap gap-1.5">
            {STYLE_LABELS.map((st) => (
              <button
                key={st.id}
                type="button"
                onClick={() => {
                  if (value.scope === 'whole') {
                    update({ defaultStyle: st.id })
                  } else if (selectedId) {
                    update({
                      defaultStyle: st.id,
                      regions: value.regions.map((r) =>
                        r.id === selectedId ? { ...r, style: st.id } : r,
                      ),
                    })
                  } else {
                    update({ defaultStyle: st.id })
                  }
                }}
                className={`flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-bold transition ${
                  value.defaultStyle === st.id
                    ? 'border-accent bg-accent text-white shadow-sm'
                    : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-50'
                }`}
              >
                {st.id === 'pixelate' ? (
                  <Grid className="h-3.5 w-3.5" />
                ) : st.id === 'blackout' ? (
                  <Square className="h-3.5 w-3.5" />
                ) : (
                  <EyeOff className="h-3.5 w-3.5" />
                )}
                {st.label}
              </button>
            ))}
          </div>
        </div>

        <label className="block">
          <span className="mb-1.5 flex justify-between text-xs font-bold text-ink-950">
            <span>Blur / Pixelate Intensity</span>
            <span className="text-accent">{value.intensity}%</span>
          </span>
          <input
            type="range"
            min={10}
            max={100}
            value={value.intensity}
            onChange={(e) => update({ intensity: +e.target.value })}
            className="mt-2 w-full accent-[#1D6FF2]"
          />
        </label>

        <label className="block">
          <span className="mb-1.5 block text-xs font-bold text-ink-950">
            Blackout Fill Color
          </span>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={value.blackoutColor}
              onChange={(e) => update({ blackoutColor: e.target.value })}
              className="h-9 w-16 cursor-pointer rounded-lg border border-slate-200 bg-white px-1"
            />
            {['#0f172a', '#000000', '#ffffff'].map((hex) => (
              <button
                key={hex}
                type="button"
                onClick={() => update({ blackoutColor: hex })}
                className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-[11px] font-mono font-bold text-slate-600 hover:bg-slate-50"
              >
                {hex}
              </button>
            ))}
          </div>
        </label>
      </div>

      {/* Interactive Preview Canvas + Region List */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <div
            ref={containerRef}
            onPointerDown={handleCanvasPointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            className="relative mx-auto inline-block max-w-full cursor-crosshair select-none overflow-hidden rounded-2xl border border-slate-200 bg-slate-900 shadow-md"
          >
            <canvas
              ref={previewCanvasRef}
              className="block max-h-[440px] max-w-full object-contain"
            />

            {value.scope === 'regions' &&
              value.regions.map((reg, idx) => {
                const isSelected = reg.id === selectedId
                return (
                  <div
                    key={reg.id}
                    onPointerDown={(e) => handleRegionPointerDown('move', reg, e)}
                    style={{
                      left: `${reg.x}%`,
                      top: `${reg.y}%`,
                      width: `${reg.w}%`,
                      height: `${reg.h}%`,
                    }}
                    className={`absolute cursor-move border-2 transition-shadow ${
                      isSelected
                        ? 'border-accent ring-2 ring-white/80'
                        : 'border-amber-400/90 hover:border-accent'
                    }`}
                  >
                    <div className="pointer-events-none absolute -top-5 left-0 flex items-center gap-1 rounded bg-ink-950/90 px-1.5 py-0.5 text-[10px] font-extrabold text-white shadow">
                      <span>
                        #{idx + 1} {reg.style.toUpperCase()}
                      </span>
                    </div>
                    <div
                      onPointerDown={(e) => handleRegionPointerDown('resize', reg, e)}
                      className="absolute -bottom-2 -right-2 h-4 w-4 cursor-nwse-resize rounded-full border-2 border-white bg-accent shadow"
                      title="Drag corner to resize box"
                    />
                  </div>
                )
              })}
          </div>
          <p className="mt-1.5 text-xs text-slate-500">
            {value.scope === 'regions'
              ? 'Click and drag anywhere on the image to draw a new redaction box. Drag a box to move it, or drag its bottom-right dot to resize.'
              : 'Whole-image mode applies destructive multi-pass blur or pixelation across the entire image.'}
          </p>
        </div>

        {/* Region List Sidebar */}
        {value.scope === 'regions' && (
          <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
            <div>
              <div className="mb-2.5 flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wide text-ink-950">
                  Redaction Boxes ({value.regions.length})
                </span>
                <button
                  type="button"
                  onClick={addBox}
                  className="flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-xs font-bold text-white shadow-sm hover:bg-accent-dark"
                >
                  <Plus className="h-3.5 w-3.5" /> Add Box
                </button>
              </div>

              {value.regions.length === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-300 p-4 text-center text-xs text-slate-500">
                  No redaction boxes active. Drag on the image or click &ldquo;Add Box&rdquo;.
                </div>
              ) : (
                <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                  {value.regions.map((reg, idx) => (
                    <div
                      key={reg.id}
                      onClick={() => setSelectedId(reg.id)}
                      className={`flex items-center justify-between gap-2 rounded-xl border p-2.5 text-xs transition cursor-pointer ${
                        reg.id === selectedId
                          ? 'border-accent bg-white shadow-sm ring-1 ring-accent'
                          : 'border-slate-200 bg-white/70 hover:bg-white'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="font-bold text-ink-950">
                          Box #{idx + 1}{' '}
                          <span className="font-normal text-slate-500">
                            ({Math.round(reg.w)}% × {Math.round(reg.h)}%)
                          </span>
                        </div>
                        <div className="mt-1 flex gap-1">
                          {(['blur', 'pixelate', 'blackout'] as RedactStyle[]).map((st) => (
                            <button
                              key={st}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation()
                                updateRegionStyle(reg.id, st)
                              }}
                              className={`rounded px-1.5 py-0.5 text-[10px] font-bold uppercase ${
                                reg.style === st
                                  ? 'bg-accent text-white'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                            >
                              {st}
                            </button>
                          ))}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation()
                          removeBox(reg.id)
                        }}
                        className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600"
                        title="Remove redaction box"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {value.regions.length > 0 && (
              <button
                type="button"
                onClick={() => update({ regions: [] })}
                className="mt-3 w-full rounded-xl border border-slate-200 bg-white py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-100"
              >
                Clear All Boxes
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
