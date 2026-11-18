import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import type { OutputFile } from './download'
import { stem } from './download'
import {
  type AnyCanvas,
  type AnyCtx,
  type ImgFormat,
  MAX_CANVAS_PIXELS,
  clampDims,
  ctx2d,
  decodeBitmap,
  drawScaled,
  extFor,
  flattenOnto,
  formatOutputName,
  makeCanvas,
  pickOutputType,
  stemOf,
} from './imageCore'
import { type EncoderPreference, encodeCanvasSmart, encodePngQuantized } from './codecs'

export { type ImgFormat, MAX_CANVAS_PIXELS, clampDims, formatOutputName }

export async function loadBitmap(file: Blob): Promise<ImageBitmap> {
  return decodeBitmap(file)
}

export interface CompressOpts {
  quality: number
  format: 'keep' | ImgFormat
  maxEdge?: number
  targetSizeKB?: number
  targetMode?: 'max' | 'range'
  minSizeKB?: number
  encoder?: EncoderPreference
  oxipng?: boolean
  width?: number
  height?: number
}

export interface TargetSizePlanResult<T> {
  item: T
  size: number
  quality: number
}

/**
 * Pure binary-search quality planner (~7 iterations) that finds the highest
 * quality producing a byte size ≤ `maxBytes` (and ≥ `minBytes` when in range
 * mode). Testable with synthetic monotonic size curves without a real canvas.
 */
export async function searchQualityForTarget<T>(
  encodeAtQuality: (q: number) => Promise<{ item: T; size: number }>,
  opts: {
    maxBytes: number
    minBytes?: number
    minQ?: number
    maxQ?: number
    iterations?: number
  },
): Promise<TargetSizePlanResult<T> & { fits: boolean }> {
  const minQ = opts.minQ ?? 0.08
  const maxQ = opts.maxQ ?? 0.96
  const minBytes = opts.minBytes ?? 0
  const maxBytes = opts.maxBytes
  const iterations = opts.iterations ?? 7

  let lo = minQ
  let hi = maxQ
  let bestUnder: (TargetSizePlanResult<T> & { fits: boolean }) | null = null
  let smallestSeen: (TargetSizePlanResult<T> & { fits: boolean }) | null = null

  for (let i = 0; i < iterations; i++) {
    const mid = i === 0 && minBytes === 0 ? Math.min(maxQ, 0.78) : (lo + hi) / 2
    const { item, size } = await encodeAtQuality(mid)
    const entry = { item, size, quality: mid, fits: size <= maxBytes && size >= minBytes }

    if (!smallestSeen || size < smallestSeen.size) {
      smallestSeen = entry
    }

    if (size <= maxBytes) {
      if (!bestUnder || size > bestUnder.size) {
        bestUnder = entry
      }
      if (minBytes > 0 && size < minBytes) {
        // Too small — raise quality
        lo = mid
      } else if (size >= maxBytes * 0.92 && size >= minBytes) {
        // Within 8% of ceiling and above min — stop early
        return { ...entry, fits: true }
      } else {
        lo = mid
      }
    } else {
      hi = mid
    }

    if (hi - lo < 0.015) break
  }

  if (bestUnder) {
    return { ...bestUnder, fits: bestUnder.size <= maxBytes }
  }
  return smallestSeen!
}

/** Core compression operating on a Blob/File (works identically in main thread and Web Worker). */
export async function compressImageBlob(
  file: Blob,
  fileName: string,
  opts: CompressOpts,
): Promise<{ blob: Blob; outType: string; width: number; height: number }> {
  const bmp = await loadBitmap(file)
  let w = opts.width && opts.width > 0 ? opts.width : bmp.width
  let h = opts.height && opts.height > 0 ? opts.height : bmp.height
  if (!opts.width && !opts.height && opts.maxEdge && Math.max(w, h) > opts.maxEdge) {
    const s = opts.maxEdge / Math.max(w, h)
    w = Math.max(1, Math.round(w * s))
    h = Math.max(1, Math.round(h * s))
  }

  let c = drawScaled(bmp, w, h, { smoothing: 'high' })
  bmp.close()

  const reqType: ImgFormat =
    opts.format === 'keep'
      ? file.type === 'image/png' || file.type === 'image/webp' || file.type === 'image/avif'
        ? (file.type as ImgFormat)
        : 'image/jpeg'
      : opts.format

  if (reqType === 'image/jpeg') c = flattenOnto(c, '#ffffff')

  const encoderPref: EncoderPreference =
    opts.encoder ?? (reqType === 'image/jpeg' || reqType === 'image/avif' ? 'auto' : 'browser')

  const encodeCanvas = (canvas: AnyCanvas, q: number) =>
    encodeCanvasSmart(canvas, reqType, q, { encoder: encoderPref, oxipng: opts.oxipng })

  const hasTarget = Boolean(opts.targetSizeKB && opts.targetSizeKB > 0)
  const hasFixedDims = Boolean((opts.width && opts.width > 0) || (opts.height && opts.height > 0))
  const minBytes =
    opts.targetMode === 'range' && opts.minSizeKB && opts.minSizeKB > 0
      ? Math.min(opts.minSizeKB, (opts.targetSizeKB ?? opts.minSizeKB) - 1) * 1024
      : 0

  let encoded = await encodeCanvas(c, opts.quality)

  if (hasTarget) {
    const maxBytes = opts.targetSizeKB! * 1024
    let currentCanvas = c

    // Step 1: If already in range [minBytes, maxBytes], or if below minBytes, binary search quality
    const needSearch = encoded.blob.size > maxBytes || (minBytes > 0 && encoded.blob.size < minBytes)
    if (needSearch) {
      if (reqType !== 'image/png') {
        const plan = await searchQualityForTarget(
          async (q) => {
            const r = await encodeCanvas(currentCanvas, q)
            return { item: r, size: r.blob.size }
          },
          { maxBytes, minBytes, minQ: 0.08, maxQ: 0.98, iterations: 7 },
        )
        encoded = plan.item
      } else {
        // For PNG, search palette colors via quality parameter
        const plan = await searchQualityForTarget(
          async (q) => {
            const r = await encodeCanvas(currentCanvas, q)
            return { item: r, size: r.blob.size }
          },
          { maxBytes, minBytes, minQ: 0.1, maxQ: 0.95, iterations: 5 },
        )
        encoded = plan.item
      }
    }

    // Step 2: If still over target and dimensions are not locked to exact px, downscale by steps
    let scaleStep = 0
    while (encoded.blob.size > maxBytes && !hasFixedDims && scaleStep < 5) {
      scaleStep++
      const ratio = Math.max(0.55, Math.min(0.82, Math.sqrt(maxBytes / encoded.blob.size) * 0.92))
      const nw = Math.max(96, Math.round(currentCanvas.width * ratio))
      const nh = Math.max(96, Math.round(currentCanvas.height * ratio))
      if (nw === currentCanvas.width && nh === currentCanvas.height) break
      let sc = drawScaled(currentCanvas, nw, nh, { smoothing: 'high' })
      if (reqType === 'image/jpeg') sc = flattenOnto(sc, '#ffffff')
      currentCanvas = sc

      if (reqType !== 'image/png') {
        const plan = await searchQualityForTarget(
          async (q) => {
            const r = await encodeCanvas(currentCanvas, q)
            return { item: r, size: r.blob.size }
          },
          { maxBytes, minBytes, minQ: 0.12, maxQ: 0.92, iterations: 5 },
        )
        encoded = plan.item
      } else {
        encoded = await encodeCanvas(currentCanvas, 0.35)
      }
    }

    // Step 3: If in range mode and result ended up below minBytes even at max quality,
    // pad harmlessly in a comment/ancillary segment so strict government portals accept it.
    if (minBytes > 0 && encoded.blob.size < minBytes && encoded.blob.size <= maxBytes) {
      encoded = {
        ...encoded,
        blob: await padImageToMinimumSize(encoded.blob, encoded.type, Math.min(maxBytes, Math.round((minBytes + maxBytes) / 2))),
      }
    }

    return {
      blob: encoded.blob,
      outType: encoded.type,
      width: currentCanvas.width,
      height: currentCanvas.height,
    }
  }

  // Size guarantee when no target size or fixed dimensions or format conversion is requested:
  // Never return an output larger than the original file.
  const sameFormat = encoded.type === file.type || (opts.format === 'keep' && encoded.type === reqType && file.type === reqType)
  if (!hasTarget && !hasFixedDims && (!opts.maxEdge || opts.maxEdge <= 0) && sameFormat && encoded.blob.size >= file.size) {
    if (reqType !== 'image/png' && opts.quality > 0.4) {
      const retryQuality = Math.max(0.35, opts.quality * 0.75)
      const retry = await encodeCanvas(c, retryQuality)
      if (retry.blob.size < file.size) {
        encoded = retry
      } else {
        return { blob: file, outType: file.type || encoded.type, width: c.width, height: c.height }
      }
    } else {
      return { blob: file, outType: file.type || encoded.type, width: c.width, height: c.height }
    }
  }

  void fileName
  return { blob: encoded.blob, outType: encoded.type, width: c.width, height: c.height }
}

