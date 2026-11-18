import type {
  PassportPresetId,
  PassportSheetPreset,
  RedactRegion,
  CollageLayoutMode,
  Base64FormatMode,
} from './imageExtraTypes'
import { PASSPORT_PRESETS } from './imageExtraTypes'

/** Convert millimeters to exact integer pixels at `dpi`. */
export function mmToPx(mm: number, dpi = 300): number {
  if (mm <= 0 || dpi <= 0) return 1
  return Math.max(1, Math.round((mm / 25.4) * dpi))
}

/** Convert millimeters to PDF points (72 pt = 1 inch = 25.4 mm). */
export function mmToPt(mm: number): number {
  return (Math.max(0, mm) / 25.4) * 72
}

/** Resolve active passport dimensions in mm and px. */
export function resolvePassportDimensions(
  presetId: PassportPresetId,
  customWidthMm: number,
  customHeightMm: number,
  dpi = 300,
): { widthMm: number; heightMm: number; widthPx: number; heightPx: number; aspect: number } {
  const preset = PASSPORT_PRESETS.find((p) => p.id === presetId)
  const widthMm =
    presetId === 'custom'
      ? Math.max(10, Math.min(200, customWidthMm || 35))
      : (preset?.widthMm ?? 35)
  const heightMm =
    presetId === 'custom'
      ? Math.max(10, Math.min(250, customHeightMm || 45))
      : (preset?.heightMm ?? 45)
  const widthPx = mmToPx(widthMm, dpi)
  const heightPx = mmToPx(heightMm, dpi)
  return {
    widthMm,
    heightMm,
    widthPx,
    heightPx,
    aspect: widthMm / heightMm,
  }
}

/**
 * Compute aspect-locked source crop rectangle in pixels given zoom (>= 1) and
 * panX / panY in [-100, 100].
 */
export function computePassportCropPixels(
  srcW: number,
  srcH: number,
  targetAspect: number,
  crop: { zoom: number; panX: number; panY: number },
): { sx: number; sy: number; sw: number; sh: number } {
  const safeW = Math.max(1, srcW)
  const safeH = Math.max(1, srcH)
  const safeAspect = targetAspect > 0 ? targetAspect : 35 / 45

  // Largest box of `safeAspect` that fits inside safeW x safeH
  let baseW = safeW
  let baseH = safeW / safeAspect
  if (baseH > safeH) {
    baseH = safeH
    baseW = safeH * safeAspect
  }

  const zoom = Math.max(1, Math.min(5, crop.zoom || 1))
  const sw = Math.max(1, Math.min(safeW, baseW / zoom))
  const sh = Math.max(1, Math.min(safeH, baseH / zoom))

  const slackX = Math.max(0, safeW - sw)
  const slackY = Math.max(0, safeH - sh)

  const panX = Math.max(-100, Math.min(100, crop.panX || 0))
  const panY = Math.max(-100, Math.min(100, crop.panY || 0))

  const sx = Math.max(0, Math.min(slackX, slackX * (0.5 + panX / 200)))
  const sy = Math.max(0, Math.min(slackY, slackY * (0.5 + panY / 200)))

  return {
    sx: Math.round(sx),
    sy: Math.round(sy),
    sw: Math.max(1, Math.round(sw)),
    sh: Math.max(1, Math.round(sh)),
  }
}

export interface SheetCell {
  index: number
  row: number
  col: number
  xMm: number
  yMm: number
  wMm: number
  hMm: number
  xPx: number
  yPx: number
  wPx: number
  hPx: number
  /** PDF coordinates (origin at bottom-left, in points) */
  pdfXPt: number
  pdfYPt: number
  pdfWPt: number
  pdfHPt: number
}

export interface SheetLayout {
  sheetPreset: PassportSheetPreset
  sheetLabel: string
  sheetWidthMm: number
  sheetHeightMm: number
  sheetWidthPx: number
  sheetHeightPx: number
  sheetWidthPt: number
  sheetHeightPt: number
  cols: number
  rows: number
  maxCapacity: number
  cells: SheetCell[]
}

