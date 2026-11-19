import {
  makeCanvas,
  ctx2d,
  encodeVerified,
  pickOutputType,
  flattenOnto,
  drawScaled,
  decodeBitmap,
  extFor,
  stemOf,
  type AnyCanvas,
} from './imageCore'
import type { OutputFile } from './download'
import type {
  ImageExtraToolId,
  ImageExtraSettings,
  PassportSettings,
  BlurSettings,
  ImageConverterSettings,
  Base64Settings,
  CollageSettings,
} from './imageExtraTypes'
import {
  mmToPx,
  resolvePassportDimensions,
  computePassportCropPixels,
  computeSheetLayout,
  patchJpegJfifDpi,
  normalizeRedactRegion,
  boxBlurRgba,
  pixelateRgba,
  blackoutRgba,
  computeCollageLayout,
  computeCoverContainRect,
  parseSvgDimensions,
  uint8ToBase64,
  formatBase64Snippet,
  parseHexRgb,
} from './imageExtraMath'

export interface ExtraProcContext {
  signal: AbortSignal
  onProgress: (done: number, total: number) => void
}

function checkAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw new DOMException('Processing cancelled by user.', 'AbortError')
  }
}

/**
 * Encode a canvas as JPEG, optionally binary-searching quality to fit under `targetSizeKB`,
 * and patch the JFIF APP0 header with the exact physical `dpi`.
 */
export async function encodeJpegWithDpiAndTargetKB(
  canvas: AnyCanvas,
  dpi: number,
  initialQualityPct: number,
  targetSizeKB = 0,
): Promise<Blob> {
  const flat = flattenOnto(canvas, '#ffffff')
  let bestBlob: Blob

  if (targetSizeKB > 0) {
    const targetBytes = targetSizeKB * 1024
    // Try initial quality first
    const initQ = Math.max(0.1, Math.min(0.98, (initialQualityPct || 92) / 100))
    const firstTry = await encodeVerified(flat, 'image/jpeg', initQ)
    if (firstTry.blob.size <= targetBytes) {
      bestBlob = firstTry.blob
    } else {
      let lo = 0.12
      let hi = initQ
      let candidate = firstTry.blob
      for (let iter = 0; iter < 7; iter++) {
        const mid = (lo + hi) / 2
        const res = await encodeVerified(flat, 'image/jpeg', mid)
        candidate = res.blob
        if (res.blob.size <= targetBytes) {
          lo = mid
          bestBlob = res.blob
        } else {
          hi = mid
        }
      }
      bestBlob ??= candidate
    }
  } else {
    const q = Math.max(0.1, Math.min(0.98, (initialQualityPct || 92) / 100))
    const res = await encodeVerified(flat, 'image/jpeg', q)
    bestBlob = res.blob
  }

  const rawBytes = new Uint8Array(await bestBlob.arrayBuffer())
  const patchedBytes = patchJpegJfifDpi(rawBytes, dpi)
  const copy = new Uint8Array(patchedBytes.byteLength)
  copy.set(patchedBytes)
  return new Blob([copy], { type: 'image/jpeg' })
}

/**
 * Render a single passport photo canvas at exact pixel dimensions (`widthPx × heightPx`).
 */
