import { useState, useEffect, useRef, type JSX } from 'react'
import {
  Sparkles,
  LayoutGrid,
  Film,
  Play,
  Pause,
} from 'lucide-react'
import type {
  CollageSettings,
  CollageLayoutMode,
  GifMakerSettings,
} from '../../processing/imageExtraTypes'
import { renderCollageToCanvas } from '../../processing/imageExtra'

// ── 1. Image Collage Maker Panel ───────────────────────────────────────────

interface CollagePanelProps {
  files: File[]
  value: CollageSettings
  onChange: (next: CollageSettings) => void
}

export function ImageCollagePanel({
  files,
  value,
  onChange,
}: CollagePanelProps): JSX.Element {
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const update = (patch: Partial<CollageSettings>) => onChange({ ...value, ...patch })

  useEffect(() => {
    if (files.length === 0) return
    let alive = true
    renderCollageToCanvas(files, value, 520)
      .then((rendered) => {
        if (!alive) return
        const dst = previewCanvasRef.current
        if (!dst) return
        dst.width = rendered.width
        dst.height = rendered.height
        const ctx = dst.getContext('2d')
        if (ctx) {
          ctx.drawImage(rendered, 0, 0)
        }
      })
      .catch(() => {
        // ignore
      })
    return () => {
      alive = false
    }
  }, [files, value])

  return (
    <div className="space-y-4">
      {files.length < 2 && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-semibold text-amber-800">
          Upload at least 2 photos (up to 12) to combine them into a collage.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-5">
        {/* Live Collage Preview */}
        <div className="flex flex-col items-center justify-center rounded-2xl border border-slate-200 bg-slate-100 p-4 shadow-inner lg:col-span-2">
          <div className="mb-2 flex w-full items-center justify-between text-xs font-bold text-slate-600">
            <span className="flex items-center gap-1.5">
              <LayoutGrid className="h-3.5 w-3.5 text-accent" /> Live Collage Preview
            </span>
            <span>{Math.min(12, files.length)} Photos</span>
          </div>
          <canvas
            ref={previewCanvasRef}
            className="max-h-[280px] max-w-full rounded-xl object-contain shadow-md"
          />
        </div>

        {/* Collage Controls */}
        <div className="grid gap-3.5 sm:grid-cols-2 lg:col-span-3">
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-ink-950">Layout Arrangement</span>
            <select
              value={value.layout}
              onChange={(e) => update({ layout: e.target.value as CollageLayoutMode })}
              className="input !py-2 text-xs"
            >
              <option value="grid">Grid Layout (Rows × Columns)</option>
              <option value="horizontal">Horizontal Film Strip (1 Row)</option>
              <option value="vertical">Vertical Stack (1 Column)</option>
            </select>
          </label>

          {value.layout === 'grid' && (
            <label className="block">
              <span className="mb-1 flex justify-between text-xs font-bold text-ink-950">
                <span>Grid Columns</span>
                <span className="text-accent">{value.cols} Cols</span>
              </span>
              <input
                type="range"
                min={1}
                max={6}
                value={value.cols}
                onChange={(e) => update({ cols: +e.target.value })}
                className="mt-2 w-full accent-accent"
              />
            </label>
          )}

          <label className="block">
            <span className="mb-1 block text-xs font-bold text-ink-950">Photo Cell Fit</span>
            <select
              value={value.fit}
              onChange={(e) => update({ fit: e.target.value as 'cover' | 'contain' })}
              className="input !py-2 text-xs"
            >
              <option value="cover">Fill & Center-Crop (Cover)</option>
              <option value="contain">Fit Full Photo Inside (Contain)</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-bold text-ink-950">Tile Aspect Ratio</span>
            <select
              value={String(value.cellAspect)}
              onChange={(e) => update({ cellAspect: +e.target.value })}
              className="input !py-2 text-xs"
            >
              <option value="1">1:1 Square Tile</option>
              <option value={String(4 / 3)}>4:3 Landscape Tile</option>
              <option value={String(3 / 4)}>3:4 Portrait Tile</option>
              <option value={String(16 / 9)}>16:9 Widescreen Tile</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1 flex justify-between text-xs font-bold text-ink-950">
              <span>Spacing Gap</span>
              <span className="text-accent">{value.gap} px</span>
            </span>
            <input
              type="range"
              min={0}
              max={64}
              value={value.gap}
              onChange={(e) => update({ gap: +e.target.value })}
              className="mt-1.5 w-full accent-accent"
            />
          </label>

          <label className="block">
            <span className="mb-1 flex justify-between text-xs font-bold text-ink-950">
              <span>Outer Frame Padding</span>
              <span className="text-accent">{value.padding} px</span>
            </span>
            <input
              type="range"
              min={0}
              max={80}
              value={value.padding}
              onChange={(e) => update({ padding: +e.target.value })}
              className="mt-1.5 w-full accent-accent"
            />
          </label>

          <label className="block">
            <span className="mb-1 flex justify-between text-xs font-bold text-ink-950">
              <span>Corner Rounding</span>
              <span className="text-accent">{value.cornerRadius} px</span>
            </span>
            <input
              type="range"
              min={0}
              max={80}
              value={value.cornerRadius}
              onChange={(e) => update({ cornerRadius: +e.target.value })}
              className="mt-1.5 w-full accent-accent"
            />
          </label>

          <div className="grid grid-cols-3 gap-2">
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-ink-950">Background</span>
              <input
                type="color"
                value={value.bgColor}
                onChange={(e) => update({ bgColor: e.target.value })}
                className="h-9 w-full cursor-pointer rounded-lg border border-slate-200 bg-white px-1"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-ink-950">Width (px)</span>
              <input
                type="number"
                min={400}
                max={4096}
                step={100}
                value={value.outputWidth}
                onChange={(e) => update({ outputWidth: Math.max(400, +e.target.value) })}
                className="input !py-1.5 !px-2 text-xs"
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-bold text-ink-950">Format</span>
              <select
                value={value.outputFormat}
                onChange={(e) =>
                  update({ outputFormat: e.target.value as 'image/jpeg' | 'image/png' })
                }
                className="input !py-1.5 !px-2 text-xs"
              >
                <option value="image/jpeg">JPG</option>
                <option value="image/png">PNG</option>
              </select>
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}

// ── 3. Animated GIF Maker Panel ────────────────────────────────────────────

interface GifPanelProps {
  files: File[]
  value: GifMakerSettings
  onChange: (next: GifMakerSettings) => void
}

export function GifMakerPanel({
  files,
  value,
  onChange,
}: GifPanelProps): JSX.Element {
  const [frameIndex, setFrameIndex] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [frameUrls, setFrameUrls] = useState<string[]>([])

  const update = (patch: Partial<GifMakerSettings>) => onChange({ ...value, ...patch })

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f))
    Promise.resolve().then(() => {
      setFrameUrls(urls)
      setFrameIndex(0)
    })
    return () => {
      for (const u of urls) URL.revokeObjectURL(u)
    }
  }, [files])

  const playbackIndices: number[] = []
  for (let i = 0; i < frameUrls.length; i++) playbackIndices.push(i)
  if (value.pingPong && frameUrls.length > 2) {
    for (let i = frameUrls.length - 2; i >= 1; i--) playbackIndices.push(i)
  }

  useEffect(() => {
    if (!playing || playbackIndices.length <= 1) return
    const timer = setInterval(() => {
      setFrameIndex((prev) => (prev + 1) % playbackIndices.length)
    }, Math.max(40, value.frameDelayMs))
    return () => clearInterval(timer)
  }, [playing, playbackIndices.length, value.frameDelayMs])

  const activeFileIdx = playbackIndices[frameIndex % Math.max(1, playbackIndices.length)] ?? 0
  const activeUrl = frameUrls[activeFileIdx]
  const fps = (1000 / Math.max(20, value.frameDelayMs)).toFixed(1)

  return (
    <div className="space-y-4">
      <div className="grid gap-5 lg:grid-cols-5">
        {/* Live Frame Animation Preview */}
        <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-slate-900 p-4 text-white shadow-md lg:col-span-2">
          <div className="mb-2 flex items-center justify-between text-xs">
            <span className="flex items-center gap-1.5 font-extrabold">
              <Film className="h-3.5 w-3.5 text-accent" /> Animation Preview ({fps} FPS)
            </span>
            <button
              type="button"
              onClick={() => setPlaying((p) => !p)}
              className="flex items-center gap-1 rounded-lg bg-white/10 px-2.5 py-1 text-[11px] font-bold hover:bg-white/20"
            >
              {playing ? <Pause className="h-3 w-3" /> : <Play className="h-3 w-3" />}
              {playing ? 'Pause' : 'Play'}
            </button>
          </div>

          <div className="flex h-48 items-center justify-center overflow-hidden rounded-xl bg-black/40 p-2">
            {activeUrl ? (
              <img
                src={activeUrl}
                alt={`Frame ${activeFileIdx + 1}`}
                className="max-h-full max-w-full object-contain"
              />
            ) : (
              <Sparkles className="h-6 w-6 text-slate-500" />
            )}
          </div>

          <div className="mt-2 flex items-center justify-between text-[11px] text-slate-300">
            <span>
              Frame {(frameIndex % Math.max(1, playbackIndices.length)) + 1} of{' '}
              {playbackIndices.length}
            </span>
            <span className="truncate max-w-[160px]">{files[activeFileIdx]?.name}</span>
          </div>
        </div>

        {/* GIF Settings */}
        <div className="grid gap-3.5 sm:grid-cols-2 lg:col-span-3">
          <label className="block">
            <span className="mb-1 flex justify-between text-xs font-bold text-ink-950">
              <span>Frame Delay</span>
              <span className="text-accent">
                {value.frameDelayMs} ms ({fps} fps)
              </span>
            </span>
            <input
              type="range"
              min={40}
              max={2000}
              step={20}
              value={value.frameDelayMs}
              onChange={(e) => update({ frameDelayMs: +e.target.value })}
              className="mt-2 w-full accent-accent"
            />
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-bold text-ink-950">Loop Mode</span>
            <select
              value={String(value.loopCount)}
              onChange={(e) => update({ loopCount: +e.target.value })}
              className="input !py-2 text-xs"
            >
              <option value="0">Infinite Loop (Standard GIF)</option>
              <option value="-1">Play Once (No Repeat)</option>
              <option value="3">Repeat 3 Times</option>
              <option value="5">Repeat 5 Times</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-bold text-ink-950">Output Width (px)</span>
            <select
              value={String(value.outputWidth)}
              onChange={(e) => update({ outputWidth: +e.target.value })}
              className="input !py-2 text-xs"
            >
              <option value="320">320 px (Compact Sticker)</option>
              <option value="480">480 px (Fast Social GIF)</option>
              <option value="640">640 px (Recommended HD GIF)</option>
              <option value="800">800 px (Large Showcase)</option>
              <option value="1080">1080 px (Full High-Res)</option>
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-bold text-ink-950">Aspect & Frame Fit</span>
            <div className="grid grid-cols-2 gap-2">
              <select
                value={value.aspectMode}
                onChange={(e) =>
                  update({ aspectMode: e.target.value as GifMakerSettings['aspectMode'] })
                }
                className="input !py-2 !px-2.5 text-xs"
              >
                <option value="first">Match 1st Frame</option>
                <option value="1:1">1:1 Square</option>
                <option value="4:3">4:3 Standard</option>
                <option value="16:9">16:9 Wide</option>
                <option value="9:16">9:16 Vertical</option>
              </select>
              <select
                value={value.fit}
                onChange={(e) => update({ fit: e.target.value as 'cover' | 'contain' })}
                className="input !py-2 !px-2.5 text-xs"
              >
                <option value="cover">Cover (Crop)</option>
                <option value="contain">Contain (Pad)</option>
              </select>
            </div>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-bold text-ink-950">
              Color Quantization Palette
            </span>
            <select
              value={value.paletteMode}
              onChange={(e) =>
                update({ paletteMode: e.target.value as 'per-frame' | 'global' })
              }
              className="input !py-2 text-xs"
            >
              <option value="per-frame">Per-Frame 256-Color Palette (Highest Fidelity)</option>
              <option value="global">Shared Global Palette (Smaller File Size)</option>
            </select>
          </label>

          <div className="flex flex-col justify-end pb-1">
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 text-xs font-bold text-ink-950">
              <input
                type="checkbox"
                checked={value.pingPong}
                onChange={(e) => update({ pingPong: e.target.checked })}
                className="h-4 w-4 accent-accent"
              />
              <span>Ping-Pong Bounce (Forward + Reverse Loop)</span>
            </label>
          </div>
        </div>
      </div>
    </div>
  )
}