export const SHEET_DIMENSIONS_MM: Record<
  PassportSheetPreset,
  { widthMm: number; heightMm: number; label: string }
> = {
  '4x6': { widthMm: 152.4, heightMm: 101.6, label: '4 × 6 in (10 × 15 cm Landscape Photo Paper)' },
  '5x7': { widthMm: 177.8, heightMm: 127.0, label: '5 × 7 in (13 × 18 cm Landscape Photo Paper)' },
  a4: { widthMm: 210.0, heightMm: 297.0, label: 'A4 Portrait (210 × 297 mm)' },
}

/**
 * Compute tiling layout of passport photos onto a printable sheet (A4, 4x6 in, 5x7 in).
 * Automatically centers the grid of photos on the page.
 */
export function computeSheetLayout(opts: {
  sheetPreset: PassportSheetPreset
  photoWidthMm: number
  photoHeightMm: number
  gapMm: number
  marginMm: number
  copies: number
  dpi?: number
}): SheetLayout {
  const dpi = opts.dpi ?? 300
  const sheetMeta = SHEET_DIMENSIONS_MM[opts.sheetPreset] ?? SHEET_DIMENSIONS_MM['4x6']
  const sheetWidthMm = sheetMeta.widthMm
  const sheetHeightMm = sheetMeta.heightMm

  const pw = Math.max(10, opts.photoWidthMm)
  const ph = Math.max(10, opts.photoHeightMm)
  const gap = Math.max(0, opts.gapMm)
  const margin = Math.max(0, opts.marginMm)

  const usableW = Math.max(pw, sheetWidthMm - margin * 2)
  const usableH = Math.max(ph, sheetHeightMm - margin * 2)

  const cols = Math.max(1, Math.floor((usableW + gap) / (pw + gap)))
  const rows = Math.max(1, Math.floor((usableH + gap) / (ph + gap)))
  const maxCapacity = cols * rows
  const requestedCopies = opts.copies > 0 ? Math.min(maxCapacity, opts.copies) : maxCapacity

  const actualRowsUsed = Math.max(1, Math.ceil(requestedCopies / cols))
  const actualColsUsed = Math.min(cols, requestedCopies)

  const gridW = actualColsUsed * pw + Math.max(0, actualColsUsed - 1) * gap
  const gridH = actualRowsUsed * ph + Math.max(0, actualRowsUsed - 1) * gap

  const startXMm = Math.max(margin, (sheetWidthMm - gridW) / 2)
  const startYMm = Math.max(margin, (sheetHeightMm - gridH) / 2)

  const sheetWidthPx = mmToPx(sheetWidthMm, dpi)
  const sheetHeightPx = mmToPx(sheetHeightMm, dpi)
  const sheetWidthPt = mmToPt(sheetWidthMm)
  const sheetHeightPt = mmToPt(sheetHeightMm)

  const cells: SheetCell[] = []
  for (let i = 0; i < requestedCopies; i++) {
    const row = Math.floor(i / cols)
    const col = i % cols
    const xMm = startXMm + col * (pw + gap)
    const yMm = startYMm + row * (ph + gap)
    const pdfWPt = mmToPt(pw)
    const pdfHPt = mmToPt(ph)
    const pdfXPt = mmToPt(xMm)
    // PDF origin is bottom-left
    const pdfYPt = sheetHeightPt - mmToPt(yMm) - pdfHPt

    cells.push({
      index: i,
      row,
      col,
      xMm,
      yMm,
      wMm: pw,
      hMm: ph,
      xPx: mmToPx(xMm, dpi),
      yPx: mmToPx(yMm, dpi),
      wPx: mmToPx(pw, dpi),
      hPx: mmToPx(ph, dpi),
      pdfXPt,
      pdfYPt,
      pdfWPt,
      pdfHPt,
    })
  }

  return {
    sheetPreset: opts.sheetPreset,
    sheetLabel: sheetMeta.label,
    sheetWidthMm,
    sheetHeightMm,
    sheetWidthPx,
    sheetHeightPx,
    sheetWidthPt,
    sheetHeightPt,
    cols,
    rows,
    maxCapacity,
    cells,
  }
}

