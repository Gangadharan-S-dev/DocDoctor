import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import JSZip from 'jszip'
import type { OutputFile } from './download'
import { stem } from './download'

export type ImgFormat = 'image/jpeg' | 'image/png' | 'image/webp'
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

export async function loadBitmap(file: File): Promise<ImageBitmap> {
  return createImageBitmap(file)
}

function canvas(w: number, h: number) {
  const c = document.createElement('canvas')
  c.width = Math.max(1, Math.round(w))
  c.height = Math.max(1, Math.round(h))
  return c
}

function encode(c: HTMLCanvasElement, type: ImgFormat, quality: number): Promise<Blob> {
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error('Image encoding failed in this browser.'))), type, quality))
}

function drawBase(bmp: ImageBitmap, w: number, h: number) {
  const c = canvas(w, h)
  const ctx = c.getContext('2d')!
  ctx.drawImage(bmp, 0, 0, c.width, c.height)
  return { c, ctx }
}

/** Fill transparent pixels for JPEG output or canvas padding. */
function flatten(c: HTMLCanvasElement, bg = '#ffffff') {
  const out = canvas(c.width, c.height)
  const ctx = out.getContext('2d')!
  ctx.fillStyle = bg
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.drawImage(c, 0, 0)
  return out
}

/** Clear low-order color noise bits so DEFLATE achieves tight PNG compression. */
function quantizeCanvas(c: HTMLCanvasElement) {
  const ctx = c.getContext('2d')
  if (!ctx) return
  try {
    const imgData = ctx.getImageData(0, 0, c.width, c.height)
    const data = imgData.data
    for (let i = 0; i < data.length; i += 4) {
      data[i] = data[i] & 0xf8
      data[i + 1] = data[i + 1] & 0xf8
      data[i + 2] = data[i + 2] & 0xf8
    }
    ctx.putImageData(imgData, 0, 0)
  } catch {
    // Ignore context or security restriction
  }
}

export interface CompressOpts {
  quality: number
  format: 'keep' | ImgFormat
  maxEdge?: number
  targetSizeKB?: number
}

export async function compressImage(file: File, opts: CompressOpts): Promise<OutputFile> {
  const bmp = await loadBitmap(file)
  let w = bmp.width, h = bmp.height
  if (opts.maxEdge && Math.max(w, h) > opts.maxEdge) {
    const s = opts.maxEdge / Math.max(w, h)
    w = Math.max(1, Math.round(w * s)); h = Math.max(1, Math.round(h * s))
  }
  let { c } = drawBase(bmp, w, h)
  bmp.close()
  const type: ImgFormat = opts.format === 'keep'
    ? (file.type === 'image/png' || file.type === 'image/webp' ? file.type : 'image/jpeg')
    : opts.format
  if (type === 'image/jpeg') c = flatten(c)
  else if (type === 'image/png') quantizeCanvas(c)

  const quality = opts.quality
  let blob = await encode(c, type, quality)

  // Target size adaptive loop: aggressively adjusts quality and downsamples until under target
  if (opts.targetSizeKB && opts.targetSizeKB > 0) {
    const targetBytes = opts.targetSizeKB * 1024
    let attempts = 0
    let currentCanvas = c
    let curQuality = quality
    while (blob.size > targetBytes && attempts < 6) {
      attempts++
      if (type !== 'image/png' && curQuality > 0.35) {
        curQuality = Math.max(0.15, curQuality - 0.18)
      } else {
        const nw = Math.max(160, Math.round(currentCanvas.width * 0.75))
        const nh = Math.max(160, Math.round(currentCanvas.height * 0.75))
        if (nw === currentCanvas.width && nh === currentCanvas.height) break
        const sc = canvas(nw, nh)
        const sctx = sc.getContext('2d')!
        sctx.drawImage(currentCanvas, 0, 0, nw, nh)
        currentCanvas = type === 'image/jpeg' ? flatten(sc) : sc
        if (type === 'image/png') quantizeCanvas(currentCanvas)
      }
      blob = await encode(currentCanvas, type, curQuality)
    }
  }

  // Size guarantee & adaptive compression: If compressed blob is larger than original file
  if (!opts.targetSizeKB && blob.size >= file.size) {
    if (type !== 'image/png' && quality > 0.40) {
      const retryQuality = Math.max(0.35, quality * 0.75)
      const retryBlob = await encode(c, type, retryQuality)
      if (retryBlob.size < file.size) {
        blob = retryBlob
      } else {
        blob = file
      }
    } else {
      blob = file
    }
  }

  return { name: `${stem(file.name)}-compressed.${EXT[type]}`, blob }
}

export interface ResizeOpts {
  mode?: 'stretch' | 'contain' | 'cover'
  smoothing?: 'high' | 'pixelated'
  bgColor?: string
}

export async function resizeImage(
  file: File,
  width: number,
  height: number,
  format: 'keep' | ImgFormat,
  opts?: ResizeOpts,
): Promise<OutputFile> {
  const bmp = await loadBitmap(file)
  const mode = opts?.mode || 'stretch'
  const c = canvas(width, height)
  const ctx = c.getContext('2d')!

  if (opts?.smoothing === 'pixelated') {
    ctx.imageSmoothingEnabled = false
  } else {
    ctx.imageSmoothingEnabled = true
    ctx.imageSmoothingQuality = 'high'
  }

  const isJpg = format === 'image/jpeg' || (format === 'keep' && file.type !== 'image/png' && file.type !== 'image/webp')
  const bg = opts?.bgColor || (isJpg ? '#ffffff' : 'transparent')
  if (bg !== 'transparent') {
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, width, height)
  }

  if (mode === 'stretch') {
    ctx.drawImage(bmp, 0, 0, width, height)
  } else if (mode === 'contain') {
    const scale = Math.min(width / bmp.width, height / bmp.height)
    const dw = Math.round(bmp.width * scale)
    const dh = Math.round(bmp.height * scale)
    const dx = Math.round((width - dw) / 2)
    const dy = Math.round((height - dh) / 2)
    ctx.drawImage(bmp, dx, dy, dw, dh)
  } else if (mode === 'cover') {
    const scale = Math.max(width / bmp.width, height / bmp.height)
    const sw = Math.round(width / scale)
    const sh = Math.round(height / scale)
    const sx = Math.round((bmp.width - sw) / 2)
    const sy = Math.round((bmp.height - sh) / 2)
    ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, width, height)
  }

  bmp.close()
  const type: ImgFormat = format === 'keep' ? (file.type === 'image/png' || file.type === 'image/webp' ? file.type : 'image/jpeg') : format
  const out = type === 'image/jpeg' ? flatten(c, bg === 'transparent' ? '#ffffff' : bg) : c
  const blob = await encode(out, type, 0.92)
  return { name: `${stem(file.name)}-${width}x${height}.${EXT[type]}`, blob }
}

