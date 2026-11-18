/**
 * Lazy-loaded WASM image codecs (MozJPEG, WebP, AVIF, OxiPNG via @jsquash/* and
 * UPNG.js palette quantizer) usable both on the main thread and inside Web
 * Workers. Falls back gracefully to browser Canvas encoding if WASM fails to
 * load or is blocked by the environment.
 */
import {
  type AnyCanvas,
  type EncodeResult,
  type ImgFormat,
  canEncodeNatively,
  ctx2d,
  encodeVerified,
  makeCanvas,
} from './imageCore'

export type EncoderPreference = 'auto' | 'browser' | 'wasm'

export interface EncodeOptions {
  /** Quality in 0..1 range (default 0.82). */
  quality?: number
  /** Encoder preference: 'browser' (fast canvas), 'wasm' (max compression), or 'auto'. */
  encoder?: EncoderPreference
  /** For PNG: run lossless OxiPNG pass after palette quantization when encoder === 'wasm'. */
  oxipng?: boolean
}

let jpegModPromise: Promise<typeof import('@jsquash/jpeg/encode.js')> | null = null
let webpModPromise: Promise<typeof import('@jsquash/webp/encode.js')> | null = null
let avifModPromise: Promise<typeof import('@jsquash/avif/encode.js')> | null = null
let oxipngModPromise: Promise<typeof import('@jsquash/oxipng/optimise.js')> | null = null
let upngModPromise: Promise<typeof import('upng-js')> | null = null

async function loadMozJpeg() {
  if (!jpegModPromise) jpegModPromise = import('@jsquash/jpeg/encode.js')
  return jpegModPromise
}

async function loadWebp() {
  if (!webpModPromise) webpModPromise = import('@jsquash/webp/encode.js')
  return webpModPromise
}

async function loadAvif() {
  if (!avifModPromise) avifModPromise = import('@jsquash/avif/encode.js')
  return avifModPromise
}

async function loadOxipng() {
  if (!oxipngModPromise) oxipngModPromise = import('@jsquash/oxipng/optimise.js')
  return oxipngModPromise
}

async function loadUpng() {
  if (!upngModPromise) upngModPromise = import('upng-js')
  const mod = await upngModPromise
  return ('default' in mod && mod.default ? mod.default : mod) as typeof import('upng-js')
}

/**
 * Map a 0..1 quality slider to a UPNG palette color count `cnum`.
 * `cnum = 0` in UPNG means lossless 32-bit/24-bit encoding; 2..256 enables
 * lossy median-cut palette quantization (TinyPNG style).
 */
export function qualityToPngColors(quality: number): number {
  const q = Math.max(0, Math.min(1, quality))
  if (q >= 0.99) return 0
  if (q >= 0.85) return 256
  if (q >= 0.7) return 192
  if (q >= 0.55) return 128
  if (q >= 0.4) return 96
  if (q >= 0.25) return 64
  return Math.max(16, Math.round(q * 192))
}

/**
 * Quantize and encode RGBA pixel data into a PNG ArrayBuffer using UPNG.js,
 * optionally followed by an OxiPNG lossless DEFLATE pass.
 */
export async function encodePngQuantized(
  data: ImageData | { data: Uint8ClampedArray | Uint8Array; width: number; height: number },
  quality = 0.85,
  useOxipng = false,
): Promise<ArrayBuffer> {
  const UPNG = await loadUpng()
  const cnum = qualityToPngColors(quality)
  // Copy into a standalone ArrayBuffer so UPNG's in-place alpha premultiplication
  // never mutates caller-owned ImageData or views with non-zero byteOffset.
  const copy = new Uint8Array(data.width * data.height * 4)
  copy.set(
    new Uint8Array(
      data.data.buffer,
      data.data.byteOffset,
      Math.min(data.data.byteLength, copy.byteLength),
    ),
  )
  let pngBuf = UPNG.encode([copy.buffer], data.width, data.height, cnum)
  if (useOxipng) {
    try {
      const { default: optimise } = await loadOxipng()
      const opt = await optimise(pngBuf, { level: 2, interlace: false, optimiseAlpha: true })
      if (opt && opt.byteLength > 0 && opt.byteLength < pngBuf.byteLength) {
        pngBuf = opt
      }
    } catch {
      // OxiPNG WASM optional — keep UPNG output if unavailable
    }
  }
  return pngBuf
}

/**
 * Encode `ImageData` using jSquash WASM encoders (MozJPEG, WebP, AVIF) or
 * UPNG/OxiPNG for PNG, with a graceful fallback to browser Canvas encoding if
 * WASM fails to initialize.
 */