/**
 * Patch or insert a JPEG JFIF APP0 marker (`FF E0`) so the file header records
 * exact physical print density (`units = 1` dots per inch, `Xdensity = dpi`, `Ydensity = dpi`).
 * If input bytes do not start with JPEG SOI (`FF D8`), returns the input unchanged.
 */
export function patchJpegJfifDpi(jpegBytes: Uint8Array, dpi: number): Uint8Array {
  if (jpegBytes.length < 4 || jpegBytes[0] !== 0xff || jpegBytes[1] !== 0xd8) {
    return jpegBytes
  }
  const safeDpi = Math.max(1, Math.min(65535, Math.round(dpi || 300)))
  const hi = (safeDpi >> 8) & 0xff
  const lo = safeDpi & 0xff

  // Check if an APP0 JFIF segment is already right at offset 2:
  // [2]=0xFF, [3]=0xE0, [4..5]=length (>=16), [6..10]="JFIF\0", [11..12]=version, [13]=units, [14..15]=Xdensity, [16..17]=Ydensity
  if (
    jpegBytes.length >= 20 &&
    jpegBytes[2] === 0xff &&
    jpegBytes[3] === 0xe0 &&
    jpegBytes[6] === 0x4a && // 'J'
    jpegBytes[7] === 0x46 && // 'F'
    jpegBytes[8] === 0x49 && // 'I'
    jpegBytes[9] === 0x46 && // 'F'
    jpegBytes[10] === 0x00
  ) {
    const out = new Uint8Array(jpegBytes)
    out[13] = 1 // 1 = dots per inch
    out[14] = hi
    out[15] = lo
    out[16] = hi
    out[17] = lo
    return out
  }

  // Otherwise insert a standard 18-byte APP0 JFIF segment immediately after SOI (FF D8)
  const app0 = new Uint8Array([
    0xff, 0xe0, // APP0 marker
    0x00, 0x10, // Length = 16 bytes
    0x4a, 0x46, 0x49, 0x46, 0x00, // "JFIF\0"
    0x01, 0x01, // Version 1.01
    0x01, // Units: 1 = dots per inch (DPI)
    hi, lo, // Xdensity
    hi, lo, // Ydensity
    0x00, 0x00, // No thumbnail (0x0)
  ])

  const out = new Uint8Array(jpegBytes.length + app0.length)
  out[0] = 0xff
  out[1] = 0xd8
  out.set(app0, 2)
  out.set(jpegBytes.subarray(2), 2 + app0.length)
  return out
}

/** Read JFIF DPI from JPEG bytes (used for verification and unit tests). */
export function readJpegJfifDpi(jpegBytes: Uint8Array): { units: number; xDpi: number; yDpi: number } | null {
  if (
    jpegBytes.length >= 20 &&
    jpegBytes[0] === 0xff &&
    jpegBytes[1] === 0xd8 &&
    jpegBytes[2] === 0xff &&
    jpegBytes[3] === 0xe0 &&
    jpegBytes[6] === 0x4a &&
    jpegBytes[7] === 0x46 &&
    jpegBytes[8] === 0x49 &&
    jpegBytes[9] === 0x46 &&
    jpegBytes[10] === 0x00
  ) {
    return {
      units: jpegBytes[13],
      xDpi: (jpegBytes[14] << 8) | jpegBytes[15],
      yDpi: (jpegBytes[16] << 8) | jpegBytes[17],
    }
  }
  return null
}