/**
 * Insert a harmless comment / ancillary segment into a JPEG, PNG, or WebP blob
 * when a strict portal requires a minimum file size (e.g. 20–50 KB) and the
 * image is already smaller even at 100% quality.
 */
async function padImageToMinimumSize(blob: Blob, type: string, targetBytes: number): Promise<Blob> {
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const needed = targetBytes - bytes.byteLength
  if (needed <= 6) return blob

  if (type === 'image/jpeg' && bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    // Insert JPEG COM (0xFFFE) segment(s) before EOI (or right after SOI)
    const segPayload = Math.min(65500, needed - 4)
    if (segPayload <= 0) return blob
    const out = new Uint8Array(bytes.length + segPayload + 4)
    out[0] = 0xff
    out[1] = 0xd8
    out[2] = 0xff
    out[3] = 0xfe
    const segLen = segPayload + 2
    out[4] = (segLen >> 8) & 0xff
    out[5] = segLen & 0xff
    out.set(bytes.subarray(2), 4 + segPayload)
    return new Blob([out], { type })
  }
  return blob
}

export async function compressImage(file: File, opts: CompressOpts): Promise<OutputFile> {
  const { blob, outType } = await compressImageBlob(file, file.name, opts)
  return { name: `${stem(file.name)}-compressed.${extFor(outType)}`, blob }
}

export interface ResizeOpts {
  mode?: 'stretch' | 'contain' | 'cover'
  smoothing?: 'high' | 'pixelated'
  bgColor?: string
}

export async function resizeImageBlob(
  file: Blob,
  width: number,
  height: number,
  format: 'keep' | ImgFormat,
  opts?: ResizeOpts,
): Promise<{ blob: Blob; outType: string; width: number; height: number }> {
  const bmp = await loadBitmap(file)
  const mode = opts?.mode || 'stretch'
  const smoothing = opts?.smoothing ?? 'high'
  const reqType: ImgFormat =
    format === 'keep' ? pickOutputType(file.type) : format
  const isJpg = reqType === 'image/jpeg'
  const bg = opts?.bgColor || (isJpg ? '#ffffff' : 'transparent')

  let c: AnyCanvas
  if (mode === 'stretch') {
    c = drawScaled(bmp, width, height, { smoothing })
    if (bg !== 'transparent' && !isJpg) {
      c = flattenOnto(c, bg)
    }
  } else if (mode === 'contain') {
    c = makeCanvas(width, height)
    const ctx = ctx2d(c)
    if (bg !== 'transparent') {
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, c.width, c.height)
    }
    const scale = Math.min(c.width / bmp.width, c.height / bmp.height)
    const dw = Math.max(1, Math.round(bmp.width * scale))
    const dh = Math.max(1, Math.round(bmp.height * scale))
    const dx = Math.round((c.width - dw) / 2)
    const dy = Math.round((c.height - dh) / 2)
    const scaled = drawScaled(bmp, dw, dh, { smoothing })
    ctx.drawImage(scaled, dx, dy)
  } else {
    const scale = Math.max(width / bmp.width, height / bmp.height)
    const sw = Math.max(1, Math.round(width / scale))
    const sh = Math.max(1, Math.round(height / scale))
    const sx = Math.round((bmp.width - sw) / 2)
    const sy = Math.round((bmp.height - sh) / 2)
    c = drawScaled(bmp, width, height, { smoothing, sx, sy, sw, sh })
  }

  bmp.close()
  const out = reqType === 'image/jpeg' ? flattenOnto(c, bg === 'transparent' ? '#ffffff' : bg) : c
  const encoded = await encodeCanvasSmart(out, reqType, 0.92)
  return { blob: encoded.blob, outType: encoded.type, width: out.width, height: out.height }
}

export async function resizeImage(
  file: File,
  width: number,
  height: number,
  format: 'keep' | ImgFormat,
  opts?: ResizeOpts,
): Promise<OutputFile> {
  const { blob, outType, width: w, height: h } = await resizeImageBlob(file, width, height, format, opts)
  return { name: `${stem(file.name)}-${w}x${h}.${extFor(outType)}`, blob }
}

/**
 * Fast compressed size estimator: samples on a downscaled canvas (≤ 0.75 MP)
 * and extrapolates by pixel ratio so dragging the quality slider stays instant
 * even on 20 MP photos.
 */