export function renderPassportSingleCanvas(
  src: CanvasImageSource & { width: number; height: number },
  settings: PassportSettings,
): { canvas: AnyCanvas; widthPx: number; heightPx: number; widthMm: number; heightMm: number } {
  const dpi = Math.max(72, Math.min(600, settings.dpi || 300))
  const dims = resolvePassportDimensions(
    settings.presetId,
    settings.customWidthMm,
    settings.customHeightMm,
    dpi,
  )
  const { widthPx, heightPx, widthMm, heightMm, aspect } = dims
  const cropRect = computePassportCropPixels(src.width, src.height, aspect, {
    zoom: settings.zoom,
    panX: settings.panX,
    panY: settings.panY,
  })

  const padPx = settings.paddingMm > 0 ? mmToPx(settings.paddingMm, dpi) : 0
  const innerW = Math.max(16, widthPx - padPx * 2)
  const innerH = Math.max(16, heightPx - padPx * 2)

  const scaledPortrait = drawScaled(src, innerW, innerH, {
    smoothing: 'high',
    sx: cropRect.sx,
    sy: cropRect.sy,
    sw: cropRect.sw,
    sh: cropRect.sh,
  })

  const outCanvas = makeCanvas(widthPx, heightPx)
  const ctx = ctx2d(outCanvas)
  ctx.fillStyle = settings.bgColor || '#ffffff'
  ctx.fillRect(0, 0, outCanvas.width, outCanvas.height)
  ctx.drawImage(scaledPortrait, padPx, padPx, innerW, innerH)

  if (settings.borderPx > 0) {
    const bw = Math.max(1, Math.min(20, Math.round(settings.borderPx)))
    ctx.strokeStyle = settings.borderColor || '#cbd5e1'
    ctx.lineWidth = bw
    ctx.strokeRect(bw / 2, bw / 2, outCanvas.width - bw, outCanvas.height - bw)
  }

  return { canvas: outCanvas, widthPx: outCanvas.width, heightPx: outCanvas.height, widthMm, heightMm }
}

/**
 * Render a printable passport sheet onto a canvas (for JPG sheet export).
 */
export function renderPassportSheetCanvas(
  singlePhotoCanvas: AnyCanvas,
  settings: PassportSettings,
  widthMm: number,
  heightMm: number,
): AnyCanvas {
  const dpi = Math.max(72, Math.min(600, settings.dpi || 300))
  const layout = computeSheetLayout({
    sheetPreset: settings.sheetPreset,
    photoWidthMm: widthMm,
    photoHeightMm: heightMm,
    gapMm: settings.gapMm,
    marginMm: settings.marginMm,
    copies: settings.copies,
    dpi,
  })

  const sheetCanvas = makeCanvas(layout.sheetWidthPx, layout.sheetHeightPx)
  const scaleX = sheetCanvas.width / layout.sheetWidthPx
  const scaleY = sheetCanvas.height / layout.sheetHeightPx
  const ctx = ctx2d(sheetCanvas)
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, sheetCanvas.width, sheetCanvas.height)

  const markLen = Math.max(6, Math.round(mmToPx(2.2, dpi) * scaleX))

  for (const cell of layout.cells) {
    const cx = Math.round(cell.xPx * scaleX)
    const cy = Math.round(cell.yPx * scaleY)
    const cw = Math.round(cell.wPx * scaleX)
    const ch = Math.round(cell.hPx * scaleY)

    ctx.drawImage(singlePhotoCanvas, cx, cy, cw, ch)

    if (settings.cutMarks) {
      ctx.strokeStyle = '#94a3b8'
      ctx.lineWidth = Math.max(1, Math.round(dpi / 300))
      // Subtle hairline outline around photo for easy cutting
      ctx.strokeRect(cx, cy, cw, ch)

      // Corner crop ticks extending outward
      ctx.strokeStyle = '#475569'
      ctx.beginPath()
      // Top-left
      ctx.moveTo(cx - markLen, cy)
      ctx.lineTo(cx - 2, cy)
      ctx.moveTo(cx, cy - markLen)
      ctx.lineTo(cx, cy - 2)
      // Top-right
      ctx.moveTo(cx + cw + 2, cy)
      ctx.lineTo(cx + cw + markLen, cy)
      ctx.moveTo(cx + cw, cy - markLen)
      ctx.lineTo(cx + cw, cy - 2)
      // Bottom-left
      ctx.moveTo(cx - markLen, cy + ch)
      ctx.lineTo(cx - 2, cy + ch)
      ctx.moveTo(cx, cy + ch + 2)
      ctx.lineTo(cx, cy + ch + markLen)
      // Bottom-right
      ctx.moveTo(cx + cw + 2, cy + ch)
      ctx.lineTo(cx + cw + markLen, cy + ch)
      ctx.moveTo(cx + cw, cy + ch + 2)
      ctx.lineTo(cx + cw, cy + ch + markLen)
      ctx.stroke()
    }
  }

  return sheetCanvas
}