/** Normalize a redaction region so x, y, w, h stay within [0..100] percentages. */
export function normalizeRedactRegion(r: RedactRegion): RedactRegion {
  let x = Number.isFinite(r.x) ? r.x : 0
  let y = Number.isFinite(r.y) ? r.y : 0
  let w = Number.isFinite(r.w) ? r.w : 10
  let h = Number.isFinite(r.h) ? r.h : 10

  if (w < 0) {
    x += w
    w = -w
  }
  if (h < 0) {
    y += h
    h = -h
  }

  x = Math.max(0, Math.min(99, x))
  y = Math.max(0, Math.min(99, y))
  w = Math.max(1, Math.min(100 - x, w))
  h = Math.max(1, Math.min(100 - y, h))

  return {
    id: r.id,
    x: Math.round(x * 10) / 10,
    y: Math.round(y * 10) / 10,
    w: Math.round(w * 10) / 10,
    h: Math.round(h * 10) / 10,
    style: r.style,
  }
}

/** Parse a `#rrggbb` or `#rgb` hex color string into `[r, g, b]`. */
export function parseHexRgb(hex: string): [number, number, number] {
  const clean = (hex || '#000000').replace(/^#/, '').trim()
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16) || 0
    const g = parseInt(clean[1] + clean[1], 16) || 0
    const b = parseInt(clean[2] + clean[2], 16) || 0
    return [r, g, b]
  }
  const num = parseInt(clean.slice(0, 6), 16)
  if (Number.isNaN(num)) return [0, 0, 0]
  return [(num >> 16) & 0xff, (num >> 8) & 0xff, num & 0xff]
}

/**
 * Multi-pass separable box blur on RGBA `Uint8ClampedArray` inside a rectangular region `(rx, ry, rw, rh)`.
 * Destructively replaces pixel data in-place. Works identically in all browsers and workers without `ctx.filter`.
 */
export function boxBlurRgba(
  data: Uint8ClampedArray,
  imgW: number,
  imgH: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  radius: number,
  passes = 3,
): void {
  const x0 = Math.max(0, Math.min(imgW - 1, Math.floor(rx)))
  const y0 = Math.max(0, Math.min(imgH - 1, Math.floor(ry)))
  const x1 = Math.max(x0 + 1, Math.min(imgW, Math.ceil(rx + rw)))
  const y1 = Math.max(y0 + 1, Math.min(imgH, Math.ceil(ry + rh)))
  const w = x1 - x0
  const h = y1 - y0
  if (w <= 1 && h <= 1) return

  const rad = Math.max(1, Math.min(120, Math.round(radius)))
  const numPasses = Math.max(1, Math.min(5, passes))

  // Extract region buffer (w * h * 4)
  const bufA = new Uint8ClampedArray(w * h * 4)
  const bufB = new Uint8ClampedArray(w * h * 4)

  for (let y = 0; y < h; y++) {
    const srcRowStart = ((y0 + y) * imgW + x0) * 4
    const dstRowStart = y * w * 4
    bufA.set(data.subarray(srcRowStart, srcRowStart + w * 4), dstRowStart)
  }

  const diam = rad * 2 + 1

  for (let p = 0; p < numPasses; p++) {
    // Horizontal pass: bufA -> bufB
    for (let y = 0; y < h; y++) {
      let rSum = 0
      let gSum = 0
      let bSum = 0
      let aSum = 0
      const rowOffset = y * w * 4

      for (let k = -rad; k <= rad; k++) {
        const cx = Math.max(0, Math.min(w - 1, k))
        const idx = rowOffset + cx * 4
        rSum += bufA[idx]
        gSum += bufA[idx + 1]
        bSum += bufA[idx + 2]
        aSum += bufA[idx + 3]
      }

      for (let x = 0; x < w; x++) {
        const outIdx = rowOffset + x * 4
        bufB[outIdx] = (rSum / diam) | 0
        bufB[outIdx + 1] = (gSum / diam) | 0
        bufB[outIdx + 2] = (bSum / diam) | 0
        bufB[outIdx + 3] = (aSum / diam) | 0

        const leftX = Math.max(0, x - rad)
        const rightX = Math.min(w - 1, x + rad + 1)
        const leftIdx = rowOffset + leftX * 4
        const rightIdx = rowOffset + rightX * 4

        rSum += bufA[rightIdx] - bufA[leftIdx]
        gSum += bufA[rightIdx + 1] - bufA[leftIdx + 1]
        bSum += bufA[rightIdx + 2] - bufA[leftIdx + 2]
        aSum += bufA[rightIdx + 3] - bufA[leftIdx + 3]
      }
    }

    // Vertical pass: bufB -> bufA
    for (let x = 0; x < w; x++) {
      let rSum = 0
      let gSum = 0
      let bSum = 0
      let aSum = 0
      const colOffset = x * 4
      const stride = w * 4

      for (let k = -rad; k <= rad; k++) {
        const cy = Math.max(0, Math.min(h - 1, k))
        const idx = cy * stride + colOffset
        rSum += bufB[idx]
        gSum += bufB[idx + 1]
        bSum += bufB[idx + 2]
        aSum += bufB[idx + 3]
      }

      for (let y = 0; y < h; y++) {
        const outIdx = y * stride + colOffset
        bufA[outIdx] = (rSum / diam) | 0
        bufA[outIdx + 1] = (gSum / diam) | 0
        bufA[outIdx + 2] = (bSum / diam) | 0
        bufA[outIdx + 3] = (aSum / diam) | 0

        const topY = Math.max(0, y - rad)
        const botY = Math.min(h - 1, y + rad + 1)
        const topIdx = topY * stride + colOffset
        const botIdx = botY * stride + colOffset

        rSum += bufB[botIdx] - bufB[topIdx]
        gSum += bufB[botIdx + 1] - bufB[topIdx + 1]
        bSum += bufB[botIdx + 2] - bufB[topIdx + 2]
        aSum += bufB[botIdx + 3] - bufB[topIdx + 3]
      }
    }
  }

  // Write blurred pixels back to `data`
  for (let y = 0; y < h; y++) {
    const dstRowStart = ((y0 + y) * imgW + x0) * 4
    const srcRowStart = y * w * 4
    data.set(bufA.subarray(srcRowStart, srcRowStart + w * 4), dstRowStart)
  }
}