export async function estimateCompressedSize(file: File, opts: CompressOpts): Promise<number> {
  if (opts.targetSizeKB && opts.targetSizeKB > 0) {
    return Math.min(file.size, opts.targetSizeKB * 1024)
  }
  const bmp = await loadBitmap(file)
  let targetW = opts.width && opts.width > 0 ? opts.width : bmp.width
  let targetH = opts.height && opts.height > 0 ? opts.height : bmp.height
  if (!opts.width && !opts.height && opts.maxEdge && Math.max(targetW, targetH) > opts.maxEdge) {
    const s = opts.maxEdge / Math.max(targetW, targetH)
    targetW = Math.max(1, Math.round(targetW * s))
    targetH = Math.max(1, Math.round(targetH * s))
  }

  const maxSamplePixels = 600_000 // ~800×750 sample for instant feedback
  const targetPixels = targetW * targetH
  const sampleScale = targetPixels > maxSamplePixels ? Math.sqrt(maxSamplePixels / targetPixels) : 1
  const sampleW = Math.max(1, Math.round(targetW * sampleScale))
  const sampleH = Math.max(1, Math.round(targetH * sampleScale))

  let c = drawScaled(bmp, sampleW, sampleH, { smoothing: 'high' })
  bmp.close()

  const reqType: ImgFormat =
    opts.format === 'keep'
      ? file.type === 'image/png' || file.type === 'image/webp' || file.type === 'image/avif'
        ? (file.type as ImgFormat)
        : 'image/jpeg'
      : opts.format
  if (reqType === 'image/jpeg') c = flattenOnto(c, '#ffffff')

  const encoded = await encodeCanvasSmart(c, reqType, opts.quality, {
    encoder: opts.encoder === 'wasm' && sampleScale === 1 ? 'wasm' : 'browser',
  })

  // Extrapolate sublinearly (compressed image size scales ~pixels^0.82 due to header + entropy)
  const ratio = targetPixels / Math.max(1, sampleW * sampleH)
  const extrapolated = Math.round(encoded.blob.size * Math.pow(ratio, 0.85))
  const sameFormat = encoded.type === file.type
  if (!opts.maxEdge && !opts.width && !opts.height && sameFormat) {
    return Math.min(file.size, extrapolated)
  }
  return extrapolated
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

export type ScanEnhanceMode = 'none' | 'magic-color' | 'bw-document' | 'adaptive-bw'

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
 * to an arbitrary 4-corner quadrilateral [p0 (TL), p1 (TR), p2 (BR), p3 (BL)].
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
  const out =
    typeof ImageData !== 'undefined'
      ? new ImageData(dstW, dstH)
      : ({ data: new Uint8ClampedArray(dstW * dstH * 4), width: dstW, height: dstH } as ImageData)
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
 * Sauvola adaptive thresholding via integral images (sum & sum-of-squares).
 * Handles uneven shadows, phone flash hotspots, and low-contrast ink on scans.
 */
export function applySauvolaThreshold(
  imgData: { data: Uint8ClampedArray; width: number; height: number },
  opts?: { windowSize?: number; k?: number; R?: number },
): void {
  const { data: d, width: w, height: h } = imgData
  if (w <= 0 || h <= 0) return
  const minSide = Math.min(w, h)
  const rawWin = opts?.windowSize ?? Math.max(7, Math.round(minSide / 16))
  const half = Math.max(3, Math.floor(rawWin / 2))
  const k = opts?.k ?? 0.2
  const R = opts?.R ?? 128

  const stride = w + 1
  const sum = new Float64Array((w + 1) * (h + 1))
  const sqSum = new Float64Array((w + 1) * (h + 1))
  const gray = new Uint8Array(w * h)

  for (let y = 0; y < h; y++) {
    let rowSum = 0
    let rowSq = 0
    const rowOff = (y + 1) * stride
    const prevOff = y * stride
    for (let x = 0; x < w; x++) {
      const idx = y * w + x
      const p = idx * 4
      const lum = Math.round(0.299 * d[p] + 0.587 * d[p + 1] + 0.114 * d[p + 2])
      gray[idx] = lum
      rowSum += lum
      rowSq += lum * lum
      sum[rowOff + x + 1] = sum[prevOff + x + 1] + rowSum
      sqSum[rowOff + x + 1] = sqSum[prevOff + x + 1] + rowSq
    }
  }

  for (let y = 0; y < h; y++) {
    const y0 = Math.max(0, y - half)
    const y1 = Math.min(h - 1, y + half) + 1
    const r0 = y0 * stride
    const r1 = y1 * stride
    for (let x = 0; x < w; x++) {
      const x0 = Math.max(0, x - half)
      const x1 = Math.min(w - 1, x + half) + 1
      const count = (x1 - x0) * (y1 - y0)
      const s = sum[r1 + x1] - sum[r0 + x1] - sum[r1 + x0] + sum[r0 + x0]
      const sq = sqSum[r1 + x1] - sqSum[r0 + x1] - sqSum[r1 + x0] + sqSum[r0 + x0]
      const mean = s / count
      const variance = Math.max(0, sq / count - mean * mean)
      const std = Math.sqrt(variance)
      const threshold = mean * (1 + k * (std / R - 1))
      const val = gray[y * w + x] <= threshold ? 0 : 255
      const p = (y * w + x) * 4
      d[p] = val
      d[p + 1] = val
      d[p + 2] = val
    }
  }
}

/**
 * Estimate local paper background illumination via a downsampled morphological
 * max + box blur filter, then normalize each pixel by dividing by the local
 * background level so uneven shadows disappear while color ink stays vivid.
 */
function applyMagicColorBackgroundNorm(imgData: { data: Uint8ClampedArray; width: number; height: number }): void {
  const { data: d, width: w, height: h } = imgData
  if (w <= 0 || h <= 0) return

  // Downsample grid step (~1/24 of min dimension, at least 4px)
  const step = Math.max(4, Math.min(32, Math.floor(Math.min(w, h) / 24)))
  const gw = Math.max(1, Math.ceil(w / step))
  const gh = Math.max(1, Math.ceil(h / step))
  const gridMax = new Float32Array(gw * gh)

  for (let gy = 0; gy < gh; gy++) {
    const yStart = gy * step
    const yEnd = Math.min(h, yStart + step)
    for (let gx = 0; gx < gw; gx++) {
      const xStart = gx * step
      const xEnd = Math.min(w, xStart + step)
      let maxLum = 64
      for (let y = yStart; y < yEnd; y++) {
        for (let x = xStart; x < xEnd; x++) {
          const i = (y * w + x) * 4
          const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
          if (lum > maxLum) maxLum = lum
        }
      }
      gridMax[gy * gw + gx] = maxLum
    }
  }

  // Dilate + smooth on the coarse grid (3x3 max followed by 3x3 average)
  const dilated = new Float32Array(gw * gh)
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      let m = 64
      for (let dy = -1; dy <= 1; dy++) {
        const ny = Math.max(0, Math.min(gh - 1, gy + dy))
        for (let dx = -1; dx <= 1; dx++) {
          const nx = Math.max(0, Math.min(gw - 1, gx + dx))
          const v = gridMax[ny * gw + nx]
          if (v > m) m = v
        }
      }
      dilated[gy * gw + gx] = m
    }
  }

  const smoothBg = new Float32Array(gw * gh)
  for (let gy = 0; gy < gh; gy++) {
    for (let gx = 0; gx < gw; gx++) {
      let s = 0
      let c = 0
      for (let dy = -1; dy <= 1; dy++) {
        const ny = Math.max(0, Math.min(gh - 1, gy + dy))
        for (let dx = -1; dx <= 1; dx++) {
          const nx = Math.max(0, Math.min(gw - 1, gx + dx))
          s += dilated[ny * gw + nx]
          c++
        }
      }
      smoothBg[gy * gw + gx] = Math.max(80, s / c)
    }
  }

  // Normalize each pixel by bilinearly interpolated local background illumination
  for (let y = 0; y < h; y++) {
    const fy = Math.max(0, Math.min(gh - 1, (y + 0.5) / step - 0.5))
    const gy0 = Math.floor(fy)
    const gy1 = Math.min(gh - 1, gy0 + 1)
    const wy = fy - gy0
    for (let x = 0; x < w; x++) {
      const fx = Math.max(0, Math.min(gw - 1, (x + 0.5) / step - 0.5))
      const gx0 = Math.floor(fx)
      const gx1 = Math.min(gw - 1, gx0 + 1)
      const wx = fx - gx0
      const bg =
        smoothBg[gy0 * gw + gx0] * (1 - wx) * (1 - wy) +
        smoothBg[gy0 * gw + gx1] * wx * (1 - wy) +
        smoothBg[gy1 * gw + gx0] * (1 - wx) * wy +
        smoothBg[gy1 * gw + gx1] * wx * wy

      const i = (y * w + x) * 4
      const scale = 255 / Math.max(80, bg)
      let nr = d[i] * scale
      let ng = d[i + 1] * scale
      let nb = d[i + 2] * scale
      const lum = 0.299 * nr + 0.587 * ng + 0.114 * nb
      if (lum > 205) {
        // Snap near-white normalized paper to clean white
        const boost = Math.min(1, (lum - 205) / 42)
        nr = nr + (255 - nr) * boost * 0.9
        ng = ng + (255 - ng) * boost * 0.9
        nb = nb + (255 - nb) * boost * 0.9
      } else {
        // Deepen ink & boost contrast
        const contrast = 1.25
        nr = (nr - 128) * contrast + 122
        ng = (ng - 128) * contrast + 122
        nb = (nb - 128) * contrast + 122
      }
      d[i] = Math.max(0, Math.min(255, Math.round(nr)))
      d[i + 1] = Math.max(0, Math.min(255, Math.round(ng)))
      d[i + 2] = Math.max(0, Math.min(255, Math.round(nb)))
    }
  }
}

/**
 * Document scan enhancement:
 * - 'magic-color': background-normalized color whitening & ink boost
 * - 'bw-document': high-contrast S-curve grayscale
 * - 'adaptive-bw': Sauvola integral-image adaptive binary threshold
 */
export function applyScanEnhancement(
  imgData: ImageData | { data: Uint8ClampedArray; width: number; height: number },
  mode: ScanEnhanceMode,
): void {
  if (mode === 'none') return
  if (mode === 'adaptive-bw') {
    applySauvolaThreshold(imgData)
    return
  }
  if (mode === 'magic-color') {
    applyMagicColorBackgroundNorm(imgData)
    return
  }
  if (mode === 'bw-document') {
    const d = imgData.data
    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2]
      const v = lum > 168 ? 255 : lum < 105 ? 12 : Math.round(((lum - 105) / 63) * 243 + 12)
      d[i] = v
      d[i + 1] = v
      d[i + 2] = v
    }
  }
}

/**
 * Pure quadrilateral detector operating on RGBA pixel data:
 * 1. Grayscale + 3×3 Sobel gradient magnitude + border color contrast
 * 2. Otsu automatic threshold on gradient/contrast response
 * 3. Largest 8-connected component selection to reject isolated background clutter
 * 4. Monotone-chain convex hull + rotated-axis / perimeter corner fitting
 */