export async function estimateCompressedSize(file: File, opts: CompressOpts): Promise<number> {
  const out = await compressImage(file, opts)
  return out.blob.size
}

export interface PerspectivePoint {
  x: number
  y: number
}

export interface PerspectiveQuad {
  tl: PerspectivePoint
  tr: PerspectivePoint
  br: PerspectivePoint
  bl: PerspectivePoint
}

export type ScanEnhanceMode = 'none' | 'magic-color' | 'bw-document'

export interface CropOpts {
  circular?: boolean
  cornerRadius?: number
  cropMode?: 'rect' | 'perspective'
  perspectiveQuad?: PerspectiveQuad
  perspectiveAspect?: number | null
  scanEnhance?: ScanEnhanceMode
}

/**
 * Compute target output pixel dimensions (width, height) from a 4-corner perspective quad
 * in percentage coordinates (0..100) and source pixel dimensions.
 */
export function computePerspectiveDimensions(
  srcW: number,
  srcH: number,
  quad: PerspectiveQuad,
  forcedAspect?: number | null,
): { width: number; height: number; quadPx: [PerspectivePoint, PerspectivePoint, PerspectivePoint, PerspectivePoint] } {
  const p0 = { x: (quad.tl.x / 100) * srcW, y: (quad.tl.y / 100) * srcH }
  const p1 = { x: (quad.tr.x / 100) * srcW, y: (quad.tr.y / 100) * srcH }
  const p2 = { x: (quad.br.x / 100) * srcW, y: (quad.br.y / 100) * srcH }
  const p3 = { x: (quad.bl.x / 100) * srcW, y: (quad.bl.y / 100) * srcH }

  const topW = Math.hypot(p1.x - p0.x, p1.y - p0.y)
  const bottomW = Math.hypot(p2.x - p3.x, p2.y - p3.y)
  const leftH = Math.hypot(p3.x - p0.x, p3.y - p0.y)
  const rightH = Math.hypot(p2.x - p1.x, p2.y - p1.y)

  const width = Math.max(1, Math.round(Math.max(topW, bottomW)))
  let height = Math.max(1, Math.round(Math.max(leftH, rightH)))
  if (forcedAspect && forcedAspect > 0) {
    height = Math.max(1, Math.round(width / forcedAspect))
  }
  return { width, height, quadPx: [p0, p1, p2, p3] }
}

/**
 * Compute closed-form 8-DOF projective homography coefficients mapping unit square (u,v) in [0,1]^2
 * to a arbitrary 4-corner quadrilateral [p0 (TL), p1 (TR), p2 (BR), p3 (BL)].
 */
export function computeUnitSquareToQuadHomography(
  p0: PerspectivePoint,
  p1: PerspectivePoint,
  p2: PerspectivePoint,
  p3: PerspectivePoint,
) {
  const dx1 = p1.x - p2.x
  const dy1 = p1.y - p2.y
  const dx2 = p3.x - p2.x
  const dy2 = p3.y - p2.y
  const sx = p0.x - p1.x + p2.x - p3.x
  const sy = p0.y - p1.y + p2.y - p3.y

  const det = dx1 * dy2 - dx2 * dy1
  if (Math.abs(det) < 1e-9) {
    return null
  }
  const g = (sx * dy2 - sy * dx2) / det
  const h = (dx1 * sy - dy1 * sx) / det
  const a = p1.x - p0.x + g * p1.x
  const b = p3.x - p0.x + h * p3.x
  const c = p0.x
  const d = p1.y - p0.y + g * p1.y
  const e = p3.y - p0.y + h * p3.y
  const f = p0.y
  return { a, b, c, d, e, f, g, h }
}

/**
 * Warp a 4-point quadrilateral region from `srcData` into a rectified `dstW x dstH` ImageData
 * using projective homography and bilinear pixel interpolation.
 */
export function warpPerspectiveImageData(
  srcData: ImageData,
  dstW: number,
  dstH: number,
  quadPx: [PerspectivePoint, PerspectivePoint, PerspectivePoint, PerspectivePoint],
): ImageData {
  const [p0, p1, p2, p3] = quadPx
  const H = computeUnitSquareToQuadHomography(p0, p1, p2, p3)
  const out = new ImageData(dstW, dstH)
  const src = srcData.data
  const dst = out.data
  const sw = srcData.width
  const sh = srcData.height
  const maxX = sw - 1
  const maxY = sh - 1
  const invW = dstW > 1 ? 1 / (dstW - 1) : 0
  const invH = dstH > 1 ? 1 / (dstH - 1) : 0

  for (let dy = 0; dy < dstH; dy++) {
    const v = dy * invH
    for (let dx = 0; dx < dstW; dx++) {
      const u = dx * invW
      let sx: number
      let sy: number
      if (H) {
        const denom = H.g * u + H.h * v + 1
        sx = (H.a * u + H.b * v + H.c) / denom
        sy = (H.d * u + H.e * v + H.f) / denom
      } else {
        // Bilinear fallback if degenerate quad
        const topX = p0.x + (p1.x - p0.x) * u
        const topY = p0.y + (p1.y - p0.y) * u
        const botX = p3.x + (p2.x - p3.x) * u
        const botY = p3.y + (p2.y - p3.y) * u
        sx = topX + (botX - topX) * v
        sy = topY + (botY - topY) * v
      }

      const clampedX = Math.max(0, Math.min(maxX, sx))
      const clampedY = Math.max(0, Math.min(maxY, sy))
      const x0 = Math.floor(clampedX)
      const y0 = Math.floor(clampedY)
      const x1 = Math.min(maxX, x0 + 1)
      const y1 = Math.min(maxY, y0 + 1)
      const fx = clampedX - x0
      const fy = clampedY - y0

      const w00 = (1 - fx) * (1 - fy)
      const w10 = fx * (1 - fy)
      const w01 = (1 - fx) * fy
      const w11 = fx * fy

      const i00 = (y0 * sw + x0) * 4
      const i10 = (y0 * sw + x1) * 4
      const i01 = (y1 * sw + x0) * 4
      const i11 = (y1 * sw + x1) * 4

      const di = (dy * dstW + dx) * 4
      dst[di] = Math.round(src[i00] * w00 + src[i10] * w10 + src[i01] * w01 + src[i11] * w11)
      dst[di + 1] = Math.round(src[i00 + 1] * w00 + src[i10 + 1] * w10 + src[i01 + 1] * w01 + src[i11 + 1] * w11)
      dst[di + 2] = Math.round(src[i00 + 2] * w00 + src[i10 + 2] * w10 + src[i01 + 2] * w01 + src[i11 + 2] * w11)
      dst[di + 3] = Math.round(src[i00 + 3] * w00 + src[i10 + 3] * w10 + src[i01 + 3] * w01 + src[i11 + 3] * w11)
    }
  }
  return out
}