/**
 * Destructive block-pixelation on RGBA `Uint8ClampedArray` inside `(rx, ry, rw, rh)`.
 * Replaces every `blockSize × blockSize` block with its uniform average color.
 */
export function pixelateRgba(
  data: Uint8ClampedArray,
  imgW: number,
  imgH: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  blockSize: number,
): void {
  const x0 = Math.max(0, Math.min(imgW - 1, Math.floor(rx)))
  const y0 = Math.max(0, Math.min(imgH - 1, Math.floor(ry)))
  const x1 = Math.max(x0 + 1, Math.min(imgW, Math.ceil(rx + rw)))
  const y1 = Math.max(y0 + 1, Math.min(imgH, Math.ceil(ry + rh)))
  const block = Math.max(4, Math.round(blockSize))

  for (let by = y0; by < y1; by += block) {
    const bh = Math.min(block, y1 - by)
    for (let bx = x0; bx < x1; bx += block) {
      const bw = Math.min(block, x1 - bx)
      let rSum = 0
      let gSum = 0
      let bSum = 0
      let aSum = 0
      const count = bw * bh

      for (let py = by; py < by + bh; py++) {
        const rowBase = py * imgW * 4
        for (let px = bx; px < bx + bw; px++) {
          const idx = rowBase + px * 4
          rSum += data[idx]
          gSum += data[idx + 1]
          bSum += data[idx + 2]
          aSum += data[idx + 3]
        }
      }

      const rAvg = Math.round(rSum / count)
      const gAvg = Math.round(gSum / count)
      const bAvg = Math.round(bSum / count)
      const aAvg = Math.round(aSum / count)

      for (let py = by; py < by + bh; py++) {
        const rowBase = py * imgW * 4
        for (let px = bx; px < bx + bw; px++) {
          const idx = rowBase + px * 4
          data[idx] = rAvg
          data[idx + 1] = gAvg
          data[idx + 2] = bAvg
          data[idx + 3] = aAvg
        }
      }
    }
  }
}