export function detectQuadFromRgba(
  data: Uint8ClampedArray | Uint8Array,
  w: number,
  h: number,
): PerspectiveQuad {
  const fallback: PerspectiveQuad = {
    tl: { x: 10, y: 10 },
    tr: { x: 90, y: 10 },
    br: { x: 90, y: 90 },
    bl: { x: 10, y: 90 },
  }
  if (w < 16 || h < 16 || data.length < w * h * 4) return fallback

  const gray = new Float32Array(w * h)
  for (let i = 0; i < w * h; i++) {
    const p = i * 4
    gray[i] = 0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2]
  }

  // Estimate border background RGB
  let bR = 0, bG = 0, bB = 0, bCount = 0
  for (let x = 0; x < w; x++) {
    for (const y of [0, 1, h - 2, h - 1]) {
      const p = (y * w + x) * 4
      bR += data[p]; bG += data[p + 1]; bB += data[p + 2]; bCount++
    }
  }
  for (let y = 2; y < h - 2; y++) {
    for (const x of [0, 1, w - 2, w - 1]) {
      const p = (y * w + x) * 4
      bR += data[p]; bG += data[p + 1]; bB += data[p + 2]; bCount++
    }
  }
  bR /= Math.max(1, bCount)
  bG /= Math.max(1, bCount)
  bB /= Math.max(1, bCount)

  // Compute 3x3 Sobel gradient magnitude combined with border contrast
  const mag = new Float32Array(w * h)
  let maxMag = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const tl = gray[(y - 1) * w + (x - 1)]
      const tc = gray[(y - 1) * w + x]
      const tr = gray[(y - 1) * w + (x + 1)]
      const ml = gray[y * w + (x - 1)]
      const mr = gray[y * w + (x + 1)]
      const bl = gray[(y + 1) * w + (x - 1)]
      const bc = gray[(y + 1) * w + x]
      const br = gray[(y + 1) * w + (x + 1)]

      const gx = -tl + tr - 2 * ml + 2 * mr - bl + br
      const gy = -tl - 2 * tc - tr + bl + 2 * bc + br
      const sobel = Math.hypot(gx, gy) * 0.25

      const p = (y * w + x) * 4
      const diffBg = Math.hypot(data[p] - bR, data[p + 1] - bG, data[p + 2] - bB)
      const s = sobel * 0.7 + diffBg * 0.55
      mag[y * w + x] = s
      if (s > maxMag) maxMag = s
    }
  }

  if (maxMag < 18) return fallback

  // Otsu threshold on 256-bin histogram of normalized gradient magnitude
  const hist = new Int32Array(256)
  let totalPixels = 0
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const bin = Math.min(255, Math.max(0, Math.round((mag[y * w + x] / maxMag) * 255)))
      hist[bin]++
      totalPixels++
    }
  }

  let sumAll = 0
  for (let i = 0; i < 256; i++) sumAll += i * hist[i]

  let sumB = 0
  let wB = 0
  let maxVar = -1
  let otsuBin = 96
  for (let t = 0; t < 256; t++) {
    wB += hist[t]
    if (wB === 0) continue
    const wF = totalPixels - wB
    if (wF === 0) break
    sumB += t * hist[t]
    const mB = sumB / wB
    const mF = (sumAll - sumB) / wF
    const between = wB * wF * (mB - mF) * (mB - mF)
    if (between > maxVar) {
      maxVar = between
      otsuBin = t
    }
  }

  const threshold = Math.max(maxMag * 0.28, (otsuBin / 255) * maxMag)
  const mask = new Uint8Array(w * h)
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      if (mag[y * w + x] >= threshold) mask[y * w + x] = 1
    }
  }

  // Find largest 8-connected component (with 2px neighborhood bridge for broken edges)
  const visited = new Uint8Array(w * h)
  const queue = new Int32Array(w * h)
  let bestComp: number[] = []

  for (let i = 0; i < w * h; i++) {
    if (!mask[i] || visited[i]) continue
    const comp: number[] = []
    let head = 0
    let tail = 0
    queue[tail++] = i
    visited[i] = 1
    while (head < tail) {
      const cur = queue[head++]
      comp.push(cur)
      const cy = Math.floor(cur / w)
      const cx = cur - cy * w
      for (let dy = -2; dy <= 2; dy++) {
        const ny = cy + dy
        if (ny < 1 || ny >= h - 1) continue
        for (let dx = -2; dx <= 2; dx++) {
          const nx = cx + dx
          if (nx < 1 || nx >= w - 1) continue
          const ni = ny * w + nx
          if (mask[ni] && !visited[ni]) {
            visited[ni] = 1
            queue[tail++] = ni
          }
        }
      }
    }
    if (comp.length > bestComp.length) bestComp = comp
  }

  if (bestComp.length < 16) return fallback

  const pts: PerspectivePoint[] = bestComp.map((idx) => {
    const y = Math.floor(idx / w)
    return { x: idx - y * w, y }
  })

  // Monotone chain convex hull
  pts.sort((a, b) => (a.x !== b.x ? a.x - b.x : a.y - b.y))
  const cross = (o: PerspectivePoint, a: PerspectivePoint, b: PerspectivePoint) =>
    (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x)

  const lower: PerspectivePoint[] = []
  for (const p of pts) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop()
    }
    lower.push(p)
  }
  const upper: PerspectivePoint[] = []
  for (let i = pts.length - 1; i >= 0; i--) {
    const p = pts[i]
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop()
    }
    upper.push(p)
  }
  upper.pop()
  lower.pop()
  const hull = lower.concat(upper)
  const sourcePts = hull.length >= 4 ? hull : pts

  // Fit 4 extreme corners on normalized axes
  let bestTL = { x: w * 0.1, y: h * 0.1, metric: Infinity }
  let bestTR = { x: w * 0.9, y: h * 0.1, metric: -Infinity }
  let bestBR = { x: w * 0.9, y: h * 0.9, metric: -Infinity }
  let bestBL = { x: w * 0.1, y: h * 0.9, metric: -Infinity }

  for (const p of sourcePts) {
    const nx = p.x / w
    const ny = p.y / h
    if (nx + ny < bestTL.metric) bestTL = { x: p.x, y: p.y, metric: nx + ny }
    if (nx - ny > bestTR.metric) bestTR = { x: p.x, y: p.y, metric: nx - ny }
    if (nx + ny > bestBR.metric) bestBR = { x: p.x, y: p.y, metric: nx + ny }
    if (ny - nx > bestBL.metric) bestBL = { x: p.x, y: p.y, metric: ny - nx }
  }

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

  const topSpan = quad.tr.x - quad.tl.x
  const botSpan = quad.br.x - quad.bl.x
  const leftSpan = quad.bl.y - quad.tl.y
  const rightSpan = quad.br.y - quad.tr.y
  if (topSpan < 15 || botSpan < 15 || leftSpan < 15 || rightSpan < 15) {
    return fallback
  }
  return quad
}

