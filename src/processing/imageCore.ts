/**
 * Shared low-level image helpers used by every image engine (main thread and
 * worker). Everything here must work both with `document` (main thread) and
 * without it (Web Worker + OffscreenCanvas).
 */

export type ImgFormat = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif'
export type AnyCanvas = HTMLCanvasElement | OffscreenCanvas
export type AnyCtx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D

export const EXT: Record<string, string> = {
  'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'image/avif': 'avif',
  'image/gif': 'gif', 'image/x-icon': 'ico', 'image/svg+xml': 'svg',
}
export const extFor = (type: string) => EXT[type] ?? 'png'

export interface NamingTokens {
  /** Original filename stem (without extension) */
  name: string
  /** 1-based index in the batch */
  n: number
  /** Output width in pixels (if known) */
  w?: number
  /** Output height in pixels (if known) */
  h?: number
  /** Output extension without leading dot (e.g. 'jpg') */
  ext: string
  /** YYYY-MM-DD date string */
  date?: string
}

/**
 * Format an output filename from a pattern containing tokens:
 * `{name}`, `{n}`, `{w}`, `{h}`, `{ext}`, `{date}`.
 * Ensures a valid extension is always present.
 */
export function formatOutputName(pattern: string, tokens: NamingTokens): string {
  const trimmed = pattern.trim()
  const ext = (tokens.ext || 'png').replace(/^\./, '').toLowerCase()
  if (!trimmed) {
    return `${tokens.name}.${ext}`
  }
  const dateStr = tokens.date ?? new Date().toISOString().slice(0, 10)
  const hasExtToken = /\{ext\}/i.test(trimmed)
  let out = trimmed
    .replace(/\{name\}/gi, tokens.name || 'image')
    .replace(/\{n\}/gi, String(tokens.n))
    .replace(/\{w\}/gi, tokens.w && tokens.w > 0 ? String(tokens.w) : '')
    .replace(/\{h\}/gi, tokens.h && tokens.h > 0 ? String(tokens.h) : '')
    .replace(/\{ext\}/gi, ext)
    .replace(/\{date\}/gi, dateStr)

  // Clean up dangling separators when {w} or {h} is empty (e.g., "{name}-{w}x{h}")
  out = out.replace(/[-_]+x[-_]+/g, '-').replace(/[-_]{2,}/g, '-').replace(/^[-_.]+|[-_.]+$/g, '')
  if (!out) out = tokens.name || `image-${tokens.n}`
  if (!hasExtToken && !out.toLowerCase().endsWith(`.${ext}`)) {
    out = `${out}.${ext}`
  }
  return out
}

/**
 * Conservative pixel budget for a single canvas. iOS Safari refuses canvases
 * above 16,777,216 px (4096²) and silently produces blank output; desktop
 * browsers allow more, but very large canvases are slow and memory hungry.
 */
export const MAX_CANVAS_PIXELS = 16_777_216
/** Hard per-side ceiling shared by all major browsers. */
export const MAX_CANVAS_SIDE = 16_384

/** Scale factor (≤ 1) needed so a w×h canvas fits the browser canvas limits. */
export function canvasLimitScale(w: number, h: number, maxPixels = MAX_CANVAS_PIXELS): number {
  if (w <= 0 || h <= 0) return 1
  let s = 1
  if (w * h > maxPixels) s = Math.sqrt(maxPixels / (w * h))
  const side = Math.max(w, h) * s
  if (side > MAX_CANVAS_SIDE) s *= MAX_CANVAS_SIDE / side
  return Math.min(1, s)
}

/** Clamp target dimensions into the canvas limits, preserving aspect ratio. */
export function clampDims(w: number, h: number): { w: number; h: number; scaled: boolean } {
  const s = canvasLimitScale(w, h)
  return {
    w: Math.max(1, Math.round(w * s)),
    h: Math.max(1, Math.round(h * s)),
    scaled: s < 1,
  }
}

const hasDocument = () => typeof document !== 'undefined' && typeof document.createElement === 'function'

/** Create a canvas (DOM canvas on the main thread, OffscreenCanvas in workers). Dimensions are clamped to canvas limits. */
export function makeCanvas(w: number, h: number): AnyCanvas {
  const { w: cw, h: ch } = clampDims(Math.max(1, Math.round(w)), Math.max(1, Math.round(h)))
  if (hasDocument()) {
    const c = document.createElement('canvas')
    c.width = cw
    c.height = ch
    return c
  }
  return new OffscreenCanvas(cw, ch)
}

export function ctx2d(c: AnyCanvas, opts?: CanvasRenderingContext2DSettings): AnyCtx {
  const ctx = c.getContext('2d', opts) as AnyCtx | null
  if (!ctx) throw new Error('Canvas 2D context unavailable in this browser.')
  return ctx
}