/**
 * Destructive solid-color blackout redaction on RGBA `Uint8ClampedArray` inside `(rx, ry, rw, rh)`.
 */
export function blackoutRgba(
  data: Uint8ClampedArray,
  imgW: number,
  imgH: number,
  rx: number,
  ry: number,
  rw: number,
  rh: number,
  colorHex = '#000000',
): void {
  const x0 = Math.max(0, Math.min(imgW - 1, Math.floor(rx)))
  const y0 = Math.max(0, Math.min(imgH - 1, Math.floor(ry)))
  const x1 = Math.max(x0 + 1, Math.min(imgW, Math.ceil(rx + rw)))
  const y1 = Math.max(y0 + 1, Math.min(imgH, Math.ceil(ry + rh)))
  const [r, g, b] = parseHexRgb(colorHex)

  for (let py = y0; py < y1; py++) {
    const rowBase = py * imgW * 4
    for (let px = x0; px < x1; px++) {
      const idx = rowBase + px * 4
      data[idx] = r
      data[idx + 1] = g
      data[idx + 2] = b
      data[idx + 3] = 255
    }
  }
}

/**
 * Feather a 1-channel alpha mask (`width * height` bytes) using a 2-pass separable box blur.
 */
export function featherAlphaMask(
  mask: Uint8Array | Uint8ClampedArray,
  width: number,
  height: number,
  radiusPx: number,
): Uint8ClampedArray<ArrayBuffer> {
  const out = new Uint8ClampedArray(mask.length)
  out.set(mask)
  const rad = Math.round(radiusPx)
  if (rad <= 0 || width <= 2 || height <= 2) return out

  const tmp = new Uint8ClampedArray(width * height)
  const diam = rad * 2 + 1

  for (let pass = 0; pass < 2; pass++) {
    // Horizontal: out -> tmp
    for (let y = 0; y < height; y++) {
      const rowOffset = y * width
      let sum = 0
      for (let k = -rad; k <= rad; k++) {
        sum += out[rowOffset + Math.max(0, Math.min(width - 1, k))]
      }
      for (let x = 0; x < width; x++) {
        tmp[rowOffset + x] = (sum / diam) | 0
        const leftX = Math.max(0, x - rad)
        const rightX = Math.min(width - 1, x + rad + 1)
        sum += out[rowOffset + rightX] - out[rowOffset + leftX]
      }
    }
    // Vertical: tmp -> out
    for (let x = 0; x < width; x++) {
      let sum = 0
      for (let k = -rad; k <= rad; k++) {
        sum += tmp[Math.max(0, Math.min(height - 1, k)) * width + x]
      }
      for (let y = 0; y < height; y++) {
        out[y * width + x] = (sum / diam) | 0
        const topY = Math.max(0, y - rad)
        const botY = Math.min(height - 1, y + rad + 1)
        sum += tmp[botY * width + x] - tmp[topY * width + x]
      }
    }
  }
  return out
}

export interface CollageCellRect {
  index: number
  row: number
  col: number
  x: number
  y: number
  w: number
  h: number
}

export interface CollageLayoutResult {
  width: number
  height: number
  rows: number
  cols: number
  cells: CollageCellRect[]
}

/**
 * Compute collage canvas dimensions and per-image cell rectangles for 1..12 images.
 */