/**
 * Generate a vector-sharp printable PDF sheet using `pdf-lib` with exact physical dimensions.
 */
async function buildPassportSheetPdf(
  singleJpegBlob: Blob,
  settings: PassportSettings,
  widthMm: number,
  heightMm: number,
): Promise<Blob> {
  const { PDFDocument, rgb } = await import('pdf-lib')
  const layout = computeSheetLayout({
    sheetPreset: settings.sheetPreset,
    photoWidthMm: widthMm,
    photoHeightMm: heightMm,
    gapMm: settings.gapMm,
    marginMm: settings.marginMm,
    copies: settings.copies,
    dpi: settings.dpi || 300,
  })

  const pdfDoc = await PDFDocument.create()
  const page = pdfDoc.addPage([layout.sheetWidthPt, layout.sheetHeightPt])
  const jpgBytes = new Uint8Array(await singleJpegBlob.arrayBuffer())
  const embeddedJpg = await pdfDoc.embedJpg(jpgBytes)

  const tickPt = 5 // ~1.76 mm crop tick
  const offsetPt = 1.5

  for (const cell of layout.cells) {
    const { pdfXPt: x, pdfYPt: y, pdfWPt: w, pdfHPt: h } = cell
    page.drawImage(embeddedJpg, { x, y, width: w, height: h })

    if (settings.cutMarks) {
      // Hairline border
      page.drawRectangle({
        x,
        y,
        width: w,
        height: h,
        borderColor: rgb(0.72, 0.76, 0.82),
        borderWidth: 0.4,
      })

      const markColor = rgb(0.3, 0.35, 0.42)
      const lw = 0.5
      // Top-left (x, y + h)
      page.drawLine({ start: { x: x - tickPt, y: y + h }, end: { x: x - offsetPt, y: y + h }, thickness: lw, color: markColor })
      page.drawLine({ start: { x, y: y + h + offsetPt }, end: { x, y: y + h + tickPt }, thickness: lw, color: markColor })
      // Top-right (x + w, y + h)
      page.drawLine({ start: { x: x + w + offsetPt, y: y + h }, end: { x: x + w + tickPt, y: y + h }, thickness: lw, color: markColor })
      page.drawLine({ start: { x: x + w, y: y + h + offsetPt }, end: { x: x + w, y: y + h + tickPt }, thickness: lw, color: markColor })
      // Bottom-left (x, y)
      page.drawLine({ start: { x: x - tickPt, y }, end: { x: x - offsetPt, y }, thickness: lw, color: markColor })
      page.drawLine({ start: { x, y: y - tickPt }, end: { x, y: y - offsetPt }, thickness: lw, color: markColor })
      // Bottom-right (x + w, y)
      page.drawLine({ start: { x: x + w + offsetPt, y }, end: { x: x + w + tickPt, y }, thickness: lw, color: markColor })
      page.drawLine({ start: { x: x + w, y: y - tickPt }, end: { x: x + w, y: y - offsetPt }, thickness: lw, color: markColor })
    }
  }

  const pdfBytes = await pdfDoc.save()
  const copy = new Uint8Array(pdfBytes.byteLength)
  copy.set(pdfBytes)
  return new Blob([copy], { type: 'application/pdf' })
}