/**
 * Automatically estimate the 4 corners of a document, card, or rectangular subject in an image.
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
    const sampleSize = 160
    const scale = Math.min(sampleSize / Math.max(1, srcW), sampleSize / Math.max(1, srcH))
    const w = Math.max(24, Math.round(srcW * scale))
    const h = Math.max(24, Math.round(srcH * scale))
    const c = makeCanvas(w, h)
    const ctx = ctx2d(c)
    ctx.drawImage(source, 0, 0, w, h)
    const { data } = ctx.getImageData(0, 0, w, h)
    return detectQuadFromRgba(data, w, h)
  } catch {
    return fallback
  }
}

function clipRoundedRect(ctx: AnyCtx, w: number, h: number, r: number) {
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

export async function cropImageBlob(
  file: Blob,
  xPct: number,
  yPct: number,
  wPct: number,
  hPct: number,
  opts?: CropOpts,
): Promise<{ blob: Blob; outType: string; width: number; height: number }> {
  const bmp = await loadBitmap(file)
  const hasRounded = !opts?.circular && (opts?.cornerRadius ?? 0) > 0
  let c: AnyCanvas

  if (opts?.cropMode === 'perspective' && opts.perspectiveQuad) {
    const { width: dstW, height: dstH, quadPx } = computePerspectiveDimensions(
      bmp.width,
      bmp.height,
      opts.perspectiveQuad,
      opts.perspectiveAspect,
    )
    const srcCanvas = makeCanvas(bmp.width, bmp.height)
    const srcCtx = ctx2d(srcCanvas)
    srcCtx.drawImage(bmp, 0, 0, srcCanvas.width, srcCanvas.height)
    const srcData = srcCtx.getImageData(0, 0, srcCanvas.width, srcCanvas.height)
    // Scale quadPx if srcCanvas was clamped
    const sxScale = srcCanvas.width / bmp.width
    const syScale = srcCanvas.height / bmp.height
    const scaledQuad: [PerspectivePoint, PerspectivePoint, PerspectivePoint, PerspectivePoint] = [
      { x: quadPx[0].x * sxScale, y: quadPx[0].y * syScale },
      { x: quadPx[1].x * sxScale, y: quadPx[1].y * syScale },
      { x: quadPx[2].x * sxScale, y: quadPx[2].y * syScale },
      { x: quadPx[3].x * sxScale, y: quadPx[3].y * syScale },
    ]
    const { w: clampedDstW, h: clampedDstH } = clampDims(dstW, dstH)
    const warpedData = warpPerspectiveImageData(srcData, clampedDstW, clampedDstH, scaledQuad)
    if (opts.scanEnhance && opts.scanEnhance !== 'none') {
      applyScanEnhancement(warpedData, opts.scanEnhance)
    }

    const rawWarped = makeCanvas(clampedDstW, clampedDstH)
    ctx2d(rawWarped).putImageData(warpedData, 0, 0)

    c = makeCanvas(clampedDstW, clampedDstH)
    const ctx = ctx2d(c)
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
    const sx = (xPct / 100) * bmp.width
    const sy = (yPct / 100) * bmp.height
    const sw = Math.max(1, (wPct / 100) * bmp.width)
    const sh = Math.max(1, (hPct / 100) * bmp.height)
    c = makeCanvas(sw, sh)
    const ctx = ctx2d(c)

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
  const reqType = pickOutputType(file.type, { needsAlpha })
  const out = reqType === 'image/jpeg' ? flattenOnto(c) : c
  const encoded = await encodeCanvasSmart(out, reqType, 0.92)
  return { blob: encoded.blob, outType: encoded.type, width: out.width, height: out.height }
}

export async function cropImage(
  file: File,
  xPct: number,
  yPct: number,
  wPct: number,
  hPct: number,
  opts?: CropOpts,
): Promise<OutputFile> {
  const { blob, outType } = await cropImageBlob(file, xPct, yPct, wPct, hPct, opts)
  return { name: `${stem(file.name)}-cropped.${extFor(outType)}`, blob }
}

export interface ConvertOpts {
  bgColor?: string
  encoder?: EncoderPreference
}

export async function convertImageBlob(
  file: Blob,
  type: ImgFormat,
  quality = 0.92,
  opts?: ConvertOpts,
): Promise<{ blob: Blob; outType: string; width: number; height: number }> {
  const bmp = await loadBitmap(file)
  let c = drawScaled(bmp, bmp.width, bmp.height)
  bmp.close()
  if (type === 'image/jpeg') c = flattenOnto(c, opts?.bgColor || '#ffffff')
  const encoded = await encodeCanvasSmart(c, type, quality, {
    encoder: opts?.encoder ?? (type === 'image/avif' ? 'wasm' : 'browser'),
  })
  return { blob: encoded.blob, outType: encoded.type, width: c.width, height: c.height }
}

export async function convertImage(
  file: File,
  type: ImgFormat,
  quality = 0.92,
  opts?: ConvertOpts,
): Promise<OutputFile> {
  const { blob, outType } = await convertImageBlob(file, type, quality, opts)
  return { name: `${stem(file.name)}.${extFor(outType)}`, blob }
}

export interface RotateOpts {
  bgColor?: string
}

export async function rotateImageBlob(
  file: Blob,
  deg: number,
  opts?: RotateOpts,
): Promise<{ blob: Blob; outType: string; width: number; height: number }> {
  const bmp = await loadBitmap(file)
  const rad = (deg * Math.PI) / 180
  const cos = Math.abs(Math.cos(rad))
  const sin = Math.abs(Math.sin(rad))
  const newW = Math.max(1, Math.round(bmp.width * cos + bmp.height * sin))
  const newH = Math.max(1, Math.round(bmp.width * sin + bmp.height * cos))
  const c = makeCanvas(newW, newH)
  const ctx = ctx2d(c)

  const reqType = pickOutputType(file.type)
  const isJpg = reqType === 'image/jpeg'
  const bg = opts?.bgColor || (isJpg ? '#ffffff' : 'transparent')
  if (bg !== 'transparent') {
    ctx.fillStyle = bg
    ctx.fillRect(0, 0, c.width, c.height)
  }

  const scaleX = c.width / newW
  const scaleY = c.height / newH
  ctx.translate(c.width / 2, c.height / 2)
  ctx.scale(scaleX, scaleY)
  ctx.rotate(rad)
  ctx.drawImage(bmp, -bmp.width / 2, -bmp.height / 2)
  bmp.close()

  const out = isJpg ? flattenOnto(c, bg === 'transparent' ? '#ffffff' : bg) : c
  const encoded = await encodeCanvasSmart(out, reqType, 0.92)
  return { blob: encoded.blob, outType: encoded.type, width: out.width, height: out.height }
}

export async function rotateImage(file: File, deg: number, opts?: RotateOpts): Promise<OutputFile> {
  const { blob, outType } = await rotateImageBlob(file, deg, opts)
  return { name: `${stem(file.name)}-rotated.${extFor(outType)}`, blob }
}

export async function flipImageBlob(
  file: Blob,
  horizontal: boolean,
  vertical: boolean,
): Promise<{ blob: Blob; outType: string; width: number; height: number }> {
  const bmp = await loadBitmap(file)
  const c = makeCanvas(bmp.width, bmp.height)
  const ctx = ctx2d(c)
  ctx.translate(horizontal ? c.width : 0, vertical ? c.height : 0)
  ctx.scale(horizontal ? -1 : 1, vertical ? -1 : 1)
  ctx.drawImage(bmp, 0, 0, c.width, c.height)
  bmp.close()
  const reqType = pickOutputType(file.type)
  const out = reqType === 'image/jpeg' ? flattenOnto(c) : c
  const encoded = await encodeCanvasSmart(out, reqType, 0.92)
  return { blob: encoded.blob, outType: encoded.type, width: out.width, height: out.height }
}

export async function flipImage(file: File, horizontal: boolean, vertical: boolean): Promise<OutputFile> {
  const { blob, outType } = await flipImageBlob(file, horizontal, vertical)
  return { name: `${stem(file.name)}-flipped.${extFor(outType)}`, blob }
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

export async function watermarkTextBlob(
  file: Blob,
  opts: WatermarkOpts,
): Promise<{ blob: Blob; outType: string; width: number; height: number }> {
  const bmp = await loadBitmap(file)
  const c = drawScaled(bmp, bmp.width, bmp.height)
  bmp.close()
  const ctx = ctx2d(c)
  ctx.save()
  ctx.globalAlpha = opts.opacity
  ctx.fillStyle = opts.colorHex || '#ffffff'
  ctx.strokeStyle = 'rgba(0,0,0,.35)'
  ctx.font = `700 ${opts.fontSize}px Manrope, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const draw = (x: number, y: number) => {
    ctx.strokeText(opts.text, x, y)
    ctx.fillText(opts.text, x, y)
  }
  const rot = opts.angle !== undefined ? (opts.angle * Math.PI) / 180 : opts.position === 'tile' ? -0.35 : 0

  if (opts.position === 'tile') {
    ctx.rotate(rot)
    const stepX = Math.max(80, ctx.measureText(opts.text).width + 120)
    const stepY = Math.max(40, opts.fontSize * 5)
    for (let y = -c.height; y < c.height * 2; y += stepY) {
      for (let x = -c.width; x < c.width * 2; x += stepX) draw(x, y)
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
    draw(c.width - 24, c.height - 24 - opts.fontSize / 2)
  }
  ctx.restore()

  const reqType = pickOutputType(file.type)
  const out = reqType === 'image/jpeg' ? flattenOnto(c) : c
  const encoded = await encodeCanvasSmart(out, reqType, 0.92)
  return { blob: encoded.blob, outType: encoded.type, width: out.width, height: out.height }
}

export async function watermarkImage(file: File, opts: WatermarkOpts): Promise<OutputFile> {
  if (!opts.logoUrl) {
    const { blob, outType } = await watermarkTextBlob(file, opts)
    return { name: `${stem(file.name)}-watermarked.${extFor(outType)}`, blob }
  }
  const bmp = await loadBitmap(file)
  const c = drawScaled(bmp, bmp.width, bmp.height)
  bmp.close()
  const ctx = ctx2d(c)
  ctx.save()
  ctx.globalAlpha = opts.opacity

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

  ctx.restore()
  const reqType = pickOutputType(file.type)
  const out = reqType === 'image/jpeg' ? flattenOnto(c) : c
  const encoded = await encodeCanvasSmart(out, reqType, 0.92)
  return { name: `${stem(file.name)}-watermarked.${extFor(encoded.type)}`, blob: encoded.blob }
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
    return isPng
      ? await doc.embedPng(bytes)
      : await doc.embedJpg(bytes).catch(async () => {
          const bmp = await loadBitmap(f)
          const c = drawScaled(bmp, bmp.width, bmp.height)
          bmp.close()
          const png = await encodeCanvasSmart(c, 'image/png', 1)
          return doc.embedPng(new Uint8Array(await png.blob.arrayBuffer()))
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
    const cols = layout === '4-up' ? 2 : isLandscape ? 2 : 1
    const rows = layout === '4-up' ? 2 : isLandscape ? 1 : 2
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

function drawSquareIcon(bmp: ImageBitmap, size: number, fitMode: 'pad' | 'cover' | 'stretch' = 'pad'): AnyCanvas {
  if (fitMode === 'stretch' || bmp.width === bmp.height) {
    return drawScaled(bmp, size, size, { smoothing: 'high' })
  }
  if (fitMode === 'cover') {
    const scale = Math.max(size / bmp.width, size / bmp.height)
    const sw = Math.round(size / scale)
    const sh = Math.round(size / scale)
    const sx = Math.round((bmp.width - sw) / 2)
    const sy = Math.round((bmp.height - sh) / 2)
    return drawScaled(bmp, size, size, { smoothing: 'high', sx, sy, sw, sh })
  }
  const c = makeCanvas(size, size)
  const ctx = ctx2d(c)
  ctx.clearRect(0, 0, size, size)
  const scale = Math.min(size / bmp.width, size / bmp.height)
  const dw = Math.max(1, Math.round(bmp.width * scale))
  const dh = Math.max(1, Math.round(bmp.height * scale))
  const dx = Math.round((size - dw) / 2)
  const dy = Math.round((size - dh) / 2)
  const scaled = drawScaled(bmp, dw, dh, { smoothing: 'high' })
  ctx.drawImage(scaled, dx, dy)
  return c
}

/** Build a real multi-size ICO (PNG-compressed entries, Vista+ format), or a full Web Favicon Kit ZIP. */
export async function imageToIco(file: File, sizes: number[], opts?: IcoOpts): Promise<OutputFile> {
  const bmp = await loadBitmap(file)
  const fitMode = opts?.fitMode ?? 'pad'
  const entries: { size: number; png: Uint8Array }[] = []
  for (const s of sizes) {
    const c = drawSquareIcon(bmp, s, fitMode)
    const { blob } = await encodeCanvasSmart(c, 'image/png', 1)
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
    const { default: JSZip } = await import('jszip')
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
      const { blob: b } = await encodeCanvasSmart(c, 'image/png', 1)
      zip.file(fname, new Uint8Array(await b.arrayBuffer()))
    }
    bmp.close()
    zip.file(
      'site.webmanifest',
      JSON.stringify(
        {
          name: stem(file.name),
          short_name: stem(file.name),
          icons: [
            { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
            { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          ],
          theme_color: '#ffffff',
          background_color: '#ffffff',
          display: 'standalone',
        },
        null,
        2,
      ),
    )
    zip.file(
      'head-tags.html',
      `<!-- Paste inside your <head> -->\n<link rel="icon" href="/favicon.ico" sizes="any">\n<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png">\n<link rel="apple-touch-icon" href="/apple-touch-icon.png">\n<link rel="manifest" href="/site.webmanifest">\n`,
    )
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
  orientation?: number
  orientationLabel?: string
  dpiX?: number
  dpiY?: number
  colorSpace?: string
}

const ORIENTATION_LABELS: Record<number, string> = {
  1: 'Horizontal (normal)',
  2: 'Mirror horizontal',
  3: 'Rotate 180°',
  4: 'Mirror vertical',
  5: 'Mirror horizontal & rotate 270° CW',
  6: 'Rotate 90° CW',
  7: 'Mirror horizontal & rotate 90° CW',
  8: 'Rotate 270° CW',
}

export function parseTiffHeader(view: DataView, tiffStart: number, maxByte: number): ExifData {
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
    for (let i = 0; i < count && valOffset + i < maxByte; i++) {
      const c = view.getUint8(valOffset + i)
      if (c === 0) break
      str += String.fromCharCode(c)
    }
    return str.trim()
  }

  const readRational = (valOffset: number): number => {
    if (valOffset + 8 > maxByte) return 0
    const num = view.getUint32(valOffset, isLittle)
    const den = view.getUint32(valOffset + 4, isLittle)
    return den === 0 ? 0 : num / den
  }

  const readShortOrLong = (entryPos: number, type: number): number => {
    if (type === 3) return view.getUint16(entryPos + 8, isLittle)
    return view.getUint32(entryPos + 8, isLittle)
  }

  let exifSubIfdOffset = 0
  let gpsSubIfdOffset = 0
  let xRes = 0
  let yRes = 0
  let resUnit = 2 // default inches

  const readIfdEntries = (offset: number, isExifSub = false) => {
    if (offset + 2 > maxByte) return
    const numEntries = view.getUint16(offset, isLittle)
    let p = offset + 2

    for (let i = 0; i < numEntries && p + 12 <= maxByte; i++, p += 12) {
      const tag = view.getUint16(p, isLittle)
      const type = view.getUint16(p + 2, isLittle)
      const count = view.getUint32(p + 4, isLittle)
      const valOffsetOrVal = view.getUint32(p + 8, isLittle)
      const byteSize =
        count * (type === 3 ? 2 : type === 4 || type === 9 ? 4 : type === 5 || type === 10 ? 8 : 1)
      const actualOffset = byteSize > 4 ? tiffStart + valOffsetOrVal : p + 8

      if (actualOffset < tiffStart || actualOffset > maxByte) continue

      if (!isExifSub) {
        if (tag === 0x010f) exif.make = readString(actualOffset, count)
        else if (tag === 0x0110) exif.model = readString(actualOffset, count)
        else if (tag === 0x0112) {
          const ori = readShortOrLong(p, type)
          if (ori >= 1 && ori <= 8) {
            exif.orientation = ori
            exif.orientationLabel = `${ori} — ${ORIENTATION_LABELS[ori]}`
          }
        } else if (tag === 0x011a) xRes = readRational(actualOffset)
        else if (tag === 0x011b) yRes = readRational(actualOffset)
        else if (tag === 0x0128) resUnit = readShortOrLong(p, type)
        else if (tag === 0x0131) exif.software = readString(actualOffset, count)
        else if (tag === 0x8769) exifSubIfdOffset = tiffStart + valOffsetOrVal
        else if (tag === 0x8825) gpsSubIfdOffset = tiffStart + valOffsetOrVal
      } else {
        if (tag === 0x9003 || tag === 0x9004) exif.dateTimeOriginal = readString(actualOffset, count)
        else if (tag === 0x829a && actualOffset + 8 <= maxByte) {
          const num = view.getUint32(actualOffset, isLittle)
          const den = view.getUint32(actualOffset + 4, isLittle)
          if (den > 0) {
            exif.exposureTime = den > 1 && num === 1 ? `1/${den}s` : `${(num / den).toFixed(3)}s`
          }
        } else if (tag === 0x829d) {
          exif.fNumber = `f/${readRational(actualOffset).toFixed(1)}`
        } else if (tag === 0x8827) {
          exif.iso = readShortOrLong(p, type)
        } else if (tag === 0x920a) {
          exif.focalLength = `${readRational(actualOffset).toFixed(1)}mm`
        } else if (tag === 0xa001) {
          const cs = readShortOrLong(p, type)
          exif.colorSpace = cs === 1 ? 'sRGB' : cs === 0xffff ? 'Uncalibrated' : `Code ${cs}`
        }
      }
    }
  }

  readIfdEntries(ifdOffset)
  if (exifSubIfdOffset) readIfdEntries(exifSubIfdOffset, true)

  if (xRes > 0 && yRes > 0) {
    // resUnit: 2 = inches, 3 = centimeters
    const factor = resUnit === 3 ? 2.54 : 1
    exif.dpiX = Math.round(xRes * factor)
    exif.dpiY = Math.round(yRes * factor)
  }

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

/** Parse ICC profile description ('desc' / 'mluc' tag) from a raw ICC profile buffer. */
export function parseIccDescription(iccBytes: Uint8Array): string | undefined {
  if (iccBytes.length < 132) return undefined
  const view = new DataView(iccBytes.buffer, iccBytes.byteOffset, iccBytes.byteLength)
  // Verify 'acsp' signature at offset 36
  if (view.getUint32(36, false) !== 0x61637370) return undefined
  const tagCount = view.getUint32(128, false)
  if (tagCount > 100 || 132 + tagCount * 12 > iccBytes.length) return undefined

  for (let i = 0; i < tagCount; i++) {
    const base = 132 + i * 12
    const sig = view.getUint32(base, false)
    if (sig !== 0x64657363) continue // 'desc'
    const tagOff = view.getUint32(base + 4, false)
    const tagSize = view.getUint32(base + 8, false)
    if (tagOff + 12 > iccBytes.length || tagSize < 12) return undefined
    const typeSig = view.getUint32(tagOff, false)
    if (typeSig === 0x64657363) {
      // ICC v2 'desc' type: [type(4), reserved(4), asciiLen(4), ascii...]
      const strLen = Math.min(view.getUint32(tagOff + 8, false), iccBytes.length - (tagOff + 12))
      let s = ''
      for (let j = 0; j < strLen; j++) {
        const c = iccBytes[tagOff + 12 + j]
        if (c === 0) break
        if (c >= 32 && c <= 126) s += String.fromCharCode(c)
      }
      return s.trim() || undefined
    }
    if (typeSig === 0x6d6c7563 && tagOff + 28 <= iccBytes.length) {
      // ICC v4 'mluc' multi-localized Unicode: [type(4), res(4), numRec(4), recSize(4), lang(2), country(2), len(4), off(4)]
      const numRec = view.getUint32(tagOff + 8, false)
      if (numRec >= 1) {
        const strLen = view.getUint32(tagOff + 20, false)
        const strOff = tagOff + view.getUint32(tagOff + 24, false)
        if (strOff + strLen <= iccBytes.length) {
          let s = ''
          for (let j = 0; j + 1 < strLen; j += 2) {
            const ch = view.getUint16(strOff + j, false)
            if (ch === 0) break
            s += String.fromCharCode(ch)
          }
          return s.trim() || undefined
        }
      }
    }
  }
  return undefined
}

export interface ParsedImageContainerMeta {
  exif: ExifData | null
  iccProfile?: string
  dpiX?: number
  dpiY?: number
}

/** Parse JPEG JFIF DPI, APP1 EXIF, and APP2 ICC_PROFILE description. */
export function parseJpegContainerMeta(buffer: ArrayBuffer): ParsedImageContainerMeta {
  let exif: ExifData | null = null
  let iccProfile: string | undefined
  let jfifDpiX: number | undefined
  let jfifDpiY: number | undefined

  try {
    const view = new DataView(buffer)
    const bytes = new Uint8Array(buffer)
    if (view.byteLength < 4 || view.getUint16(0, false) !== 0xffd8) {
      return { exif: null }
    }

    let offset = 2
    const maxOffset = Math.min(view.byteLength - 4, 256 * 1024)

    while (offset < maxOffset) {
      if (view.getUint8(offset) !== 0xff) break
      while (offset + 1 < view.byteLength && view.getUint8(offset + 1) === 0xff) offset++
      const marker = view.getUint8(offset + 1)
      if (marker === 0xda || marker === 0xd9) break
      if (offset + 4 > view.byteLength) break
      const len = view.getUint16(offset + 2, false)
      if (len < 2 || offset + 2 + len > view.byteLength) break

      // APP0 JFIF (0xFFE0): "JFIF\0" + version(2) + units(1) + Xdensity(2) + Ydensity(2)
      if (marker === 0xe0 && len >= 16) {
        if (view.getUint32(offset + 4, false) === 0x4a464946 && view.getUint8(offset + 8) === 0) {
          const units = view.getUint8(offset + 11)
          const xd = view.getUint16(offset + 12, false)
          const yd = view.getUint16(offset + 14, false)
          if (xd > 0 && yd > 0 && (units === 1 || units === 2)) {
            const factor = units === 2 ? 2.54 : 1
            jfifDpiX = Math.round(xd * factor)
            jfifDpiY = Math.round(yd * factor)
          }
        }
      } else if (marker === 0xe1 && len >= 8 && !exif) {
        const exifHeader = view.getUint32(offset + 4, false)
        const zeroWord = view.getUint16(offset + 8, false)
        if (exifHeader === 0x45786966 && zeroWord === 0x0000) {
          exif = parseTiffHeader(view, offset + 10, offset + 2 + len)
        }
      } else if (marker === 0xe2 && len > 16 && !iccProfile) {
        // APP2 ICC_PROFILE\0 + chunkSeq(1) + chunkCount(1) + iccData
        const sig = String.fromCharCode(...bytes.subarray(offset + 4, offset + 15))
        if (sig === 'ICC_PROFILE' && bytes[offset + 15] === 0 && bytes[offset + 16] === 1) {
          const iccSlice = bytes.subarray(offset + 18, offset + 2 + len)
          iccProfile = parseIccDescription(iccSlice) || 'Embedded ICC Profile'
        }
      }
      offset += 2 + len
    }
  } catch {
    // Ignore malformed segments
  }

  const dpiX = exif?.dpiX ?? jfifDpiX
  const dpiY = exif?.dpiY ?? jfifDpiY
  if (exif && !exif.dpiX && dpiX) {
    exif.dpiX = dpiX
    exif.dpiY = dpiY
  }
  return { exif, iccProfile, dpiX, dpiY }
}

export function parseJpegExif(buffer: ArrayBuffer): ExifData | null {
  return parseJpegContainerMeta(buffer).exif
}

/** Parse PNG chunks: eXIf, iCCP (profile name), pHYs (DPI), and sRGB. */
export function parsePngContainerMeta(buffer: ArrayBuffer): ParsedImageContainerMeta {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  const pngMagic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (bytes.length < 24 || pngMagic.some((b, i) => bytes[i] !== b)) {
    return { exif: null }
  }

  let exif: ExifData | null = null
  let iccProfile: string | undefined
  let dpiX: number | undefined
  let dpiY: number | undefined

  let offset = 8
  while (offset + 12 <= bytes.length) {
    const len = view.getUint32(offset, false)
    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7],
    )
    const dataStart = offset + 8
    const dataEnd = dataStart + len
    if (dataEnd + 4 > bytes.length) break

    if (type === 'eXIf' && len >= 8) {
      // PNG eXIf payload is a raw TIFF header (or optionally prefixed with Exif\0\0)
      const isExifPrefix =
        len >= 14 && view.getUint32(dataStart, false) === 0x45786966 && view.getUint16(dataStart + 4, false) === 0
      const tiffStart = isExifPrefix ? dataStart + 6 : dataStart
      exif = parseTiffHeader(view, tiffStart, dataEnd)
    } else if (type === 'iCCP' && len >= 4) {
      // Null-terminated profile name (1–79 Latin-1 chars)
      let name = ''
      for (let i = 0; i < Math.min(len, 80); i++) {
        const c = bytes[dataStart + i]
        if (c === 0) break
        if (c >= 32 && c <= 126) name += String.fromCharCode(c)
      }
      if (name.trim()) iccProfile = name.trim()
    } else if (type === 'sRGB' && !iccProfile) {
      iccProfile = 'sRGB'
    } else if (type === 'pHYs' && len === 9) {
      const ppuX = view.getUint32(dataStart, false)
      const ppuY = view.getUint32(dataStart + 4, false)
      const unit = bytes[dataStart + 8]
      if (unit === 1 && ppuX > 0 && ppuY > 0) {
        // 1 meter = 39.3700787 inches
        dpiX = Math.round(ppuX * 0.0254)
        dpiY = Math.round(ppuY * 0.0254)
      }
    } else if (type === 'IEND') {
      break
    }

    offset = dataEnd + 4
  }

  if (exif && !exif.dpiX && dpiX) {
    exif.dpiX = dpiX
    exif.dpiY = dpiY
  }
  return { exif, iccProfile, dpiX: exif?.dpiX ?? dpiX, dpiY: exif?.dpiY ?? dpiY }
}

