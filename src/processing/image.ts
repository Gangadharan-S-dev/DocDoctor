import { PDFDocument } from 'pdf-lib'
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

export interface CropOpts {
  circular?: boolean
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
  const sx = (xPct / 100) * bmp.width, sy = (yPct / 100) * bmp.height
  const sw = (wPct / 100) * bmp.width, sh = (hPct / 100) * bmp.height
  const c = canvas(sw, sh)
  const ctx = c.getContext('2d')!

  if (opts?.circular) {
    ctx.beginPath()
    ctx.arc(c.width / 2, c.height / 2, Math.min(c.width, c.height) / 2, 0, Math.PI * 2)
    ctx.clip()
  }

  ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, c.width, c.height)
  bmp.close()
  const type: ImgFormat = opts?.circular ? 'image/png' : (file.type === 'image/png' ? 'image/png' : 'image/jpeg')
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
}

export async function imagesToPdf(
  files: File[],
  pageSize: 'fit' | 'a4' | 'letter' = 'fit',
  opts?: ImagesToPdfOpts,
): Promise<OutputFile> {
  const doc = await PDFDocument.create()
  const effectivePageSize = opts?.pageSize || pageSize
  const marginSize = opts?.margin === 'compact' ? 18 : opts?.margin === 'none' ? 0 : 36

  for (const f of files) {
    const bytes = new Uint8Array(await f.arrayBuffer())
    const isPng = f.type === 'image/png'
    const img = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes).catch(async () => {
      const bmp = await loadBitmap(f)
      const { c } = drawBase(bmp, bmp.width, bmp.height)
      bmp.close()
      const png = await encode(c, 'image/png', 1)
      return doc.embedPng(new Uint8Array(await png.arrayBuffer()))
    })

    if (effectivePageSize === 'fit') {
      const page = doc.addPage([img.width * 0.75, img.height * 0.75])
      page.drawImage(img, { x: 0, y: 0, width: img.width * 0.75, height: img.height * 0.75 })
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
      const availW = pageW - marginSize * 2
      const availH = pageH - marginSize * 2
      const s = Math.min(availW / img.width, availH / img.height)
      const drawW = img.width * s
      const drawH = img.height * s
      page.drawImage(img, {
        x: (pageW - drawW) / 2,
        y: (pageH - drawH) / 2,
        width: drawW,
        height: drawH,
      })
    }
  }
  const bytes = await doc.save()
  return {
    name: files.length === 1 ? `${stem(files[0].name)}.pdf` : 'images.pdf',
    blob: new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' }),
  }
}

/** Build a real multi-size ICO (PNG-compressed entries, Vista+ format). */
export async function imageToIco(file: File, sizes: number[]): Promise<OutputFile> {
  const bmp = await loadBitmap(file)
  const entries: { size: number; png: Uint8Array }[] = []
  for (const s of sizes) {
    const { c } = drawBase(bmp, s, s)
    const blob = await encode(c, 'image/png', 1)
    entries.push({ size: s, png: new Uint8Array(await blob.arrayBuffer()) })
  }
  bmp.close()
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

export interface ImageMeta {
  width: number
  height: number
  type: string
  size: number
  name: string
  exif?: ExifData | null
}

export async function imageMetadata(file: File): Promise<ImageMeta> {
  const bmp = await loadBitmap(file)
  const buf = await file.slice(0, 131072).arrayBuffer().catch(() => new ArrayBuffer(0))
  const exif = parseJpegExif(buf)
  const meta: ImageMeta = {
    width: bmp.width,
    height: bmp.height,
    type: file.type || 'unknown',
    size: file.size,
    name: file.name,
    exif,
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