async function runPassportPhoto(
  files: File[],
  s: PassportSettings,
  proc: ExtraProcContext,
): Promise<OutputFile[]> {
  if (files.length === 0) throw new Error('Please upload a portrait photo first.')
  const file = files[0]
  checkAborted(proc.signal)

  const bmp = await decodeBitmap(file)
  try {
    const { canvas: singleCanvas, widthPx, heightPx, widthMm, heightMm } = renderPassportSingleCanvas(bmp, s)
    const dpi = Math.max(72, Math.min(600, s.dpi || 300))
    const singleJpegBlob = await encodeJpegWithDpiAndTargetKB(
      singleCanvas,
      dpi,
      s.quality,
      s.targetSizeKB,
    )

    const base = stemOf(file.name)
    const out: OutputFile[] = []

    if (s.outputMode === 'single' || s.outputMode === 'both') {
      out.push({
        name: `${base}-passport-${widthPx}x${heightPx}px-${dpi}dpi.jpg`,
        blob: singleJpegBlob,
      })
    }

    checkAborted(proc.signal)

    if (s.outputMode === 'sheet-pdf' || s.outputMode === 'both') {
      const pdfBlob = await buildPassportSheetPdf(singleJpegBlob, s, widthMm, heightMm)
      out.push({
        name: `${base}-passport-sheet-${s.sheetPreset.toUpperCase()}.pdf`,
        blob: pdfBlob,
      })
    }

    if (s.outputMode === 'sheet-jpg') {
      const sheetCanvas = renderPassportSheetCanvas(singleCanvas, s, widthMm, heightMm)
      const sheetJpgBlob = await encodeJpegWithDpiAndTargetKB(sheetCanvas, dpi, s.quality, 0)
      out.push({
        name: `${base}-passport-sheet-${s.sheetPreset.toUpperCase()}.jpg`,
        blob: sheetJpgBlob,
      })
    }

    proc.onProgress(1, 1)
    return out
  } finally {
    bmp.close()
  }
}

/**
 * Apply destructive redaction (Blur / Pixelate / Blackout) onto an existing 2D canvas in-place.
 */
export function applyRedactionToCanvas(canvas: AnyCanvas, settings: BlurSettings): void {
  const ctx = ctx2d(canvas, { willReadFrequently: true })
  const W = canvas.width
  const H = canvas.height
  const imgData = ctx.getImageData(0, 0, W, H)
  const data = imgData.data

  const intensity = Math.max(1, Math.min(100, settings.intensity || 55))
  // Scale blur radius and pixelate block size proportionally to image dimensions so high-res photos are truly redacted
  const scaleFactor = Math.max(1, Math.min(W, H) / 600)
  const blurRadius = Math.max(4, Math.round((4 + (intensity / 100) * 32) * scaleFactor))
  const pixelBlock = Math.max(8, Math.round((6 + (intensity / 100) * 38) * scaleFactor))

  const applyOne = (rx: number, ry: number, rw: number, rh: number, style: BlurSettings['defaultStyle']) => {
    if (style === 'pixelate') {
      pixelateRgba(data, W, H, rx, ry, rw, rh, pixelBlock)
    } else if (style === 'blackout') {
      blackoutRgba(data, W, H, rx, ry, rw, rh, settings.blackoutColor || '#0f172a')
    } else {
      boxBlurRgba(data, W, H, rx, ry, rw, rh, blurRadius, 3)
    }
  }

  if (settings.scope === 'whole') {
    applyOne(0, 0, W, H, settings.defaultStyle)
  } else {
    for (const rawReg of settings.regions) {
      const reg = normalizeRedactRegion(rawReg)
      const rx = Math.round((reg.x / 100) * W)
      const ry = Math.round((reg.y / 100) * H)
      const rw = Math.max(2, Math.round((reg.w / 100) * W))
      const rh = Math.max(2, Math.round((reg.h / 100) * H))
      applyOne(rx, ry, rw, rh, reg.style)
    }
  }

  ctx.putImageData(imgData, 0, 0)
}

async function runBlurImage(
  files: File[],
  s: BlurSettings,
  proc: ExtraProcContext,
): Promise<OutputFile[]> {
  if (files.length === 0) throw new Error('Please upload at least one image.')
  const targetFiles = s.scope === 'whole' ? files : [files[0]]
  const out: OutputFile[] = []

  for (let i = 0; i < targetFiles.length; i++) {
    checkAborted(proc.signal)
    const file = targetFiles[i]
    const bmp = await decodeBitmap(file)
    try {
      const canvas = makeCanvas(bmp.width, bmp.height)
      const ctx = ctx2d(canvas, { willReadFrequently: true })
      ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)

      applyRedactionToCanvas(canvas, s)

      const outType = pickOutputType(file.type)
      const finalCanvas = outType === 'image/jpeg' ? flattenOnto(canvas, '#ffffff') : canvas
      const quality = outType === 'image/png' ? undefined : 0.92
      const { blob, type: actualType } = await encodeVerified(finalCanvas, outType, quality)
      const ext = extFor(actualType)
      out.push({
        name: `${stemOf(file.name)}-redacted.${ext}`,
        blob,
      })
      proc.onProgress(i + 1, targetFiles.length)
    } finally {
      bmp.close()
    }
  }

  return out
}