export async function encodeImageData(
  data: ImageData,
  type: ImgFormat | string,
  quality = 0.82,
  opts?: EncodeOptions,
): Promise<EncodeResult> {
  const q100 = Math.max(1, Math.min(100, Math.round(quality * 100)))
  const pref = opts?.encoder ?? 'auto'

  if (type === 'image/png') {
    try {
      const buf = await encodePngQuantized(data, quality, opts?.oxipng ?? pref === 'wasm')
      return { blob: new Blob([buf], { type: 'image/png' }), type: 'image/png', fellBack: false }
    } catch {
      // Fall through to canvas
    }
  }

  // Try WASM encoder when requested ('wasm'), when type is JPEG and pref is 'auto' (MozJPEG default),
  // or when the browser cannot natively encode the target format (e.g. Safari WebP / AVIF).
  const nativeOk = await canEncodeNatively(type)
  const wantWasm =
    pref === 'wasm' ||
    !nativeOk ||
    (pref === 'auto' && (type === 'image/jpeg' || type === 'image/avif'))

  if (wantWasm) {
    try {
      if (type === 'image/jpeg') {
        const { default: encodeJpeg } = await loadMozJpeg()
        const ab = await encodeJpeg(data, { quality: q100 })
        return { blob: new Blob([ab], { type: 'image/jpeg' }), type: 'image/jpeg', fellBack: false }
      }
      if (type === 'image/webp') {
        const { default: encodeWebp } = await loadWebp()
        const ab = await encodeWebp(data, { quality: q100 })
        return { blob: new Blob([ab], { type: 'image/webp' }), type: 'image/webp', fellBack: false }
      }
      if (type === 'image/avif') {
        const { default: encodeAvif } = await loadAvif()
        const ab = await encodeAvif(data, { quality: q100, speed: 6 })
        return { blob: new Blob([ab], { type: 'image/avif' }), type: 'image/avif', fellBack: false }
      }
    } catch {
      // WASM failed (e.g. strict CSP or test env) — fall back to canvas below
    }
  }

  // Canvas fallback: draw ImageData onto a canvas and use encodeVerified
  const c = makeCanvas(data.width, data.height)
  ctx2d(c).putImageData(data, 0, 0)
  const verified = await encodeVerified(c, type, quality)
  if (!verified.fellBack) return verified

  // Browser silently fell back (e.g. Safari WebP->PNG or unsupported AVIF) and we hadn't tried WASM yet
  if (!wantWasm) {
    try {
      if (type === 'image/webp') {
        const { default: encodeWebp } = await loadWebp()
        const ab = await encodeWebp(data, { quality: q100 })
        return { blob: new Blob([ab], { type: 'image/webp' }), type: 'image/webp', fellBack: false }
      }
      if (type === 'image/avif') {
        const { default: encodeAvif } = await loadAvif()
        const ab = await encodeAvif(data, { quality: q100, speed: 6 })
        return { blob: new Blob([ab], { type: 'image/avif' }), type: 'image/avif', fellBack: false }
      }
    } catch {
      // Keep verified fallback result (whose `.type` reflects the actual format)
    }
  }
  return verified
}

/**
 * Encode a Canvas (HTMLCanvasElement or OffscreenCanvas) to `type` at `quality`,
 * automatically using UPNG palette quantization for PNG, WASM when requested or
 * when the browser lacks native support (Safari WebP / AVIF), and always
 * returning the verified actual MIME type.
 */
export async function encodeCanvasSmart(
  c: AnyCanvas,
  type: ImgFormat | string,
  quality = 0.82,
  opts?: EncodeOptions,
): Promise<EncodeResult> {
  const pref = opts?.encoder ?? 'browser'
  const nativeOk = await canEncodeNatively(type)

  if (type === 'image/png') {
    // When quality < 1 or oxipng is requested, run UPNG palette quantization
    if (quality < 0.99 || opts?.oxipng || pref === 'wasm') {
      try {
        const imgData = ctx2d(c).getImageData(0, 0, c.width, c.height)
        const buf = await encodePngQuantized(imgData, quality, opts?.oxipng ?? pref === 'wasm')
        return { blob: new Blob([buf], { type: 'image/png' }), type: 'image/png', fellBack: false }
      } catch {
        // Fallback to native lossless PNG
      }
    }
    return encodeVerified(c, 'image/png', 1)
  }

  const useWasm =
    pref === 'wasm' ||
    !nativeOk ||
    (pref === 'auto' && (type === 'image/jpeg' || type === 'image/avif'))

  if (useWasm) {
    try {
      const imgData = ctx2d(c).getImageData(0, 0, c.width, c.height)
      return await encodeImageData(imgData, type, quality, { ...opts, encoder: 'wasm' })
    } catch {
      // Fallback to native canvas encode
    }
  }

  const res = await encodeVerified(c, type, quality)
  if (res.fellBack) {
    // Browser silently fell back (e.g. Safari WebP->PNG); try WASM encoder
    try {
      const imgData = ctx2d(c).getImageData(0, 0, c.width, c.height)
      return await encodeImageData(imgData, type, quality, { ...opts, encoder: 'wasm' })
    } catch {
      return res
    }
  }
  return res
}