/**
 * Optional document scan enhancement (Magic Color contrast/whitening or Crisp B&W Document threshold).
 */
export function applyScanEnhancement(imgData: ImageData, mode: ScanEnhanceMode): void {
  if (mode === 'none') return
  const d = imgData.data
  if (mode === 'magic-color') {
    for (let i = 0; i < d.length; i += 4) {
      const r = d[i], g = d[i + 1], b = d[i + 2]
      const lum = 0.299 * r + 0.587 * g + 0.114 * b
      if (lum > 195) {
        // Push paper background toward clean white
        const boost = Math.min(1, (lum - 195) / 45)
        d[i] = Math.min(255, Math.round(r + (255 - r) * boost * 0.85))
        d[i + 1] = Math.min(255, Math.round(g + (255 - g) * boost * 0.85))
        d[i + 2] = Math.min(255, Math.round(b + (255 - b) * boost * 0.85))
      } else {
        // Deepen ink & boost saturation/contrast
        const factor = 1.28
        d[i] = Math.max(0, Math.min(255, Math.round((r - 128) * factor + 122)))
        d[i + 1] = Math.max(0, Math.min(255, Math.round((g - 128) * factor + 122)))
        d[i + 2] = Math.max(0, Math.min(255, Math.round((b - 128) * factor + 122)))
      }
    }
  } else if (mode === 'bw-document') {
    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
      // Soft high-contrast S-curve for readable text
      const v = lum > 168 ? 255 : lum < 105 ? 12 : Math.round(((lum - 105) / 63) * 243 + 12)
      d[i] = v
      d[i + 1] = v
      d[i + 2] = v
    }
  }
}

/**
 * Automatically estimate the 4 corners of a document, card, or rectangular subject in an image
 * by analyzing border background contrast and edge gradients on a downsampled buffer.
 */
export function autoDetectDocumentQuad(
  source: CanvasImageSource,
  srcW: number,
  srcH: number,
): PerspectiveQuad {
  const fallback: PerspectiveQuad = {
    tl: { x: 10, y: 10 },
    tr: { x: 90, y: 10 },
    br: { x: 90, y: 90 },
    bl: { x: 10, y: 90 },
  }
  try {
    const sampleSize = 140
    const scale = Math.min(sampleSize / Math.max(1, srcW), sampleSize / Math.max(1, srcH))
    const w = Math.max(24, Math.round(srcW * scale))
    const h = Math.max(24, Math.round(srcH * scale))
    const c = canvas(w, h)
    const ctx = c.getContext('2d')
    if (!ctx) return fallback
    ctx.drawImage(source, 0, 0, w, h)
    const { data } = ctx.getImageData(0, 0, w, h)

    // Estimate average border color around outer 2px perimeter
    let bR = 0, bG = 0, bB = 0, bCount = 0
    for (let x = 0; x < w; x++) {
      for (const y of [0, 1, h - 2, h - 1]) {
        const i = (y * w + x) * 4
        bR += data[i]; bG += data[i + 1]; bB += data[i + 2]; bCount++
      }
    }
    for (let y = 2; y < h - 2; y++) {
      for (const x of [0, 1, w - 2, w - 1]) {
        const i = (y * w + x) * 4
        bR += data[i]; bG += data[i + 1]; bB += data[i + 2]; bCount++
      }
    }
    bR /= Math.max(1, bCount)
    bG /= Math.max(1, bCount)
    bB /= Math.max(1, bCount)

    // Compute foreground/edge interest points
    const scores = new Float32Array(w * h)
    let maxScore = 0
    for (let y = 2; y < h - 2; y++) {
      for (let x = 2; x < w - 2; x++) {
        const i = (y * w + x) * 4
        const diffBg = Math.hypot(data[i] - bR, data[i + 1] - bG, data[i + 2] - bB)
        const rightI = (y * w + (x + 1)) * 4
        const downI = ((y + 1) * w + x) * 4
        const grad = Math.hypot(
          data[rightI] - data[i],
          data[downI] - data[i],
        )
        const s = diffBg * 0.75 + grad * 0.65
        scores[y * w + x] = s
        if (s > maxScore) maxScore = s
      }
    }

    if (maxScore < 28) return fallback
    const threshold = maxScore * 0.38

    let bestTL = { x: w * 0.12, y: h * 0.12, metric: Infinity }
    let bestTR = { x: w * 0.88, y: h * 0.12, metric: -Infinity }
    let bestBR = { x: w * 0.88, y: h * 0.88, metric: -Infinity }
    let bestBL = { x: w * 0.12, y: h * 0.88, metric: -Infinity }
    let activeCount = 0

    for (let y = 2; y < h - 2; y++) {
      const ny = y / h
      for (let x = 2; x < w - 2; x++) {
        if (scores[y * w + x] < threshold) continue
        activeCount++
        const nx = x / w
        if (nx + ny < bestTL.metric) bestTL = { x, y, metric: nx + ny }
        if (nx - ny > bestTR.metric) bestTR = { x, y, metric: nx - ny }
        if (nx + ny > bestBR.metric) bestBR = { x, y, metric: nx + ny }
        if (ny - nx > bestBL.metric) bestBL = { x, y, metric: ny - nx }
      }
    }

    if (activeCount < 20) return fallback

    const toPct = (pt: { x: number; y: number }) => ({
      x: Math.max(2, Math.min(98, Math.round((pt.x / (w - 1)) * 100))),
      y: Math.max(2, Math.min(98, Math.round((pt.y / (h - 1)) * 100))),
    })

    const quad: PerspectiveQuad = {
      tl: toPct(bestTL),
      tr: toPct(bestTR),
      br: toPct(bestBR),
      bl: toPct(bestBL),
    }

    // Ensure non-degenerate quad
    const topSpan = quad.tr.x - quad.tl.x
    const botSpan = quad.br.x - quad.bl.x
    const leftSpan = quad.bl.y - quad.tl.y
    const rightSpan = quad.br.y - quad.tr.y
    if (topSpan < 15 || botSpan < 15 || leftSpan < 15 || rightSpan < 15) {
      return fallback
    }
    return quad
  } catch {
    return fallback
  }
}