/**
 * Decode an SVG file to a canvas at the requested width or scale multiplier,
 * handling missing width/height attributes using `viewBox`.
 */
async function decodeSvgToCanvas(
  file: File,
  targetWidth: number,
  scale: number,
): Promise<AnyCanvas> {
  const rawSvg = await file.text()
  const { width, height, patchedSvg } = parseSvgDimensions(rawSvg, targetWidth, scale)
  const svgBlob = new Blob([patchedSvg], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(svgBlob)
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image()
      el.onload = () => resolve(el)
      el.onerror = () => reject(new Error(`Unable to rasterize SVG "${file.name}".`))
      el.src = url
    })
    const canvas = makeCanvas(width, height)
    const ctx = ctx2d(canvas)
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas
  } finally {
    URL.revokeObjectURL(url)
  }
}

/**
 * Extract the largest embedded image from a `.ico` file if `createImageBitmap` cannot decode it directly.
 */
async function decodeIcoFallback(file: File): Promise<ImageBitmap> {
  try {
    return await decodeBitmap(file)
  } catch {
    const buf = await file.arrayBuffer()
    const view = new DataView(buf)
    if (buf.byteLength >= 6 && view.getUint16(0, true) === 0 && view.getUint16(2, true) === 1) {
      const count = view.getUint16(4, true)
      let bestOffset = 0
      let bestSize = 0
      let bestArea = -1
      for (let i = 0; i < count; i++) {
        const entryBase = 6 + i * 16
        if (entryBase + 16 > buf.byteLength) break
        const w = view.getUint8(entryBase) || 256
        const h = view.getUint8(entryBase + 1) || 256
        const size = view.getUint32(entryBase + 8, true)
        const offset = view.getUint32(entryBase + 12, true)
        const area = w * h
        if (area > bestArea && offset + size <= buf.byteLength && size > 0) {
          bestArea = area
          bestOffset = offset
          bestSize = size
        }
      }
      if (bestSize > 0) {
        const slice = new Uint8Array(buf, bestOffset, bestSize)
        const isPng =
          slice.length >= 8 &&
          slice[0] === 0x89 &&
          slice[1] === 0x50 &&
          slice[2] === 0x4e &&
          slice[3] === 0x47
        if (isPng) {
          return decodeBitmap(new Blob([slice], { type: 'image/png' }))
        }
      }
    }
    // Final fallback via HTMLImageElement
    const url = URL.createObjectURL(file)
    try {
      const img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const el = new Image()
        el.onload = () => resolve(el)
        el.onerror = () => reject(new Error(`Browser could not decode "${file.name}".`))
        el.src = url
      })
      return createImageBitmap(img)
    } finally {
      URL.revokeObjectURL(url)
    }
  }
}

/**
 * Decode any supported universal converter input (JPG, PNG, WebP, AVIF, GIF, BMP, ICO, SVG) onto a canvas.
 */
export async function decodeAnyImageToCanvas(
  file: File,
  svgWidth = 0,
  svgScale = 2,
): Promise<AnyCanvas> {
  const lower = file.name.toLowerCase()
  const isSvg = file.type === 'image/svg+xml' || lower.endsWith('.svg')
  if (isSvg) {
    return decodeSvgToCanvas(file, svgWidth, svgScale)
  }

  const isIco =
    file.type === 'image/x-icon' ||
    file.type === 'image/vnd.microsoft.icon' ||
    lower.endsWith('.ico')

  const bmp = isIco ? await decodeIcoFallback(file) : await decodeBitmap(file)
  try {
    const canvas = makeCanvas(bmp.width, bmp.height)
    const ctx = ctx2d(canvas)
    ctx.drawImage(bmp, 0, 0, canvas.width, canvas.height)
    return canvas
  } finally {
    bmp.close()
  }
}

