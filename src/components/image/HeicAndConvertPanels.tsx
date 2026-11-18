import { useState, useEffect, useRef, type JSX } from 'react'
import {
  Copy,
  Check,
  FileCode2,
  RefreshCw,
  Smartphone,
  Sparkles,
  AlertTriangle,
} from 'lucide-react'
import type {
  HeicSettings,
  ImageConverterSettings,
  UniversalOutputFormat,
  Base64Settings,
  Base64FormatMode,
} from '../../processing/imageExtraTypes'
import { canEncodeNatively } from '../../processing/imageCore'
import { buildBase64ForFile, decodeAnyImageToCanvas } from '../../processing/imageExtra'

// ── 1. HEIC to JPG / PNG / WebP Panel ──────────────────────────────────────

interface HeicPanelProps {
  files: File[]
  value: HeicSettings
  onChange: (next: HeicSettings) => void
}

export function HeicConverterPanel({
  files,
  value,
  onChange,
}: HeicPanelProps): JSX.Element {
  const firstFile = files[0]
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const [decodeState, setDecodeState] = useState<{
    status: 'idle' | 'loading' | 'ready' | 'error'
    dims?: { w: number; h: number }
    error?: string
  }>({ status: 'idle' })

  const update = (patch: Partial<HeicSettings>) => onChange({ ...value, ...patch })

  useEffect(() => {
    if (!firstFile) return
    let alive = true
    Promise.resolve().then(async () => {
      if (!alive) return
      setDecodeState({ status: 'loading' })
      try {
        const { decodeHeicToBitmap } = await import('../../processing/heic')
        const bmp = await decodeHeicToBitmap(firstFile)
        if (!alive) {
          bmp.close()
          return
        }
        const canvas = previewCanvasRef.current
        if (canvas) {
          const maxSide = 260
          const scale = Math.min(1, maxSide / Math.max(bmp.width, bmp.height))
          canvas.width = Math.max(1, Math.round(bmp.width * scale))
          canvas.height = Math.max(1, Math.round(bmp.height * scale))
          const ctx = canvas.getContext('2d')
          if (ctx) {
            if (value.outputFormat === 'image/jpeg') {
              ctx.fillStyle = value.bgColor || '#ffffff'
              ctx.fillRect(0, 0, canvas.width, canvas.height)
            }
            ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
          }
        }
        setDecodeState({ status: 'ready', dims: { w: bmp.width, h: bmp.height } })
        bmp.close()
      } catch (err) {
        if (!alive) return
        setDecodeState({
          status: 'error',
          error: err instanceof Error ? err.message : 'Unable to preview HEIC file.',
        })
      }
    })
    return () => {
      alive = false
    }
  }, [firstFile, value.outputFormat, value.bgColor])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <canvas
            ref={previewCanvasRef}
            className={`max-h-full max-w-full object-contain ${
              decodeState.status === 'ready' ? 'block' : 'hidden'
            }`}
          />
          {decodeState.status !== 'ready' && (
            <Smartphone className="h-7 w-7 text-slate-400" />
          )}
        </div>
        <div className="min-w-0 flex-1 text-xs">
          <div className="flex items-center gap-2 font-bold text-ink-950">
            <span className="truncate">{firstFile?.name}</span>
            {files.length > 1 && (
              <span className="rounded-full bg-accent/10 px-2 py-0.5 text-[10px] font-extrabold text-accent">
                +{files.length - 1} more in batch
              </span>
            )}
          </div>
          <div className="mt-1 text-slate-500">
            {decodeState.status === 'loading' && 'Decoding HEIC preview on device…'}
            {decodeState.status === 'ready' &&
              decodeState.dims &&
              `Decoded HEIC: ${decodeState.dims.w} × ${decodeState.dims.h} px · Orientation preserved`}
            {decodeState.status === 'error' && (
              <span className="text-amber-700">{decodeState.error}</span>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1.5 block text-sm font-bold text-ink-950">
            Target Format
          </span>
          <select
            value={value.outputFormat}
            onChange={(e) =>
              update({ outputFormat: e.target.value as HeicSettings['outputFormat'] })
            }
            className="input"
          >
            <option value="image/jpeg">JPG (Universal Compatibility)</option>
            <option value="image/png">PNG (Lossless + Alpha)</option>
            <option value="image/webp">WebP (Compact Modern)</option>
          </select>
        </label>

        {value.outputFormat !== 'image/png' && (
          <label className="block">
            <span className="mb-1.5 flex justify-between text-sm font-bold text-ink-950">
              <span>Quality</span>
              <span className="text-accent">{value.quality}%</span>
            </span>
            <input
              type="range"
              min={10}
              max={100}
              value={value.quality}
              onChange={(e) => update({ quality: +e.target.value })}
              className="mt-3 w-full accent-[#1D6FF2]"
            />
          </label>
        )}

        {value.outputFormat === 'image/jpeg' && (
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-ink-950">
              Background Fill
            </span>
            <input
              type="color"
              value={value.bgColor}
              onChange={(e) => update({ bgColor: e.target.value })}
              className="h-[46px] w-full cursor-pointer rounded-xl border border-slate-200 bg-white px-2"
            />
          </label>
        )}
      </div>
    </div>
  )
}

// ── 2. Universal Image Converter Panel ─────────────────────────────────────

interface ConverterPanelProps {
  files: File[]
  value: ImageConverterSettings
  onChange: (next: ImageConverterSettings) => void
}

export function ImageConverterPanel({
  files,
  value,
  onChange,
}: ConverterPanelProps): JSX.Element {
  const firstFile = files[0]
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const [nativeSupport, setNativeSupport] = useState<boolean>(true)
  const [previewDims, setPreviewDims] = useState<{ w: number; h: number } | null>(null)

  const hasSvg = files.some(
    (f) => f.type === 'image/svg+xml' || f.name.toLowerCase().endsWith('.svg'),
  )

  const update = (patch: Partial<ImageConverterSettings>) =>
    onChange({ ...value, ...patch })

  useEffect(() => {
    let alive = true
    canEncodeNatively(value.outputFormat).then((ok) => {
      if (alive) setNativeSupport(ok)
    })
    return () => {
      alive = false
    }
  }, [value.outputFormat])

  useEffect(() => {
    if (!firstFile) return
    let alive = true
    decodeAnyImageToCanvas(firstFile, value.svgWidth, value.svgScale)
      .then((srcCanvas) => {
        if (!alive) return
        setPreviewDims({ w: srcCanvas.width, h: srcCanvas.height })
        const dst = previewCanvasRef.current
        if (!dst) return
        const maxSide = 220
        const scale = Math.min(1, maxSide / Math.max(srcCanvas.width, srcCanvas.height))
        dst.width = Math.max(1, Math.round(srcCanvas.width * scale))
        dst.height = Math.max(1, Math.round(srcCanvas.height * scale))
        const ctx = dst.getContext('2d')
        if (!ctx) return
        if (value.outputFormat === 'image/jpeg') {
          ctx.fillStyle = value.bgColor || '#ffffff'
          ctx.fillRect(0, 0, dst.width, dst.height)
        } else {
          ctx.clearRect(0, 0, dst.width, dst.height)
        }
        ctx.drawImage(srcCanvas, 0, 0, dst.width, dst.height)
      })
      .catch(() => {
        // ignore preview failure
      })
    return () => {
      alive = false
    }
  }, [firstFile, value.svgWidth, value.svgScale, value.outputFormat, value.bgColor])

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-3.5">
        <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <canvas ref={previewCanvasRef} className="max-h-full max-w-full object-contain" />
        </div>
        <div className="min-w-0 flex-1 text-xs">
          <div className="font-bold text-ink-950 truncate">{firstFile?.name}</div>
          <div className="mt-0.5 text-slate-500">
            {previewDims ? `Raster Dimensions: ${previewDims.w} × ${previewDims.h} px` : 'Ready to convert'}
            {files.length > 1 && ` · Batch of ${files.length} files`}
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="inline-flex items-center gap-1 rounded-md bg-blue-50 px-2 py-0.5 text-[10px] font-extrabold text-accent ring-1 ring-blue-200">
              <RefreshCw className="h-3 w-3" /> Target: {value.outputFormat.split('/')[1].toUpperCase()}
            </span>
            {!nativeSupport && value.outputFormat === 'image/avif' && (
              <span className="inline-flex items-center gap-1 rounded-md bg-teal-50 px-2 py-0.5 text-[10px] font-bold text-teal-800 ring-1 ring-teal-200">
                <Sparkles className="h-3 w-3" /> Uses on-device @jsquash/avif WASM encoder
              </span>
            )}
            {!nativeSupport && value.outputFormat !== 'image/avif' && (
              <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-[10px] font-bold text-amber-800 ring-1 ring-amber-200">
                <AlertTriangle className="h-3 w-3" /> Browser canvas may fall back to PNG (auto-verified)
              </span>
            )}
          </div>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1.5 block text-sm font-bold text-ink-950">
            Convert To Format
          </span>
          <select
            value={value.outputFormat}
            onChange={(e) =>
              update({ outputFormat: e.target.value as UniversalOutputFormat })
            }
            className="input"
          >
            <option value="image/webp">WebP (Modern & Compact)</option>
            <option value="image/jpeg">JPG (Universal Photo)</option>
            <option value="image/png">PNG (Lossless + Transparency)</option>
            <option value="image/avif">AVIF (Next-Gen High Compression)</option>
          </select>
        </label>

        {value.outputFormat !== 'image/png' && (
          <label className="block">
            <span className="mb-1.5 flex justify-between text-sm font-bold text-ink-950">
              <span>Compression Quality</span>
              <span className="text-accent">{value.quality}%</span>
            </span>
            <input
              type="range"
              min={10}
              max={100}
              value={value.quality}
              onChange={(e) => update({ quality: +e.target.value })}
              className="mt-3 w-full accent-[#1D6FF2]"
            />
          </label>
        )}

        {value.outputFormat === 'image/jpeg' && (
          <label className="block">
            <span className="mb-1.5 block text-sm font-bold text-ink-950">
              Transparency Fill Color
            </span>
            <input
              type="color"
              value={value.bgColor}
              onChange={(e) => update({ bgColor: e.target.value })}
              className="h-[46px] w-full cursor-pointer rounded-xl border border-slate-200 bg-white px-2"
            />
          </label>
        )}
      </div>

      {/* SVG Rasterization Controls */}
      {hasSvg && (
        <div className="grid gap-4 rounded-2xl border border-slate-200 bg-slate-50 p-3.5 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-bold text-ink-950">
              SVG Target Width (px, 0 = use scale multiplier)
            </span>
            <input
              type="number"
              min={0}
              max={8192}
              step={64}
              placeholder="0 = auto from viewBox × scale"
              value={value.svgWidth || ''}
              onChange={(e) => update({ svgWidth: Math.max(0, +e.target.value) })}
              className="input !py-2 text-xs"
            />
          </label>
          <label className="block">
            <span className="mb-1 flex justify-between text-xs font-bold text-ink-950">
              <span>SVG Resolution Scale Multiplier</span>
              <span className="text-accent">{value.svgScale}×</span>
            </span>
            <div className="mt-1 flex gap-1.5">
              {[1, 2, 3, 4].map((sc) => (
                <button
                  key={sc}
                  type="button"
                  onClick={() => update({ svgScale: sc, svgWidth: 0 })}
                  className={`flex-1 rounded-lg border py-1.5 text-xs font-bold transition ${
                    value.svgScale === sc && value.svgWidth === 0
                      ? 'border-accent bg-accent text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  {sc}×
                </button>
              ))}
            </div>
          </label>
        </div>
      )}
    </div>
  )
}

// ── 3. Image to Base64 Panel ───────────────────────────────────────────────

interface Base64PanelProps {
  files: File[]
  value: Base64Settings
  onChange: (next: Base64Settings) => void
}

const BASE64_MODES: { id: Base64FormatMode; label: string }[] = [
  { id: 'data-uri', label: 'Data URI (data:image/...;base64,...)' },
  { id: 'raw', label: 'Raw Base64 Payload Only' },
  { id: 'html', label: 'HTML <img src="..." /> Tag' },
  { id: 'css', label: 'CSS background-image Rule' },
  { id: 'markdown', label: 'Markdown ![alt](data:...) Image' },
  { id: 'all', label: 'All Snippets Bundle (.txt)' },
]

export function ImageToBase64Panel({
  files,
  value,
  onChange,
}: Base64PanelProps): JSX.Element {
  const firstFile = files[0]
  const [previewInfo, setPreviewInfo] = useState<{
    snippet: string
    mime: string
    width: number
    height: number
    byteLength: number
  } | null>(null)
  const [copied, setCopied] = useState(false)

  const update = (patch: Partial<Base64Settings>) => onChange({ ...value, ...patch })

  useEffect(() => {
    if (!firstFile) return
    let alive = true
    buildBase64ForFile(firstFile, value)
      .then((res) => {
        if (alive) {
          setPreviewInfo({
            snippet: res.snippet,
            mime: res.mime,
            width: res.width,
            height: res.height,
            byteLength: res.byteLength,
          })
        }
      })
      .catch(() => {
        // ignore
      })
    return () => {
      alive = false
    }
  }, [firstFile, value])

  const handleCopy = async () => {
    if (!previewInfo) return
    try {
      await navigator.clipboard.writeText(previewInfo.snippet)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      // Fallback copy via textarea
      const ta = document.createElement('textarea')
      ta.value = previewInfo.snippet
      document.body.appendChild(ta)
      ta.select()
      document.execCommand('copy')
      ta.remove()
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const truncatedPreview =
    previewInfo && previewInfo.snippet.length > 1400
      ? `${previewInfo.snippet.slice(0, 750)}\n\n… [${(
          previewInfo.snippet.length - 1150
        ).toLocaleString()} characters truncated in preview — click Copy or Process to get full ${previewInfo.snippet.length.toLocaleString()} chars] …\n\n${previewInfo.snippet.slice(-400)}`
      : (previewInfo?.snippet ?? 'Encoding preview…')

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <label className="block">
          <span className="mb-1.5 block text-sm font-bold text-ink-950">
            Output Snippet Format
          </span>
          <select
            value={value.mode}
            onChange={(e) => update({ mode: e.target.value as Base64FormatMode })}
            className="input"
          >
            {BASE64_MODES.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-bold text-ink-950">
            Optional Pre-Resize Max Edge
          </span>
          <select
            value={String(value.maxEdge)}
            onChange={(e) => update({ maxEdge: +e.target.value })}
            className="input"
          >
            <option value="0">Original Size (Keep exact bytes)</option>
            <option value="1280">Max 1280 px (HD Inline)</option>
            <option value="640">Max 640 px (Compact Embed)</option>
            <option value="256">Max 256 px (Thumbnail / Avatar)</option>
            <option value="64">Max 64 px (Micro Placeholder)</option>
          </select>
        </label>

        <label className="block">
          <span className="mb-1.5 block text-sm font-bold text-ink-950">
            Re-encode Format
          </span>
          <select
            value={value.outputFormat}
            onChange={(e) =>
              update({ outputFormat: e.target.value as Base64Settings['outputFormat'] })
            }
            className="input"
          >
            <option value="keep">Keep Original Format</option>
            <option value="image/webp">Convert to WebP (Smallest Base64)</option>
            <option value="image/jpeg">Convert to JPG</option>
            <option value="image/png">Convert to PNG</option>
          </select>
        </label>
      </div>

      {/* Live Preview & Instant Copy Box for First File */}
      {previewInfo && (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 shadow-sm">
          <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs">
              <FileCode2 className="h-4 w-4 text-accent" />
              <span className="font-extrabold text-ink-950">
                Live Base64 Preview ({firstFile?.name})
              </span>
              <span className="text-slate-500">
                · {previewInfo.mime}
                {previewInfo.width > 0 ? ` · ${previewInfo.width}×${previewInfo.height} px` : ''}
                {' · '}
                <strong>{previewInfo.snippet.length.toLocaleString()} chars</strong> (~
                {Math.max(1, Math.round(previewInfo.snippet.length / 1024))} KB text)
              </span>
            </div>

            <button
              type="button"
              onClick={handleCopy}
              className={`flex items-center gap-1.5 rounded-xl px-3.5 py-1.5 text-xs font-extrabold shadow-sm transition ${
                copied
                  ? 'bg-emerald-600 text-white'
                  : 'bg-accent text-white hover:bg-accent-dark'
              }`}
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5" /> Copied Full String!
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" /> Copy Full Snippet
                </>
              )}
            </button>
          </div>

          <pre className="max-h-48 overflow-auto rounded-xl border border-slate-200 bg-white p-3 font-mono text-[11px] leading-relaxed text-slate-700 select-all">
            {truncatedPreview}
          </pre>
        </div>
      )}
    </div>
  )
}