/** Parse WebP RIFF chunks: EXIF and ICCP. */
export function parseWebpContainerMeta(buffer: ArrayBuffer): ParsedImageContainerMeta {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  if (
    bytes.length < 16 ||
    view.getUint32(0, false) !== 0x52494646 || // 'RIFF'
    view.getUint32(8, false) !== 0x57454250 // 'WEBP'
  ) {
    return { exif: null }
  }

  let exif: ExifData | null = null
  let iccProfile: string | undefined
  let offset = 12

  while (offset + 8 <= bytes.length) {
    const fourCC = String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3],
    )
    const chunkSize = view.getUint32(offset + 4, true)
    const dataStart = offset + 8
    const dataEnd = dataStart + chunkSize
    if (dataEnd > bytes.length) break

    if (fourCC === 'EXIF' && chunkSize >= 8) {
      const hasPrefix =
        chunkSize >= 14 &&
        view.getUint32(dataStart, false) === 0x45786966 &&
        view.getUint16(dataStart + 4, false) === 0
      const tiffStart = hasPrefix ? dataStart + 6 : dataStart
      exif = parseTiffHeader(view, tiffStart, dataEnd)
    } else if (fourCC === 'ICCP' && chunkSize >= 132) {
      iccProfile = parseIccDescription(bytes.subarray(dataStart, dataEnd)) || 'Embedded ICC Profile'
    }

    offset = dataEnd + (chunkSize & 1)
  }

  return { exif, iccProfile, dpiX: exif?.dpiX, dpiY: exif?.dpiY }
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
  iccProfile?: string
  dpiX?: number
  dpiY?: number
  orientation?: number
  orientationLabel?: string
  exceedsCanvasLimit?: boolean
}