export interface EncodeResult {
  blob: Blob
  /** The type the browser actually produced (may differ from the requested type). */
  type: string
  /** True when the browser could not encode the requested type and fell back. */
  fellBack: boolean
}

function rawEncode(c: AnyCanvas, type: string, quality?: number): Promise<Blob> {
  if ('convertToBlob' in c) return c.convertToBlob({ type, quality })
  return new Promise((res, rej) =>
    (c as HTMLCanvasElement).toBlob((b) => (b ? res(b) : rej(new Error('Image encoding failed in this browser.'))), type, quality))
}

/**
 * Encode a canvas and verify the browser really produced the requested type.
 * Safari, for example, cannot encode WebP and silently returns PNG — callers
 * must use `result.type` for the file extension instead of the requested type.
 */
export async function encodeVerified(c: AnyCanvas, type: string, quality?: number): Promise<EncodeResult> {
  const blob = await rawEncode(c, type, quality)
  const actual = blob.type || 'image/png'
  return { blob, type: actual, fellBack: actual !== type }
}

/** Cache of browser encode support, filled lazily. */
const encodeSupport = new Map<string, boolean>()

/** Whether the browser's canvas can natively encode `type` (e.g. WebP is unsupported in Safari). */
export async function canEncodeNatively(type: string): Promise<boolean> {
  if (type === 'image/png') return true
  const cached = encodeSupport.get(type)
  if (cached !== undefined) return cached
  try {
    const c = makeCanvas(2, 2)
    ctx2d(c).fillRect(0, 0, 1, 1)
    const { fellBack } = await encodeVerified(c, type, 0.8)
    encodeSupport.set(type, !fellBack)
    return !fellBack
  } catch {
    encodeSupport.set(type, false)
    return false
  }
}

/** Output type that preserves the source format when the browser can write it (JPEG otherwise). */
export function pickOutputType(fileType: string, opts?: { needsAlpha?: boolean }): ImgFormat {
  if (fileType === 'image/png') return 'image/png'
  if (fileType === 'image/webp') return 'image/webp'
  if (opts?.needsAlpha || fileType === 'image/gif' || fileType === 'image/svg+xml' || fileType === 'image/x-icon') return 'image/png'
  return 'image/jpeg'
}

/** Paint `src` onto a new canvas filled with `bg` (used for JPEG output, which has no alpha). */
export function flattenOnto(src: AnyCanvas, bg = '#ffffff'): AnyCanvas {
  const out = makeCanvas(src.width, src.height)
  const ctx = ctx2d(out)
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.drawImage(src, 0, 0)
  return out
}

/**
 * High-quality downscale: repeatedly halves the image before the final draw so
 * large reductions (e.g. 4000 → 400 px) don't alias the way a single
 * `drawImage` does. Upscales and small reductions take a single draw.
 */
export function drawScaled(
  src: CanvasImageSource & { width: number; height: number },
  dstW: number,
  dstH: number,
  opts?: { smoothing?: 'high' | 'pixelated'; sx?: number; sy?: number; sw?: number; sh?: number },
): AnyCanvas {
  const sx = opts?.sx ?? 0, sy = opts?.sy ?? 0
  const sw = opts?.sw ?? src.width, sh = opts?.sh ?? src.height
  const out = makeCanvas(dstW, dstH)
  const W = out.width, H = out.height
  const pixelated = opts?.smoothing === 'pixelated'

  let cur: CanvasImageSource = src
  let cx = sx, cy = sy, cw = sw, ch = sh
  if (!pixelated) {
    while (cw / 2 >= W * 1.05 && ch / 2 >= H * 1.05 && cw > 2 && ch > 2) {
      const nw = Math.max(W, Math.round(cw / 2))
      const nh = Math.max(H, Math.round(ch / 2))
      const step = makeCanvas(nw, nh)
      const sctx = ctx2d(step)
      sctx.imageSmoothingEnabled = true
      sctx.imageSmoothingQuality = 'high'
      sctx.drawImage(cur, cx, cy, cw, ch, 0, 0, step.width, step.height)
      cur = step
      cx = 0; cy = 0; cw = step.width; ch = step.height
    }
  }
  const ctx = ctx2d(out)
  ctx.imageSmoothingEnabled = !pixelated
  if (!pixelated) ctx.imageSmoothingQuality = 'high'
  ctx.drawImage(cur, cx, cy, cw, ch, 0, 0, W, H)
  return out
}

/** Decode a file into an ImageBitmap honoring EXIF orientation. */
export async function decodeBitmap(blob: Blob): Promise<ImageBitmap> {
  try {
    return await createImageBitmap(blob, { imageOrientation: 'from-image' })
  } catch {
    return createImageBitmap(blob)
  }
}

export const stemOf = (name: string) => name.replace(/\.[^.]+$/, '')
