import {
  makeCanvas,
  ctx2d,
  decodeBitmap,
  stemOf,
} from './imageCore'
import type { OutputFile } from './download'
import type { GifMakerSettings } from './imageExtraTypes'
import { computeCoverContainRect } from './imageExtraMath'

/**
 * Resolve output width and height for the animated GIF given the first frame's dimensions
 * and user settings.
 */
export function resolveGifDimensions(
  firstW: number,
  firstH: number,
  settings: GifMakerSettings,
): { width: number; height: number } {
  const outW = Math.max(64, Math.min(1920, Math.round(settings.outputWidth || 640)))
  let aspect = Math.max(1, firstW) / Math.max(1, firstH)
  if (settings.aspectMode === '1:1') aspect = 1
  else if (settings.aspectMode === '4:3') aspect = 4 / 3
  else if (settings.aspectMode === '16:9') aspect = 16 / 9
  else if (settings.aspectMode === '9:16') aspect = 9 / 16

  const outH = Math.max(64, Math.round(outW / aspect))
  return { width: outW, height: outH }
}

/**
 * Encode a sequence of image files into an animated GIF using `gifenc`.
 * Honors file order, optional ping-pong reversal, per-frame or global palette quantization,
 * frame delay in ms, and loop count.
 */
export async function buildAnimatedGif(
  files: File[],
  settings: GifMakerSettings,
  proc?: { signal?: AbortSignal; onProgress?: (done: number, total: number) => void },
): Promise<{ output: OutputFile; width: number; height: number; frameCount: number }> {
  if (files.length === 0) {
    throw new Error('Please upload at least 1 image to create a GIF.')
  }

  const { GIFEncoder, quantize, applyPalette } = await import('gifenc')

  // Decode first frame to determine aspect if 'first' is chosen
  const firstBmp = await decodeBitmap(files[0])
  const { width, height } = resolveGifDimensions(firstBmp.width, firstBmp.height, settings)
  firstBmp.close()

  // Build ordered frame file list (with optional ping-pong bounce)
  const sequence: File[] = [...files]
  if (settings.pingPong && files.length > 2) {
    for (let i = files.length - 2; i >= 1; i--) {
      sequence.push(files[i])
    }
  }

  const totalFrames = sequence.length
  const maxColors = Math.max(16, Math.min(256, Math.round(settings.maxColors || 256)))
  const delayMs = Math.max(20, Math.min(10000, Math.round(settings.frameDelayMs || 400)))
  const repeat = settings.loopCount

  const frameCanvas = makeCanvas(width, height)
  const fctx = ctx2d(frameCanvas, { willReadFrequently: true })
  const W = frameCanvas.width
  const H = frameCanvas.height

  const rgbaFrames: Uint8ClampedArray[] = []

  for (let i = 0; i < totalFrames; i++) {
    if (proc?.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    const bmp = await decodeBitmap(sequence[i])
    try {
      fctx.fillStyle = settings.bgColor || '#0f172a'
      fctx.fillRect(0, 0, W, H)

      const rect = computeCoverContainRect(bmp.width, bmp.height, W, H, settings.fit)
      fctx.imageSmoothingEnabled = true
      fctx.imageSmoothingQuality = 'high'
      fctx.drawImage(bmp, rect.sx, rect.sy, rect.sw, rect.sh, rect.dx, rect.dy, rect.dw, rect.dh)

      const imgData = fctx.getImageData(0, 0, W, H)
      rgbaFrames.push(new Uint8ClampedArray(imgData.data))
    } finally {
      bmp.close()
    }
  }

  const gif = GIFEncoder()

  let globalPalette: number[][] | null = null
  if (settings.paletteMode === 'global') {
    // Sample pixels across all frames to build a representative global palette
    const sampleFrames = rgbaFrames.length
    const pixelsPerFrame = W * H
    const step = Math.max(1, Math.floor((sampleFrames * pixelsPerFrame) / 65536))
    const sampleCount = Math.ceil((sampleFrames * pixelsPerFrame) / step)
    const sampleBuf = new Uint8Array(sampleCount * 4)
    let dst = 0
    for (let f = 0; f < sampleFrames; f++) {
      const data = rgbaFrames[f]
      for (let p = 0; p < pixelsPerFrame; p += step) {
        if (dst + 3 < sampleBuf.length) {
          const idx = p * 4
          sampleBuf[dst] = data[idx]
          sampleBuf[dst + 1] = data[idx + 1]
          sampleBuf[dst + 2] = data[idx + 2]
          sampleBuf[dst + 3] = 255
          dst += 4
        }
      }
    }
    globalPalette = quantize(sampleBuf.subarray(0, dst), maxColors, { format: 'rgb565' })
  }

  for (let i = 0; i < totalFrames; i++) {
    if (proc?.signal?.aborted) {
      throw new DOMException('Aborted', 'AbortError')
    }
    const rgba = rgbaFrames[i]
    const palette =
      globalPalette ?? quantize(rgba, maxColors, { format: 'rgb565' })
    const index = applyPalette(rgba, palette, 'rgb565')

    gif.writeFrame(index, W, H, {
      palette,
      delay: delayMs,
      repeat: i === 0 ? repeat : undefined,
    })
    proc?.onProgress?.(i + 1, totalFrames)
  }

  gif.finish()
  const bytes = gif.bytes()
  const copy = new Uint8Array(bytes.byteLength)
  copy.set(bytes)
  const blob = new Blob([copy], { type: 'image/gif' })
  const baseName = stemOf(files[0].name) || 'animation'

  return {
    output: {
      name: `${baseName}-animated.gif`,
      blob,
    },
    width: W,
    height: H,
    frameCount: totalFrames,
  }
}