/** Parse container metadata (EXIF, ICC profile, DPI, animation) directly from an ArrayBuffer. */
export function parseImageContainerMetadata(buffer: ArrayBuffer): {
  exif: ExifData | null
  iccProfile?: string
  dpiX?: number
  dpiY?: number
  orientation?: number
  orientationLabel?: string
  animated: boolean
} {
  const bytes = new Uint8Array(buffer)
  const animated = detectAnimatedImage(buffer)
  let parsed: ParsedImageContainerMeta = { exif: null }

  if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
    parsed = parseJpegContainerMeta(buffer)
  } else if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    parsed = parsePngContainerMeta(buffer)
  } else if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46 &&
    bytes[8] === 0x57 && bytes[9] === 0x45 && bytes[10] === 0x42 && bytes[11] === 0x50
  ) {
    parsed = parseWebpContainerMeta(buffer)
  }

  return {
    exif: parsed.exif,
    iccProfile: parsed.iccProfile ?? parsed.exif?.colorSpace,
    dpiX: parsed.dpiX,
    dpiY: parsed.dpiY,
    orientation: parsed.exif?.orientation,
    orientationLabel: parsed.exif?.orientationLabel,
    animated,
  }
}

export async function imageMetadata(file: File): Promise<ImageMeta> {
  const bmp = await loadBitmap(file)
  const buf = await file.slice(0, 262144).arrayBuffer().catch(() => new ArrayBuffer(0))
  const container = parseImageContainerMetadata(buf)
  const exceedsCanvasLimit = clampDims(bmp.width, bmp.height).scaled
  const meta: ImageMeta = {
    width: bmp.width,
    height: bmp.height,
    type: file.type || 'unknown',
    size: file.size,
    name: file.name,
    exif: container.exif,
    animated: container.animated,
    iccProfile: container.iccProfile,
    dpiX: container.dpiX,
    dpiY: container.dpiY,
    orientation: container.orientation,
    orientationLabel: container.orientationLabel,
    exceedsCanvasLimit,
  }
  bmp.close()
  return meta
}