export function computeCollageLayout(opts: {
  count: number
  layout: CollageLayoutMode
  cols: number
  outputWidth: number
  cellAspect: number
  gap: number
  padding: number
}): CollageLayoutResult {
  const n = Math.max(1, Math.min(12, opts.count))
  const totalW = Math.max(200, Math.min(6000, Math.round(opts.outputWidth || 1600)))
  const pad = Math.max(0, Math.min(200, Math.round(opts.padding ?? 24)))
  const gap = Math.max(0, Math.min(200, Math.round(opts.gap ?? 16)))
  const aspect = opts.cellAspect > 0 ? opts.cellAspect : 1

  let cols: number
  if (opts.layout === 'horizontal') {
    cols = n
  } else if (opts.layout === 'vertical') {
    cols = 1
  } else {
    cols = opts.cols > 0 ? Math.min(n, Math.round(opts.cols)) : Math.ceil(Math.sqrt(n))
  }
  const rows = Math.max(1, Math.ceil(n / cols))

  const innerW = Math.max(cols * 16, totalW - pad * 2 - (cols - 1) * gap)
  const cellW = Math.max(16, Math.floor(innerW / cols))
  const cellH = Math.max(16, Math.round(cellW / aspect))

  const actualW = pad * 2 + cols * cellW + (cols - 1) * gap
  const actualH = pad * 2 + rows * cellH + (rows - 1) * gap

  const cells: CollageCellRect[] = []
  for (let i = 0; i < n; i++) {
    const row = Math.floor(i / cols)
    const col = i % cols
    cells.push({
      index: i,
      row,
      col,
      x: pad + col * (cellW + gap),
      y: pad + row * (cellH + gap),
      w: cellW,
      h: cellH,
    })
  }

  return {
    width: actualW,
    height: actualH,
    rows,
    cols,
    cells,
  }
}

/**
 * Compute source & destination draw rectangles for `cover` (center-crop to fill)
 * or `contain` (letterbox inside cell).
 */
export function computeCoverContainRect(
  srcW: number,
  srcH: number,
  dstW: number,
  dstH: number,
  fit: 'cover' | 'contain',
): { sx: number; sy: number; sw: number; sh: number; dx: number; dy: number; dw: number; dh: number } {
  const sw0 = Math.max(1, srcW)
  const sh0 = Math.max(1, srcH)
  const dw0 = Math.max(1, dstW)
  const dh0 = Math.max(1, dstH)
  const srcAspect = sw0 / sh0
  const dstAspect = dw0 / dh0

  if (fit === 'cover') {
    let sw = sw0
    let sh = sh0
    if (srcAspect > dstAspect) {
      sw = Math.round(sh0 * dstAspect)
    } else {
      sh = Math.round(sw0 / dstAspect)
    }
    const sx = Math.round((sw0 - sw) / 2)
    const sy = Math.round((sh0 - sh) / 2)
    return { sx, sy, sw: Math.max(1, sw), sh: Math.max(1, sh), dx: 0, dy: 0, dw: dw0, dh: dh0 }
  }

  // contain
  let dw = dw0
  let dh = dh0
  if (srcAspect > dstAspect) {
    dh = Math.round(dw0 / srcAspect)
  } else {
    dw = Math.round(dh0 * srcAspect)
  }
  const dx = Math.round((dw0 - dw) / 2)
  const dy = Math.round((dh0 - dh) / 2)
  return { sx: 0, sy: 0, sw: sw0, sh: sh0, dx, dy, dw: Math.max(1, dw), dh: Math.max(1, dh) }
}

/**
 * Parse SVG XML string to determine intrinsic width/height (using `viewBox` fallback
 * when `width`/`height` attributes are missing or percentage-based) and return
 * a patched SVG string with explicit pixel `width` and `height` attributes for sharp rasterization.
 */
