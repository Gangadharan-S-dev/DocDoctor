import {
  makeCanvas,
  ctx2d,
  encodeVerified,
  flattenOnto,
  decodeBitmap,
  extFor,
  stemOf,
} from './imageCore'
import type { OutputFile } from './download'
import type { HeicSettings } from './imageExtraTypes'

type HeicToFn = {
  (args: { blob: Blob; type: 'bitmap'; options?: ImageBitmapOptions }): Promise<ImageBitmap>
  (args: { blob: Blob; type: string; quality?: number }): Promise<Blob>
}

const HEIC_CDN_URL = 'https://cdn.jsdelivr.net/npm/heic-to@1.6.7/dist/csp/heic-to.js'

async function loadHeicTo(): Promise<HeicToFn> {
  // In Node / test environments or if installed locally without bundling, try dynamic CDN module first
  // so the 3.2 MB libheif Emscripten bundle stays out of the application's static chunks and only
  // downloads when a user actually converts a HEIC file on a non-Safari browser.
  const mod = (await import(/* @vite-ignore */ HEIC_CDN_URL)) as { heicTo: HeicToFn }
  return mod.heicTo
}

/**
 * Decode a HEIC/HEIF blob into an ImageBitmap, preserving EXIF orientation.
 * Tries native `createImageBitmap` first (fast and zero-WASM on Safari / macOS / iOS),
 * then falls back to `heic-to/csp` (libheif) loaded on-demand.
 */
export async function decodeHeicToBitmap(blob: Blob): Promise<ImageBitmap> {
  // 1. Try native browser decoding first (Safari supports HEIC natively)
  try {
    const bmp = await decodeBitmap(blob)
    if (bmp && bmp.width > 0 && bmp.height > 0) {
      return bmp
    }
  } catch {
    // Native decode unsupported in this browser; proceed to libheif fallback
  }

  // 2. Fallback to on-demand import of `heic-to/csp` (CSP-safe without unsafe-eval)
  const heicTo = await loadHeicTo()
  try {
    const bmp = await heicTo({
      blob,
      type: 'bitmap',
      options: { imageOrientation: 'from-image' },
    })
    if (bmp && bmp.width > 0 && bmp.height > 0) {
      return bmp
    }
  } catch {
    // Fallback if `type: 'bitmap'` fails in a specific browser version
  }

  const pngBlob = await heicTo({
    blob,
    type: 'image/png',
  })
  return decodeBitmap(pngBlob)
}

/**
 * Convert a single HEIC/HEIF file to JPG, PNG, or WebP.
 */
export async function convertHeicFile(
  file: File,
  settings: HeicSettings,
): Promise<{ output: OutputFile; actualType: string; fellBack: boolean; width: number; height: number }> {
  const bmp = await decodeHeicToBitmap(file)
  try {
    const width = bmp.width
    const height = bmp.height
    const rawCanvas = makeCanvas(width, height)
    const ctx = ctx2d(rawCanvas)
    ctx.drawImage(bmp, 0, 0, rawCanvas.width, rawCanvas.height)

    const targetCanvas =
      settings.outputFormat === 'image/jpeg'
        ? flattenOnto(rawCanvas, settings.bgColor || '#ffffff')
        : rawCanvas

    const quality =
      settings.outputFormat === 'image/png'
        ? undefined
        : Math.max(0.1, Math.min(1, (settings.quality || 92) / 100))

    const { blob, type: actualType, fellBack } = await encodeVerified(
      targetCanvas,
      settings.outputFormat,
      quality,
    )

    const ext = extFor(actualType)
    return {
      output: {
        name: `${stemOf(file.name)}.${ext}`,
        blob,
      },
      actualType,
      fellBack,
      width: rawCanvas.width,
      height: rawCanvas.height,
    }
  } finally {
    bmp.close()
  }
}