async function encodeUniversalFormat(
  canvas: AnyCanvas,
  settings: ImageConverterSettings,
): Promise<{ blob: Blob; actualType: string; fellBack: boolean }> {
  const targetCanvas =
    settings.outputFormat === 'image/jpeg'
      ? flattenOnto(canvas, settings.bgColor || '#ffffff')
      : canvas

  const q =
    settings.outputFormat === 'image/png'
      ? undefined
      : Math.max(0.1, Math.min(1, (settings.quality || 90) / 100))

  const res = await encodeVerified(targetCanvas, settings.outputFormat, q)

  // If AVIF was requested and native canvas fell back to PNG, try @jsquash/avif WASM encoder
  if (settings.outputFormat === 'image/avif' && res.fellBack) {
    try {
      const avifMod = await import('@jsquash/avif')
      const ctx = ctx2d(targetCanvas)
      const imgData = ctx.getImageData(0, 0, targetCanvas.width, targetCanvas.height)
      const avifBuf = await avifMod.encode(imgData, {
        quality: Math.max(1, Math.min(100, Math.round(settings.quality || 80))),
      })
      return {
        blob: new Blob([avifBuf], { type: 'image/avif' }),
        actualType: 'image/avif',
        fellBack: false,
      }
    } catch {
      // If WASM encoder is unavailable, return the verified fallback cleanly
      return { blob: res.blob, actualType: res.type, fellBack: true }
    }
  }

  return { blob: res.blob, actualType: res.type, fellBack: res.fellBack }
}

async function runImageConverter(
  files: File[],
  s: ImageConverterSettings,
  proc: ExtraProcContext,
): Promise<OutputFile[]> {
  if (files.length === 0) throw new Error('Please upload at least one image to convert.')
  const out: OutputFile[] = []

  for (let i = 0; i < files.length; i++) {
    checkAborted(proc.signal)
    const file = files[i]
    const canvas = await decodeAnyImageToCanvas(file, s.svgWidth, s.svgScale)
    const { blob, actualType } = await encodeUniversalFormat(canvas, s)
    const ext = extFor(actualType)
    out.push({
      name: `${stemOf(file.name)}.${ext}`,
      blob,
    })
    proc.onProgress(i + 1, files.length)
  }

  return out
}

/**
 * Convert a single image file into a Base64 snippet and metadata.
 */