function clipRoundedRect(ctx: CanvasRenderingContext2D, w: number, h: number, r: number) {
  const rad = Math.min(r, w / 2, h / 2)
  ctx.beginPath()
  ctx.moveTo(rad, 0)
  ctx.lineTo(w - rad, 0)
  ctx.quadraticCurveTo(w, 0, w, rad)
  ctx.lineTo(w, h - rad)
  ctx.quadraticCurveTo(w, h, w - rad, h)
  ctx.lineTo(rad, h)
  ctx.quadraticCurveTo(0, h, 0, h - rad)
  ctx.lineTo(0, rad)
  ctx.quadraticCurveTo(0, 0, rad, 0)
  ctx.closePath()
  ctx.clip()
}

export async function cropImage(
  file: File,
  xPct: number,
  yPct: number,
  wPct: number,
  hPct: number,
  opts?: CropOpts,
): Promise<OutputFile> {
  const bmp = await loadBitmap(file)
  const hasRounded = !opts?.circular && (opts?.cornerRadius ?? 0) > 0
  let c: HTMLCanvasElement

  if (opts?.cropMode === 'perspective' && opts.perspectiveQuad) {
    const { width: dstW, height: dstH, quadPx } = computePerspectiveDimensions(
      bmp.width,
      bmp.height,
      opts.perspectiveQuad,
      opts.perspectiveAspect,
    )
    const srcCanvas = canvas(bmp.width, bmp.height)
    const srcCtx = srcCanvas.getContext('2d')!
    srcCtx.drawImage(bmp, 0, 0)
    const srcData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height)
    const warpedData = warpPerspectiveImageData(srcData, dstW, dstH, quadPx)
    if (opts.scanEnhance && opts.scanEnhance !== 'none') {
      applyScanEnhancement(warpedData, opts.scanEnhance)
    }

    const rawWarped = canvas(dstW, dstH)
    rawWarped.getContext('2d')!.putImageData(warpedData, 0, 0)

    c = canvas(dstW, dstH)
    const ctx = c.getContext('2d')!
    if (opts.circular) {
      ctx.beginPath()
      ctx.arc(c.width / 2, c.height / 2, Math.min(c.width, c.height) / 2, 0, Math.PI * 2)
      ctx.clip()
    } else if (hasRounded) {
      const rPx = ((opts.cornerRadius ?? 0) / 100) * Math.min(c.width, c.height)
      clipRoundedRect(ctx, c.width, c.height, rPx)
    }
    ctx.drawImage(rawWarped, 0, 0)
  } else {
    const sx = (xPct / 100) * bmp.width, sy = (yPct / 100) * bmp.height
    const sw = (wPct / 100) * bmp.width, sh = (hPct / 100) * bmp.height
    c = canvas(sw, sh)
    const ctx = c.getContext('2d')!

    if (opts?.circular) {
      ctx.beginPath()
      ctx.arc(c.width / 2, c.height / 2, Math.min(c.width, c.height) / 2, 0, Math.PI * 2)
      ctx.clip()
    } else if (hasRounded) {
      const rPx = ((opts?.cornerRadius ?? 0) / 100) * Math.min(c.width, c.height)
      clipRoundedRect(ctx, c.width, c.height, rPx)
    }

    ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, c.width, c.height)
    if (opts?.scanEnhance && opts.scanEnhance !== 'none') {
      const imgData = ctx.getImageData(0, 0, c.width, c.height)
      applyScanEnhancement(imgData, opts.scanEnhance)
      ctx.putImageData(imgData, 0, 0)
    }
  }

  bmp.close()
  const needsAlpha = Boolean(opts?.circular || hasRounded)
  const type: ImgFormat = needsAlpha ? 'image/png' : (file.type === 'image/png' ? 'image/png' : 'image/jpeg')
  const blob = await encode(type === 'image/jpeg' ? flatten(c) : c, type, 0.92)
  return { name: `${stem(file.name)}-cropped.${EXT[type]}`, blob }
}

export interface ConvertOpts {
  bgColor?: string
}

export async function convertImage(
  file: File,
  type: ImgFormat,
  quality = 0.92,
  opts?: ConvertOpts,
): Promise<OutputFile> {
  const bmp = await loadBitmap(file)
  let { c } = drawBase(bmp, bmp.width, bmp.height)
  bmp.close()
  if (type === 'image/jpeg') c = flatten(c, opts?.bgColor || '#ffffff')
  const blob = await encode(c, type, quality)
  return { name: `${stem(file.name)}.${EXT[type]}`, blob }
}

export interface RotateOpts {
  bgColor?: string
}