export function parseSvgDimensions(
  svgText: string,
  targetWidth = 0,
  scale = 1,
): { width: number; height: number; patchedSvg: string } {
  const safeScale = Math.max(0.1, Math.min(16, scale || 1))
  const svgTagMatch = svgText.match(/<svg\b([^>]*)>/i)
  const attrs = svgTagMatch ? svgTagMatch[1] : ''

  const parseNumericAttr = (name: string): number | null => {
    const m = attrs.match(new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'i'))
    if (!m) return null
    const raw = m[1].trim()
    if (raw.endsWith('%')) return null
    const val = parseFloat(raw)
    return Number.isFinite(val) && val > 0 ? val : null
  }

  let natW = parseNumericAttr('width')
  let natH = parseNumericAttr('height')

  const vbMatch = attrs.match(/\bviewBox\s*=\s*["']([^"']+)["']/i)
  let vbW: number | null = null
  let vbH: number | null = null
  if (vbMatch) {
    const parts = vbMatch[1]
      .trim()
      .split(/[\s,]+/)
      .map(Number)
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      vbW = parts[2]
      vbH = parts[3]
    }
  }

  if (!natW && !natH) {
    natW = vbW ?? 512
    natH = vbH ?? 512
  } else if (natW && !natH) {
    natH = vbW && vbH ? (natW * vbH) / vbW : natW
  } else if (!natW && natH) {
    natW = vbW && vbH ? (natH * vbW) / vbH : natH
  }

  const aspect = (natW || 512) / Math.max(1, natH || 512)
  let outW: number
  let outH: number
  if (targetWidth > 0) {
    outW = Math.round(targetWidth)
    outH = Math.max(1, Math.round(outW / aspect))
  } else {
    outW = Math.max(1, Math.round((natW || 512) * safeScale))
    outH = Math.max(1, Math.round((natH || 512) * safeScale))
  }

  let patchedSvg = svgText
  if (svgTagMatch) {
    let cleanedAttrs = attrs
      .replace(/\bwidth\s*=\s*["'][^"']*["']/gi, '')
      .replace(/\bheight\s*=\s*["'][^"']*["']/gi, '')
    if (!/\bxmlns\s*=/i.test(cleanedAttrs)) {
      cleanedAttrs += ' xmlns="http://www.w3.org/2000/svg"'
    }
    if (!vbMatch && natW && natH) {
      cleanedAttrs += ` viewBox="0 0 ${natW} ${natH}"`
    }
    const replacementTag = `<svg width="${outW}" height="${outH}" ${cleanedAttrs.trim()}>`
    patchedSvg = svgText.replace(svgTagMatch[0], replacementTag)
  }

  return { width: outW, height: outH, patchedSvg }
}

/** Convert a `Uint8Array` to a raw Base64 string without stack overflow. */
export function uint8ToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000
  const chunks: string[] = []
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const sub = bytes.subarray(i, i + chunkSize)
    chunks.push(String.fromCharCode(...sub))
  }
  return btoa(chunks.join(''))
}

/**
 * Format a raw Base64 string and metadata into Data URI, CSS snippet, HTML `<img>` tag, Markdown, or all-in-one bundle.
 */
export function formatBase64Snippet(opts: {
  rawBase64: string
  mime: string
  fileName: string
  width?: number
  height?: number
  mode: Base64FormatMode
}): string {
  const mime = opts.mime || 'image/png'
  const dataUri = `data:${mime};base64,${opts.rawBase64}`
  const safeAlt = (opts.fileName || 'image').replace(/\.[^.]+$/, '').replace(/"/g, '&quot;')
  const dimsAttr =
    opts.width && opts.height ? ` width="${opts.width}" height="${opts.height}"` : ''

  switch (opts.mode) {
    case 'raw':
      return opts.rawBase64
    case 'data-uri':
      return dataUri
    case 'css':
      return `.bg-image {\n  background-image: url("${dataUri}");\n  background-repeat: no-repeat;\n  background-size: contain;\n}`
    case 'html':
      return `<img src="${dataUri}" alt="${safeAlt}"${dimsAttr} loading="lazy" />`
    case 'markdown':
      return `![${safeAlt}](${dataUri})`
    case 'all':
      return [
        `/* === File: ${opts.fileName} (${mime}${opts.width && opts.height ? `, ${opts.width}x${opts.height}px` : ''}) === */`,
        '',
        '--- DATA URI ---',
        dataUri,
        '',
        '--- HTML <IMG> SNIPPET ---',
        `<img src="${dataUri}" alt="${safeAlt}"${dimsAttr} loading="lazy" />`,
        '',
        '--- CSS BACKGROUND SNIPPET ---',
        `.bg-image {\n  background-image: url("${dataUri}");\n  background-repeat: no-repeat;\n  background-size: contain;\n}`,
        '',
        '--- RAW BASE64 ---',
        opts.rawBase64,
      ].join('\n')
  }
}
