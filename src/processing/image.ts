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

/** Fill transparent pixels for JPEG output. */
function flatten(c: HTMLCanvasElement) {
  const out = canvas(c.width, c.height)
  const ctx = out.getContext('2d')!
  ctx.fillStyle = '#ffffff'
  ctx.fillRect(0, 0, out.width, out.height)
  ctx.drawImage(c, 0, 0)
  return out
}

export interface CompressOpts { quality: number; format: 'keep' | ImgFormat; maxEdge?: number }

export async function compressImage(file: File, opts: CompressOpts): Promise<OutputFile> {
  const bmp = await loadBitmap(file)
  let w = bmp.width, h = bmp.height
  if (opts.maxEdge && Math.max(w, h) > opts.maxEdge) {
    const s = opts.maxEdge / Math.max(w, h)
    w = Math.round(w * s); h = Math.round(h * s)
  }
  let { c } = drawBase(bmp, w, h)
  bmp.close()
  const type: ImgFormat = opts.format === 'keep'
    ? (file.type === 'image/png' || file.type === 'image/webp' ? file.type : 'image/jpeg')
    : opts.format
  if (type === 'image/jpeg') c = flatten(c)
  const blob = await encode(c, type, opts.quality)
  return { name: `${stem(file.name)}-compressed.${EXT[type]}`, blob }
}

export async function resizeImage(file: File, width: number, height: number, format: 'keep' | ImgFormat): Promise<OutputFile> {
  const bmp = await loadBitmap(file)
  let { c } = drawBase(bmp, width, height)
  bmp.close()
  const type: ImgFormat = format === 'keep' ? (file.type === 'image/png' || file.type === 'image/webp' ? file.type : 'image/jpeg') : format
  if (type === 'image/jpeg') c = flatten(c)
  const blob = await encode(c, type, 0.92)
  return { name: `${stem(file.name)}-${width}x${height}.${EXT[type]}`, blob }
}

export async function cropImage(file: File, xPct: number, yPct: number, wPct: number, hPct: number): Promise<OutputFile> {
  const bmp = await loadBitmap(file)
  const sx = (xPct / 100) * bmp.width, sy = (yPct / 100) * bmp.height
  const sw = (wPct / 100) * bmp.width, sh = (hPct / 100) * bmp.height
  const c = canvas(sw, sh)
  const ctx = c.getContext('2d')!
  ctx.drawImage(bmp, sx, sy, sw, sh, 0, 0, c.width, c.height)
  bmp.close()
  const type: ImgFormat = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
  const blob = await encode(type === 'image/jpeg' ? flatten(c) : c, type, 0.92)
  return { name: `${stem(file.name)}-cropped.${EXT[type]}`, blob }
}

export async function convertImage(file: File, type: ImgFormat, quality = 0.92): Promise<OutputFile> {
  const bmp = await loadBitmap(file)
  let { c } = drawBase(bmp, bmp.width, bmp.height)
  bmp.close()
  if (type === 'image/jpeg') c = flatten(c)
  const blob = await encode(c, type, quality)
  return { name: `${stem(file.name)}.${EXT[type]}`, blob }
}

export async function rotateImage(file: File, deg: number): Promise<OutputFile> {
  const bmp = await loadBitmap(file)
  const rad = (deg * Math.PI) / 180
  const swap = deg % 180 !== 0
  const c = canvas(swap ? bmp.height : bmp.width, swap ? bmp.width : bmp.height)
  const ctx = c.getContext('2d')!
  ctx.translate(c.width / 2, c.height / 2)
  ctx.rotate(rad)
  ctx.drawImage(bmp, -bmp.width / 2, -bmp.height / 2)
  bmp.close()
  const type: ImgFormat = file.type === 'image/png' ? 'image/png' : file.type === 'image/webp' ? 'image/webp' : 'image/jpeg'
  const blob = await encode(type === 'image/jpeg' ? flatten(c) : c, type, 0.92)
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

export interface WatermarkOpts { text: string; opacity: number; fontSize: number; position: 'bottom-right' | 'center' | 'tile' }

export async function watermarkImage(file: File, opts: WatermarkOpts): Promise<OutputFile> {
  const bmp = await loadBitmap(file)
  const { c, ctx } = drawBase(bmp, bmp.width, bmp.height)
  bmp.close()
  ctx.save()
  ctx.globalAlpha = opts.opacity
  ctx.fillStyle = '#ffffff'
  ctx.strokeStyle = 'rgba(0,0,0,.35)'
  ctx.font = `700 ${opts.fontSize}px Manrope, sans-serif`
  ctx.textAlign = 'center'
  ctx.textBaseline = 'middle'
  const draw = (x: number, y: number) => { ctx.strokeText(opts.text, x, y); ctx.fillText(opts.text, x, y) }
  if (opts.position === 'tile') {
    ctx.rotate(-0.35)
    for (let y = -c.height; y < c.height * 2; y += opts.fontSize * 5)
      for (let x = -c.width; x < c.width * 2; x += ctx.measureText(opts.text).width + 120) draw(x, y)
  } else if (opts.position === 'center') draw(c.width / 2, c.height / 2)
  else { ctx.textAlign = 'right'; const x = c.width - 24; const y = c.height - 24 - opts.fontSize / 2; ctx.strokeText(opts.text, x, y); ctx.fillText(opts.text, x, y) }
  ctx.restore()
  const type: ImgFormat = file.type === 'image/png' ? 'image/png' : 'image/jpeg'
  const blob = await encode(type === 'image/jpeg' ? flatten(c) : c, type, 0.92)
  return { name: `${stem(file.name)}-watermarked.${EXT[type]}`, blob }
}

export async function imagesToPdf(files: File[], pageSize: 'fit' | 'a4'): Promise<OutputFile> {
  const doc = await PDFDocument.create()
  for (const f of files) {
    const bytes = new Uint8Array(await f.arrayBuffer())
    const isPng = f.type === 'image/png'
    const img = isPng ? await doc.embedPng(bytes) : await doc.embedJpg(bytes).catch(async () => {
      // Non-JPEG raster (e.g. WebP): re-encode to PNG via canvas first.
      const bmp = await loadBitmap(f)
      const { c } = drawBase(bmp, bmp.width, bmp.height)
      bmp.close()
      const png = await encode(c, 'image/png', 1)
      return doc.embedPng(new Uint8Array(await png.arrayBuffer()))
    })
    if (pageSize === 'a4') {
      const page = doc.addPage([595.28, 841.89])
      const margin = 36
      const s = Math.min((595.28 - margin * 2) / img.width, (841.89 - margin * 2) / img.height)
      page.drawImage(img, { x: (595.28 - img.width * s) / 2, y: (841.89 - img.height * s) / 2, width: img.width * s, height: img.height * s })
    } else {
      const page = doc.addPage([img.width * 0.75, img.height * 0.75])
      page.drawImage(img, { x: 0, y: 0, width: img.width * 0.75, height: img.height * 0.75 })
    }
  }
  const bytes = await doc.save()
  return { name: files.length === 1 ? `${stem(files[0].name)}.pdf` : 'images.pdf', blob: new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' }) }
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

export interface ImageMeta { width: number; height: number; type: string; size: number; name: string }

export async function imageMetadata(file: File): Promise<ImageMeta> {
  const bmp = await loadBitmap(file)
  const meta = { width: bmp.width, height: bmp.height, type: file.type || 'unknown', size: file.size, name: file.name }
  bmp.close()
  return meta
}