export async function rotateImage(file: File, deg: number, opts?: RotateOpts): Promise<OutputFile> {
  const bmp = await loadBitmap(file)
  const rad = (deg * Math.PI) / 180
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))
  const newW = Math.max(1, Math.round(bmp.width * cos + bmp.height * sin))
  const newH = Math.max(1, Math.round(bmp.width * sin + bmp.height * cos))
  const c = canvas(newW, newH)
  const ctx = c.getContext('2d')!

  const isJpg = file.type !== 'image/png' && file.type !== 'image/webp'
  const bg = opts?.bgColor || (isJpg ? '#ffffff' : 'transparent')
  if (bg !== 'transparent') {
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, newW, newH)
  }

  ctx.translate(newW / 2, newH / 2)
  ctx.rotate(rad)
  ctx.drawImage(bmp, -bmp.width / 2, -bmp.height / 2)
  bmp.close()

  const type: ImgFormat = file.type === 'image/png' ? 'image/png' : file.type === 'image/webp' ? 'image/webp' : 'image/jpeg'
  const blob = await encode(type === 'image/jpeg' ? flatten(c, bg === 'transparent' ? '#ffffff' : bg) : c, type, 0.92)
  return { name: `${stem(file.name)}-rotated.${EXT[type]}`, blob }
}

export async function flipImage(file: File, horizontal: boolean, vertical: boolean): Promise<OutputFile> {
  const bmp = await loadBitmap(file)
  const c = canvas(bmp.width, bmp.height)
  const ctx = c.getContext('2d')!
  ctx.translate(horizontal ? c.width : 0, vertical ? c.height : 0)
  ctx.scale(horizontal ? -1 : 1, vertical ? -1 : 1)
  ctx.drawImage(bmp, 0, 0)
  bmp.close()
  const type: ImgFormat = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
  const blob = await encode(type === 'image/jpeg' ? flatten(c) : c, type, 0.92)
  return { name: `${stem(file.name)}-flipped.${EXT[type]}`, blob }
}

export interface WatermarkOpts {
  text: string
  opacity: number
  fontSize: number
  position: 'bottom-right' | 'center' | 'tile' | 'top-left' | 'bottom-left'
  logoUrl?: string | null
  colorHex?: string
  angle?: number
  logoScale?: number
}

export async function watermarkImage(file: File, opts: WatermarkOpts): Promise<OutputFile> {
  const bmp = await loadBitmap(file)
  const { c, ctx } = drawBase(bmp, bmp.width, bmp.height)
  bmp.close()
  ctx.save()
  ctx.globalAlpha = opts.opacity

  if (opts.logoUrl) {
    const logoImg = new Image()
    logoImg.src = opts.logoUrl
    await new Promise((res, rej) => {
      logoImg.onload = res
      logoImg.onerror = rej
    })
    const maxW = c.width * (opts.logoScale ?? 0.28)
    const scale = Math.min(maxW / logoImg.width, 1)
    const lw = logoImg.width * scale
    const lh = logoImg.height * scale
    let lx = c.width - lw - 24
    let ly = c.height - lh - 24
    if (opts.position === 'center') {
      lx = (c.width - lw) / 2
      ly = (c.height - lh) / 2
    } else if (opts.position === 'top-left') {
      lx = 24
      ly = 24
    } else if (opts.position === 'bottom-left') {
      lx = 24
      ly = c.height - lh - 24
    } else if (opts.position === 'tile') {
      for (let y = 0; y < c.height; y += lh + 80) {
        for (let x = 0; x < c.width; x += lw + 80) {
          ctx.drawImage(logoImg, x, y, lw, lh)
        }
      }
    }
    if (opts.position !== 'tile') {
      ctx.drawImage(logoImg, lx, ly, lw, lh)
    }
  } else {
    ctx.fillStyle = opts.colorHex || '#ffffff'
    ctx.strokeStyle = 'rgba(0,0,0,.35)'
    ctx.font = `700 ${opts.fontSize}px Manrope, sans-serif`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    const draw = (x: number, y: number) => { ctx.strokeText(opts.text, x, y); ctx.fillText(opts.text, x, y) }
    const rot = opts.angle !== undefined ? (opts.angle * Math.PI) / 180 : (opts.position === 'tile' ? -0.35 : 0)

    if (opts.position === 'tile') {
      ctx.rotate(rot)
      for (let y = -c.height; y < c.height * 2; y += opts.fontSize * 5) {
        for (let x = -c.width; x < c.width * 2; x += ctx.measureText(opts.text).width + 120) draw(x, y)
      }
    } else if (opts.position === 'center') {
      if (rot !== 0) {
        ctx.translate(c.width / 2, c.height / 2)
        ctx.rotate(rot)
        draw(0, 0)
      } else {
        draw(c.width / 2, c.height / 2)
      }
    } else if (opts.position === 'top-left') {
      ctx.textAlign = 'left'
      draw(24, 24 + opts.fontSize / 2)
    } else if (opts.position === 'bottom-left') {
      ctx.textAlign = 'left'
      draw(24, c.height - 24 - opts.fontSize / 2)
    } else {
      ctx.textAlign = 'right'
      const x = c.width - 24
      const y = c.height - 24 - opts.fontSize / 2
      draw(x, y)
    }
  }

  ctx.restore()
  const type: ImgFormat = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
  const blob = await encode(type === 'image/jpeg' ? flatten(c) : c, type, 0.92)
  return { name: `${stem(file.name)}-watermarked.${EXT[type]}`, blob }
}

export interface ImagesToPdfOpts {
  pageSize?: 'fit' | 'a4' | 'letter'
  margin?: 'none' | 'compact' | 'standard'
  orientation?: 'auto' | 'portrait' | 'landscape'
  layout?: '1-up' | '2-up' | '4-up'
  bgColor?: string
  addCaptions?: boolean
}