export async function buildBase64ForFile(
  file: File,
  s: Base64Settings,
): Promise<{
  snippet: string
  rawBase64: string
  mime: string
  width: number
  height: number
  byteLength: number
}> {
  const needsResize = s.maxEdge > 0
  const needsFormatChange = s.outputFormat !== 'keep'
  const lower = file.name.toLowerCase()
  const isSvg = file.type === 'image/svg+xml' || lower.endsWith('.svg')

  if (!needsResize && !needsFormatChange && !isSvg) {
    // Keep original file bytes untouched for maximum fidelity, and probe dimensions if possible
    let width = 0
    let height = 0
    try {
      const bmp = await decodeBitmap(file)
      width = bmp.width
      height = bmp.height
      bmp.close()
    } catch {
      // Non-bitmap or exotic format
    }
    const bytes = new Uint8Array(await file.arrayBuffer())
    const mime = file.type || 'image/png'
    const rawBase64 = uint8ToBase64(bytes)
    const snippet = formatBase64Snippet({
      rawBase64,
      mime,
      fileName: file.name,
      width: width || undefined,
      height: height || undefined,
      mode: s.mode,
    })
    return { snippet, rawBase64, mime, width, height, byteLength: bytes.byteLength }
  }

  if (isSvg && !needsResize && !needsFormatChange) {
    const rawSvg = await file.text()
    const { width, height } = parseSvgDimensions(rawSvg, 0, 1)
    const bytes = new Uint8Array(await file.arrayBuffer())
    const mime = 'image/svg+xml'
    const rawBase64 = uint8ToBase64(bytes)
    const snippet = formatBase64Snippet({
      rawBase64,
      mime,
      fileName: file.name,
      width,
      height,
      mode: s.mode,
    })
    return { snippet, rawBase64, mime, width, height, byteLength: bytes.byteLength }
  }

  // Decode and optionally resize / re-encode
  const srcCanvas = await decodeAnyImageToCanvas(file, s.maxEdge || 0, 1)
  let workCanvas = srcCanvas
  if (s.maxEdge > 0 && Math.max(srcCanvas.width, srcCanvas.height) > s.maxEdge) {
    const scale = s.maxEdge / Math.max(srcCanvas.width, srcCanvas.height)
    const dstW = Math.max(1, Math.round(srcCanvas.width * scale))
    const dstH = Math.max(1, Math.round(srcCanvas.height * scale))
    workCanvas = drawScaled(srcCanvas, dstW, dstH, { smoothing: 'high' })
  }

  const targetType =
    s.outputFormat === 'keep' ? pickOutputType(file.type) : s.outputFormat
  const finalCanvas =
    targetType === 'image/jpeg' ? flattenOnto(workCanvas, '#ffffff') : workCanvas
  const q =
    targetType === 'image/png'
      ? undefined
      : Math.max(0.1, Math.min(1, (s.quality || 88) / 100))

  const { blob, type: actualMime } = await encodeVerified(finalCanvas, targetType, q)
  const bytes = new Uint8Array(await blob.arrayBuffer())
  const rawBase64 = uint8ToBase64(bytes)
  const snippet = formatBase64Snippet({
    rawBase64,
    mime: actualMime,
    fileName: file.name,
    width: finalCanvas.width,
    height: finalCanvas.height,
    mode: s.mode,
  })

  return {
    snippet,
    rawBase64,
    mime: actualMime,
    width: finalCanvas.width,
    height: finalCanvas.height,
    byteLength: bytes.byteLength,
  }
}

async function runImageToBase64(
  files: File[],
  s: Base64Settings,
  proc: ExtraProcContext,
): Promise<OutputFile[]> {
  if (files.length === 0) throw new Error('Please upload at least one image.')
  const out: OutputFile[] = []

  for (let i = 0; i < files.length; i++) {
    checkAborted(proc.signal)
    const file = files[i]
    const { snippet } = await buildBase64ForFile(file, s)
    const blob = new Blob([snippet], { type: 'text/plain;charset=utf-8' })
    out.push({
      name: `${stemOf(file.name)}-base64.txt`,
      blob,
    })
    proc.onProgress(i + 1, files.length)
  }

  return out
}

function addRoundedRectPath(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  const rad = Math.max(0, Math.min(r, w / 2, h / 2))
  ctx.beginPath()
  if (rad <= 0) {
    ctx.rect(x, y, w, h)
  } else {
    ctx.moveTo(x + rad, y)
    ctx.lineTo(x + w - rad, y)
    ctx.quadraticCurveTo(x + w, y, x + w, y + rad)
    ctx.lineTo(x + w, y + h - rad)
    ctx.quadraticCurveTo(x + w, y + h, x + w - rad, y + h)
    ctx.lineTo(x + rad, y + h)
    ctx.quadraticCurveTo(x, y + h, x, y + h - rad)
    ctx.lineTo(x, y + rad)
    ctx.quadraticCurveTo(x, y, x + rad, y)
  }
  ctx.closePath()
}

/**
 * Render a multi-image collage onto a canvas. Used both by `runImageExtra` and the live preview panel.
 */