/**
 * Losslessly strip APP1 (EXIF/XMP), APP13 (IPTC/Photoshop), and COM (0xFE)
 * segments from a JPEG byte buffer while preserving APP0 (JFIF), APP2 (ICC
 * color profile), quantization/Huffman tables, and the compressed entropy stream.
 */
export function stripJpegMetadataBytes(buffer: ArrayBuffer): Uint8Array | null {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  if (bytes.length < 4 || view.getUint16(0, false) !== 0xffd8) return null

  const chunks: Uint8Array[] = [bytes.subarray(0, 2)] // SOI (0xFFD8)
  let offset = 2

  while (offset < bytes.length) {
    if (bytes[offset] !== 0xff) {
      // Reached compressed image data unexpectedly — copy remainder
      chunks.push(bytes.subarray(offset))
      break
    }
    let markerPos = offset + 1
    while (markerPos < bytes.length && bytes[markerPos] === 0xff) markerPos++
    if (markerPos >= bytes.length) break
    const marker = bytes[markerPos]

    // Standalone markers without length field (RST0..RST7, SOI, EOI, TEM)
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      chunks.push(bytes.subarray(offset, markerPos + 1))
      offset = markerPos + 1
      continue
    }
    // SOS (Start of Scan) or EOI: copy from here to the end of the file intact
    if (marker === 0xda || marker === 0xd9) {
      chunks.push(bytes.subarray(offset))
      break
    }

    if (markerPos + 3 > bytes.length) return null
    const segLen = view.getUint16(markerPos + 1, false)
    const segEnd = markerPos + 1 + segLen
    if (segLen < 2 || segEnd > bytes.length) return null

    // Drop APP1 (0xE1: EXIF / XMP), APP13 (0xED: IPTC), and COM (0xFE: comment)
    // Keep APP2 (0xE2: ICC profile), APP0 (0xE0: JFIF), DQT, DHT, SOF, etc.
    const shouldDrop = marker === 0xe1 || marker === 0xed || marker === 0xfe
    if (!shouldDrop) {
      chunks.push(bytes.subarray(offset, segEnd))
    }
    offset = segEnd
  }

  const total = chunks.reduce((s, c) => s + c.byteLength, 0)
  const out = new Uint8Array(total)
  let pos = 0
  for (const c of chunks) {
    out.set(c, pos)
    pos += c.byteLength
  }
  return out
}

/**
 * Losslessly strip metadata chunks (`eXIf`, `tEXt`, `iTXt`, `zTXt`, `tIME`) from
 * a PNG byte buffer while preserving `IHDR`, `iCCP`, `sRGB`, `pHYs`, `PLTE`,
 * `tRNS`, `IDAT`, and `IEND`.
 */
export function stripPngMetadataBytes(buffer: ArrayBuffer): Uint8Array | null {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  const pngMagic = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]
  if (bytes.length < 24 || pngMagic.some((b, i) => bytes[i] !== b)) return null

  const dropTypes = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt', 'tIME'])
  const chunks: Uint8Array[] = [bytes.subarray(0, 8)]
  let offset = 8

  while (offset + 12 <= bytes.length) {
    const len = view.getUint32(offset, false)
    const type = String.fromCharCode(
      bytes[offset + 4],
      bytes[offset + 5],
      bytes[offset + 6],
      bytes[offset + 7],
    )
    const chunkEnd = offset + 12 + len
    if (chunkEnd > bytes.length) return null

    if (!dropTypes.has(type)) {
      chunks.push(bytes.subarray(offset, chunkEnd))
    }
    offset = chunkEnd
    if (type === 'IEND') break
  }

  const total = chunks.reduce((s, c) => s + c.byteLength, 0)
  const out = new Uint8Array(total)
  let pos = 0
  for (const c of chunks) {
    out.set(c, pos)
    pos += c.byteLength
  }
  return out
}

/**
 * Losslessly strip `EXIF` and `XMP ` chunks from a WebP RIFF container,
 * updating the RIFF file size header and clearing the EXIF (0x08) and XMP (0x04)
 * feature flags in the `VP8X` extended header chunk.
 */
export function stripWebpMetadataBytes(buffer: ArrayBuffer): Uint8Array | null {
  const bytes = new Uint8Array(buffer)
  const view = new DataView(buffer)
  if (
    bytes.length < 16 ||
    view.getUint32(0, false) !== 0x52494646 ||
    view.getUint32(8, false) !== 0x57454250
  ) {
    return null
  }

  const keptChunks: Uint8Array[] = []
  let offset = 12

  while (offset + 8 <= bytes.length) {
    const fourCC = String.fromCharCode(
      bytes[offset],
      bytes[offset + 1],
      bytes[offset + 2],
      bytes[offset + 3],
    )
    const chunkSize = view.getUint32(offset + 4, true)
    const paddedSize = chunkSize + (chunkSize & 1)
    const chunkEnd = offset + 8 + paddedSize
    if (offset + 8 + chunkSize > bytes.length) return null

    if (fourCC !== 'EXIF' && fourCC !== 'XMP ') {
      const slice = bytes.slice(offset, Math.min(bytes.length, chunkEnd))
      if (fourCC === 'VP8X' && slice.length >= 12) {
        // Clear bit 3 (0x08 = EXIF) and bit 2 (0x04 = XMP) in VP8X flags byte at offset 8
        slice[8] &= ~(0x08 | 0x04)
      }
      keptChunks.push(slice)
    }
    offset = chunkEnd
  }

  const payloadSize = 4 + keptChunks.reduce((s, c) => s + c.byteLength, 0) // 'WEBP' + chunks
  const out = new Uint8Array(8 + payloadSize)
  const outView = new DataView(out.buffer)
  outView.setUint32(0, 0x52494646, false) // 'RIFF'
  outView.setUint32(4, payloadSize, true) // little-endian RIFF size
  outView.setUint32(8, 0x57454250, false) // 'WEBP'
  let pos = 12
  for (const c of keptChunks) {
    out.set(c, pos)
    pos += c.byteLength
  }
  return out
}

/**
 * Strip EXIF, XMP, IPTC, and text metadata. Uses lossless byte-surgery for
 * JPEG (keeping ICC profiles), PNG, and WebP so image pixels are never
 * re-encoded; falls back to canvas re-encoding only for other formats.
 */
export async function stripExif(file: File): Promise<OutputFile> {
  const buf = await file.arrayBuffer()
  const strippedJpeg = stripJpegMetadataBytes(buf)
  if (strippedJpeg) {
    return {
      name: `${stemOf(file.name)}-sanitized.jpg`,
      blob: new Blob([strippedJpeg.buffer as ArrayBuffer], { type: 'image/jpeg' }),
    }
  }
  const strippedPng = stripPngMetadataBytes(buf)
  if (strippedPng) {
    return {
      name: `${stemOf(file.name)}-sanitized.png`,
      blob: new Blob([strippedPng.buffer as ArrayBuffer], { type: 'image/png' }),
    }
  }
  const strippedWebp = stripWebpMetadataBytes(buf)
  if (strippedWebp) {
    return {
      name: `${stemOf(file.name)}-sanitized.webp`,
      blob: new Blob([strippedWebp.buffer as ArrayBuffer], { type: 'image/webp' }),
    }
  }

  // Fallback for other formats
  const bmp = await loadBitmap(file)
  let c = drawScaled(bmp, bmp.width, bmp.height)
  bmp.close()
  const reqType = pickOutputType(file.type)
  if (reqType === 'image/jpeg') c = flattenOnto(c)
  const encoded = await encodeCanvasSmart(c, reqType, 0.95)
  return { name: `${stemOf(file.name)}-sanitized.${extFor(encoded.type)}`, blob: encoded.blob }
}

export { encodePngQuantized }