export async function imagesToPdf(
  files: File[],
  pageSize: 'fit' | 'a4' | 'letter' = 'fit',
  opts?: ImagesToPdfOpts,
): Promise<OutputFile> {
  const doc = await PDFDocument.create()
  const effectivePageSize = opts?.pageSize || pageSize
  const marginSize = opts?.margin === 'compact' ? 18 : opts?.margin === 'none' ? 0 : 36
  const layout = opts?.layout ?? '1-up'
  const captionFont = opts?.addCaptions ? await doc.embedFont(StandardFonts.Helvetica) : null
  const hexBg = (opts?.bgColor || '#ffffff').replace('#', '').padEnd(6, 'f')
  const bgRgb = rgb(
    parseInt(hexBg.slice(0, 2), 16) / 255,
    parseInt(hexBg.slice(2, 4), 16) / 255,
    parseInt(hexBg.slice(4, 6), 16) / 255,
  )
  const hasCustomBg = Boolean(opts?.bgColor && opts.bgColor.toLowerCase() !== '#ffffff')

  const embedOne = async (f: File) => {
    const bytes = new Uint8Array(await f.arrayBuffer())
    const isPng = f.type === 'image/png'
    return isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes).catch(async () => {
      const bmp = await loadBitmap(f)
      const { c } = drawBase(bmp, bmp.width, bmp.height)
      bmp.close()
      const png = await encode(c, 'image/png', 1)
      return doc.embedPng(new Uint8Array(await png.arrayBuffer()))
    })
  }

  if (layout === '2-up' || layout === '4-up') {
    const perPage = layout === '4-up' ? 4 : 2
    const baseW = effectivePageSize === 'letter' ? 612 : 595.28
    const baseH = effectivePageSize === 'letter' ? 792 : 841.89
    const isLandscape = opts?.orientation === 'landscape'
    const pageW = isLandscape ? baseH : baseW
    const pageH = isLandscape ? baseW : baseH
    const pad = Math.max(18, marginSize)
    const gap = 16
    const cols = layout === '4-up' ? 2 : (isLandscape ? 2 : 1)
    const rows = layout === '4-up' ? 2 : (isLandscape ? 1 : 2)
    const cellW = (pageW - pad * 2 - gap * (cols - 1)) / cols
    const cellH = (pageH - pad * 2 - gap * (rows - 1)) / rows

    for (let i = 0; i < files.length; i += perPage) {
      const page = doc.addPage([pageW, pageH])
      if (hasCustomBg) {
        page.drawRectangle({ x: 0, y: 0, width: pageW, height: pageH, color: bgRgb })
      }
      const chunk = files.slice(i, i + perPage)
      for (let j = 0; j < chunk.length; j++) {
        const img = await embedOne(chunk[j])
        const colIdx = j % cols
        const rowIdx = Math.floor(j / cols)
        const cellX = pad + colIdx * (cellW + gap)
        const cellTopY = pageH - pad - rowIdx * (cellH + gap)
        const capH = captionFont ? 14 : 0
        const availH = Math.max(20, cellH - capH)
        const s = Math.min(cellW / img.width, availH / img.height)
        const drawW = img.width * s
        const drawH = img.height * s
        const dx = cellX + (cellW - drawW) / 2
        const dy = cellTopY - cellH + capH + (availH - drawH) / 2
        page.drawImage(img, { x: dx, y: dy, width: drawW, height: drawH })
        if (captionFont) {
          const label = stem(chunk[j].name).replace(/[^\x20-\x7E]/g, '').slice(0, 36) || `Image ${i + j + 1}`
          const lw = captionFont.widthOfTextAtSize(label, 8.5)
          page.drawText(label, {
            x: cellX + Math.max(0, (cellW - lw) / 2),
            y: cellTopY - cellH + 2,
            size: 8.5,
            font: captionFont,
            color: rgb(0.35, 0.4, 0.48),
          })
        }
      }
    }
  } else {
    for (let idx = 0; idx < files.length; idx++) {
      const f = files[idx]
      const img = await embedOne(f)

      if (effectivePageSize === 'fit') {
        const pw = img.width * 0.75
        const ph = img.height * 0.75 + (captionFont ? 20 : 0)
        const page = doc.addPage([pw, ph])
        if (hasCustomBg) page.drawRectangle({ x: 0, y: 0, width: pw, height: ph, color: bgRgb })
        page.drawImage(img, { x: 0, y: captionFont ? 20 : 0, width: img.width * 0.75, height: img.height * 0.75 })
        if (captionFont) {
          const label = `${idx + 1}. ${stem(f.name).replace(/[^\x20-\x7E]/g, '').slice(0, 48)}`
          page.drawText(label, { x: 12, y: 6, size: 9, font: captionFont, color: rgb(0.35, 0.4, 0.48) })
        }
      } else {
        let pageW = effectivePageSize === 'letter' ? 612 : 595.28
        let pageH = effectivePageSize === 'letter' ? 792 : 841.89

        const isImgLandscape = img.width > img.height
        const forceOrientation = opts?.orientation || 'auto'
        if (forceOrientation === 'landscape' || (forceOrientation === 'auto' && isImgLandscape)) {
          const tmp = pageW
          pageW = pageH
          pageH = tmp
        }

        const page = doc.addPage([pageW, pageH])
        if (hasCustomBg) page.drawRectangle({ x: 0, y: 0, width: pageW, height: pageH, color: bgRgb })
        const capH = captionFont ? 18 : 0
        const availW = pageW - marginSize * 2
        const availH = pageH - marginSize * 2 - capH
        const s = Math.min(availW / img.width, availH / img.height)
        const drawW = img.width * s
        const drawH = img.height * s
        page.drawImage(img, {
          x: (pageW - drawW) / 2,
          y: marginSize + capH + (availH - drawH) / 2,
          width: drawW,
          height: drawH,
        })
        if (captionFont) {
          const label = `${idx + 1}. ${stem(f.name).replace(/[^\x20-\x7E]/g, '').slice(0, 50)}`
          const lw = captionFont.widthOfTextAtSize(label, 9)
          page.drawText(label, {
            x: Math.max(marginSize, (pageW - lw) / 2),
            y: Math.max(10, marginSize / 2 + 2),
            size: 9,
            font: captionFont,
            color: rgb(0.35, 0.4, 0.48),
          })
        }
      }
    }
  }
  const bytes = await doc.save()
  return {
    name: files.length === 1 ? `${stem(files[0].name)}.pdf` : 'images.pdf',
    blob: new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' }),
  }
}

export interface IcoOpts {
  fitMode?: 'pad' | 'cover' | 'stretch'
  exportWebKit?: boolean
}