export async function renderCollageToCanvas(
  files: File[],
  s: CollageSettings,
  previewMaxWidth?: number,
): Promise<AnyCanvas> {
  const slice = files.slice(0, 12)
  if (slice.length === 0) {
    throw new Error('Please upload at least 2 images to create a collage.')
  }

  const targetWidth = previewMaxWidth
    ? Math.min(previewMaxWidth, s.outputWidth || 1600)
    : s.outputWidth || 1600
  const scaleRatio = targetWidth / Math.max(200, s.outputWidth || 1600)

  const layout = computeCollageLayout({
    count: slice.length,
    layout: s.layout,
    cols: s.cols,
    outputWidth: targetWidth,
    cellAspect: s.cellAspect,
    gap: Math.round(s.gap * scaleRatio),
    padding: Math.round(s.padding * scaleRatio),
  })

  const canvas = makeCanvas(layout.width, layout.height)
  const scaleX = canvas.width / layout.width
  const scaleY = canvas.height / layout.height
  const ctx = ctx2d(canvas)

  const [r, g, b] = parseHexRgb(s.bgColor || '#ffffff')
  ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
  ctx.fillRect(0, 0, canvas.width, canvas.height)

  const radiusPx = Math.round(s.cornerRadius * scaleRatio * Math.min(scaleX, scaleY))

  for (let i = 0; i < slice.length; i++) {
    const cell = layout.cells[i]
    const cx = Math.round(cell.x * scaleX)
    const cy = Math.round(cell.y * scaleY)
    const cw = Math.round(cell.w * scaleX)
    const ch = Math.round(cell.h * scaleY)

    const bmp = await decodeBitmap(slice[i])
    try {
      ctx.save()
      addRoundedRectPath(ctx, cx, cy, cw, ch, radiusPx)
      ctx.clip()

      const rect = computeCoverContainRect(bmp.width, bmp.height, cw, ch, s.fit)
      const scaledTile = drawScaled(bmp, rect.dw, rect.dh, {
        smoothing: 'high',
        sx: rect.sx,
        sy: rect.sy,
        sw: rect.sw,
        sh: rect.sh,
      })
      ctx.drawImage(scaledTile, cx + rect.dx, cy + rect.dy, rect.dw, rect.dh)
      ctx.restore()
    } finally {
      bmp.close()
    }
  }

  return canvas
}

async function runImageCollage(
  files: File[],
  s: CollageSettings,
  proc: ExtraProcContext,
): Promise<OutputFile[]> {
  if (files.length < 2) {
    throw new Error('Please upload at least 2 images (up to 12) to build a collage.')
  }
  checkAborted(proc.signal)
  const canvas = await renderCollageToCanvas(files, s)
  checkAborted(proc.signal)

  const q =
    s.outputFormat === 'image/png'
      ? undefined
      : Math.max(0.1, Math.min(1, (s.quality || 92) / 100))
  const { blob, type: actualType } = await encodeVerified(canvas, s.outputFormat, q)
  const ext = extFor(actualType)
  proc.onProgress(files.length, files.length)

  return [
    {
      name: `collage-${files.slice(0, 12).length}-photos.${ext}`,
      blob,
    },
  ]
}

/**
 * Main dispatcher for all 7 extra image tools.
 * Dynamically imports heavy modules (`./heic`, `./gif`) only when needed.
 */
export async function runImageExtra(
  id: ImageExtraToolId,
  files: File[],
  s: ImageExtraSettings,
  proc: ExtraProcContext,
): Promise<OutputFile[]> {
  checkAborted(proc.signal)

  switch (id) {
    case 'passport-photo':
      return runPassportPhoto(files, s.passport, proc)

    case 'heic-to-jpg': {
      if (files.length === 0) throw new Error('Please upload at least one HEIC/HEIF photo.')
      const { convertHeicFile } = await import('./heic')
      const out: OutputFile[] = []
      for (let i = 0; i < files.length; i++) {
        checkAborted(proc.signal)
        const { output } = await convertHeicFile(files[i], s.heic)
        out.push(output)
        proc.onProgress(i + 1, files.length)
      }
      return out
    }

    case 'blur-image':
      return runBlurImage(files, s.blur, proc)

    case 'image-converter':
      return runImageConverter(files, s.converter, proc)

    case 'image-to-base64':
      return runImageToBase64(files, s.base64, proc)

    case 'image-collage':
      return runImageCollage(files, s.collage, proc)

    case 'gif-maker': {
      if (files.length === 0) throw new Error('Please upload at least one image to create a GIF.')
      const { buildAnimatedGif } = await import('./gif')
      const { output } = await buildAnimatedGif(files, s.gif, proc)
      return [output]
    }
  }
}