function drawSquareIcon(bmp: ImageBitmap, size: number, fitMode: 'pad' | 'cover' | 'stretch' = 'pad'): HTMLCanvasElement {
  const c = canvas(size, size)
  const ctx = c.getContext('2d')!
  ctx.clearRect(0, 0, size, size)
  ctx.imageSmoothingEnabled = true
  ctx.imageSmoothingQuality = 'high'

  if (fitMode === 'stretch' || bmp.width === bmp.height) {
    ctx.drawImage(bmp, 0, 0, size, size)
  } else if (fitMode === 'cover') {
    const scale = Math.max(size / bmp.width, size / bmp.height)
    const sw = Math.round(size / scale)
    const sh = Math.round(size / scale)
    const sx = Math.round((bmp.width - sw) / 2)
    const sy = Math.round((bmp.height - sh) / 2)
    ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, size, size)
  } else {
    const scale = Math.min(size / bmp.width, size / bmp.height)
    const dw = Math.round(bmp.width * scale)
    const dh = Math.round(bmp.height * scale)
    const dx = Math.round((size - dw) / 2)
    const dy = Math.round((size - dh) / 2)
    ctx.drawImage(bmp, dx, dy, dw, dh)
  }
  return c
}

/** Build a real multi-size ICO (PNG-compressed entries, Vista+ format), or a full Web Favicon Kit ZIP. */
export async function imageToIco(file: File, sizes: number[], opts?: IcoOpts): Promise<OutputFile> {
  const bmp = await loadBitmap(file)
  const fitMode = opts?.fitMode ?? 'pad'
  const entries: { size: number; png: Uint8Array }[] = []
  for (const s of sizes) {
    const c = drawSquareIcon(bmp, s, fitMode)
    const blob = await encode(c, 'image/png', 1)
    entries.push({ size: s, png: new Uint8Array(await blob.arrayBuffer()) })
  }

  const header = 6 + entries.length * 16
  const total = header + entries.reduce((n, e) => n + e.png.length, 0)
  const out = new DataView(new ArrayBuffer(total))
  out.setUint16(0, 0, true)
  out.setUint16(2, 1, true)
  out.setUint16(4, entries.length, true)
  let offset = header
  entries.forEach((e, i) => {
    const b = 6 + i * 16
    out.setUint8(b, e.size >= 256 ? 0 : e.size)
    out.setUint8(b + 1, e.size >= 256 ? 0 : e.size)
    out.setUint16(b + 4, 1, true)
    out.setUint16(b + 6, 32, true)
    out.setUint32(b + 8, e.png.length, true)
    out.setUint32(b + 12, offset, true)
    new Uint8Array(out.buffer).set(e.png, offset)
    offset += e.png.length
  })

  if (opts?.exportWebKit) {
    const zip = new JSZip()
    zip.file('favicon.ico', new Uint8Array(out.buffer))
    const kitSizes: [string, number][] = [
      ['favicon-32x32.png', 32],
      ['apple-touch-icon.png', 180],
      ['icon-192.png', 192],
      ['icon-512.png', 512],
    ]
    for (const [fname, sz] of kitSizes) {
      const c = drawSquareIcon(bmp, sz, fitMode)
      const b = await encode(c, 'image/png', 1)
      zip.file(fname, new Uint8Array(await b.arrayBuffer()))
    }
    bmp.close()
    zip.file('site.webmanifest', JSON.stringify({
      name: stem(file.name),
      short_name: stem(file.name),
      icons: [
        { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
        { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
      ],
      theme_color: '#ffffff',
      background_color: '#ffffff',
      display: 'standalone',
    }, null, 2))
    zip.file('head-tags.html', `<!-- Paste inside your <head> -->\n<link rel="icon" href="/favicon.ico" sizes="any">\n<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">\n<link rel="apple-touch-icon" href="/apple-touch-icon.png">\n<link rel="manifest" href="/site.webmanifest">\n`)
    const zipBlob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
    return { name: `${stem(file.name)}-favicon-kit.zip`, blob: zipBlob }
  }

  bmp.close()
  return { name: `${stem(file.name)}.ico`, blob: new Blob([out.buffer], { type: 'image/x-icon' }) }
}

export interface ExifData {
  make?: string
  model?: string
  software?: string
  dateTimeOriginal?: string
  exposureTime?: string
  fNumber?: string
  iso?: number
  focalLength?: string
  gpsLatitude?: number
  gpsLongitude?: number
  gpsAltitude?: number
}

function parseTiffHeader(view: DataView, tiffStart: number, maxByte: number): ExifData {
  const exif: ExifData = {}
  if (tiffStart + 8 > maxByte) return exif

  const endian = view.getUint16(tiffStart, false)
  const isLittle = endian === 0x4949
  if (endian !== 0x4949 && endian !== 0x4d4d) return exif
  if (view.getUint16(tiffStart + 2, isLittle) !== 0x002a) return exif

  const ifd0Offset = view.getUint32(tiffStart + 4, isLittle)
  const ifdOffset = tiffStart + ifd0Offset

  const readString = (valOffset: number, count: number): string => {
    let str = ''
    for (let i = 0; i < count; i++) {
      const c = view.getUint8(valOffset + i)
      if (c === 0) break
      str += String.fromCharCode(c)
    }
    return str.trim()
  }

  const readRational = (valOffset: number): number => {
    const num = view.getUint32(valOffset, isLittle)
    const den = view.getUint32(valOffset + 4, isLittle)
    return den === 0 ? 0 : num / den
  }

  let exifSubIfdOffset = 0
  let gpsSubIfdOffset = 0

  const readIfdEntries = (offset: number, isExifSub = false) => {
    if (offset + 2 > maxByte) return
    const numEntries = view.getUint16(offset, isLittle)
    let p = offset + 2

    for (let i = 0; i < numEntries && p + 12 <= maxByte; i++, p += 12) {
      const tag = view.getUint16(p, isLittle)
      const type = view.getUint16(p + 2, isLittle)
      const count = view.getUint32(p + 4, isLittle)
      const valOffsetOrVal = view.getUint32(p + 8, isLittle)
      const actualOffset = count > 4 || type === 5 || type === 10 ? tiffStart + valOffsetOrVal : p + 8

      if (actualOffset < tiffStart || actualOffset > maxByte) continue

      if (!isExifSub) {
        if (tag === 0x010f) exif.make = readString(actualOffset, count)
        else if (tag === 0x0110) exif.model = readString(actualOffset, count)
        else if (tag === 0x0131) exif.software = readString(actualOffset, count)
        else if (tag === 0x8769) exifSubIfdOffset = tiffStart + valOffsetOrVal
        else if (tag === 0x8825) gpsSubIfdOffset = tiffStart + valOffsetOrVal
      } else {
        if (tag === 0x9003 || tag === 0x9004) exif.dateTimeOriginal = readString(actualOffset, count)
        else if (tag === 0x829a) {
          const num = view.getUint32(actualOffset, isLittle)
          const den = view.getUint32(actualOffset + 4, isLittle)
          exif.exposureTime = den > 1 && num === 1 ? `1/${den}s` : `${(num / den).toFixed(3)}s`
        } else if (tag === 0x829d) {
          exif.fNumber = `f/${readRational(actualOffset).toFixed(1)}`
        } else if (tag === 0x8827) {
          exif.iso = view.getUint16(actualOffset, isLittle)
        } else if (tag === 0x920a) {
          exif.focalLength = `${readRational(actualOffset).toFixed(1)}mm`
        }
      }
    }
  }

  readIfdEntries(ifdOffset)
  if (exifSubIfdOffset) readIfdEntries(exifSubIfdOffset, true)
  if (gpsSubIfdOffset && gpsSubIfdOffset + 2 <= maxByte) {
    const numEntries = view.getUint16(gpsSubIfdOffset, isLittle)
    let p = gpsSubIfdOffset + 2
    let latRef = 'N', lonRef = 'E'
    let latParts: number[] = [], lonParts: number[] = []
    let alt: number | undefined

    for (let i = 0; i < numEntries && p + 12 <= maxByte; i++, p += 12) {
      const tag = view.getUint16(p, isLittle)
      const valOffset = tiffStart + view.getUint32(p + 8, isLittle)
      if (tag === 1) latRef = String.fromCharCode(view.getUint8(p + 8))
      else if (tag === 2 && valOffset + 24 <= maxByte) {
        latParts = [readRational(valOffset), readRational(valOffset + 8), readRational(valOffset + 16)]
      } else if (tag === 3) lonRef = String.fromCharCode(view.getUint8(p + 8))
      else if (tag === 4 && valOffset + 24 <= maxByte) {
        lonParts = [readRational(valOffset), readRational(valOffset + 8), readRational(valOffset + 16)]
      } else if (tag === 6 && valOffset + 8 <= maxByte) {
        alt = readRational(valOffset)
      }
    }

    if (latParts.length === 3 && lonParts.length === 3) {
      const lat = (latParts[0] + latParts[1] / 60 + latParts[2] / 3600) * (latRef === 'S' ? -1 : 1)
      const lon = (lonParts[0] + lonParts[1] / 60 + lonParts[2] / 3600) * (lonRef === 'W' ? -1 : 1)
      exif.gpsLatitude = Math.round(lat * 10000) / 10000
      exif.gpsLongitude = Math.round(lon * 10000) / 10000
      if (alt !== undefined) exif.gpsAltitude = Math.round(alt)
    }
  }

  return exif
}

export function parseJpegExif(buffer: ArrayBuffer): ExifData | null {
  try {
    const view = new DataView(buffer)
    if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) return null

    let offset = 2
    const maxOffset = Math.min(view.byteLength - 4, 128 * 1024)

    while (offset < maxOffset) {
      if (view.getUint8(offset) !== 0xff) break
      const marker = view.getUint8(offset + 1)
      if (marker === 0xda || marker === 0xd9) break
      const len = view.getUint16(offset + 2, false)
      if (len < 2 || offset + 2 + len > view.byteLength) break

      if (marker === 0xe1 && len >= 8) {
        const exifHeader = view.getUint32(offset + 4, false)
        const zeroWord = view.getUint16(offset + 8, false)
        if (exifHeader === 0x45786966 && zeroWord === 0x0000) {
          return parseTiffHeader(view, offset + 10, offset + 2 + len)
        }
      }
      offset += 2 + len
    }
  } catch {
    // Malformed buffer
  }
  return null
}

/** Detect whether a GIF or WebP buffer contains multiple animation frames. */
export function detectAnimatedImage(buffer: ArrayBuffer): boolean {
  const bytes = new Uint8Array(buffer)
  if (bytes.length < 16) return false
  // GIF87a / GIF89a: count Graphic Control Extension blocks (0x21 0xF9 0x04)
  if (bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    let frames = 0
    for (let i = 6; i < bytes.length - 3; i++) {
      if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9 && bytes[i + 2] === 0x04) {
        frames++
        if (frames > 1) return true
      }
    }
    return false
  }
  // RIFF....WEBP: check VP8X animation flag (bit 1 at offset 20)
  if (
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    if (bytes[12] === 0x56 && bytes[13] === 0x50 && bytes[14] === 0x38 && bytes[15] === 0x58 && bytes.length > 20) {
      return (bytes[20] & 0x02) !== 0
    }
  }
  return false
}

export interface ImageMeta {
  width: number
  height: number
  type: string
  size: number
  name: string
  exif?: ExifData | null
  animated?: boolean
}

export async function imageMetadata(file: File): Promise<ImageMeta> {
  const bmp = await loadBitmap(file)
  const buf = await file.slice(0, 131072).arrayBuffer().catch(() => new ArrayBuffer(0))
  const exif = parseJpegExif(buf)
  const animated = detectAnimatedImage(buf)
  const meta: ImageMeta = {
    width: bmp.width,
    height: bmp.height,
    type: file.type || 'unknown',
    size: file.size,
    name: file.name,
    exif,
    animated,
  }
  bmp.close()
  return meta
}

export async function stripExif(file: File): Promise<OutputFile> {
  const bmp = await loadBitmap(file)
  let { c } = drawBase(bmp, bmp.width, bmp.height)
  bmp.close()
  const type: ImgFormat = file.type === 'image/png' ? 'image/png' : file.type === 'image/webp' ? 'image/webp' : 'image/jpeg'
  if (type === 'image/jpeg') c = flatten(c)
  const blob = await encode(c, type, 0.95)
  return { name: `${stem(file.name)}-sanitized.${EXT[type]}`, blob }
}
