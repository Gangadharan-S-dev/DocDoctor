import {
  makeCanvas,
  ctx2d,
  encodeVerified,
  decodeBitmap,
  stemOf,
} from './imageCore'
import type { OutputFile } from './download'
import type { BgRemoveModelId, BgRemoveSettings } from './imageExtraTypes'
import { featherAlphaMask, boxBlurRgba } from './imageExtraMath'

/**
 * Exact external origins fetched by `@huggingface/transformers` v4 and `onnxruntime-web`
 * when downloading open-license ONNX models and WASM runtime binaries in the browser.
 * Needed for Content-Security-Policy `connect-src` / `script-src`.
 */
export const BG_REMOVE_CSP_ORIGINS = {
  connectSrc: [
    'https://huggingface.co',
    'https://*.hf.co',
    'https://*.huggingface.co',
    'https://cdn.jsdelivr.net',
  ],
  scriptSrc: [
    'https://cdn.jsdelivr.net',
    "'wasm-unsafe-eval'",
  ],
} as const

export interface BgModelProgress {
  status: string
  file?: string
  progress?: number
  loaded?: number
  total?: number
  device?: 'webgpu' | 'wasm'
}

type SegmenterCallable = (
  input: Blob | string | HTMLCanvasElement | OffscreenCanvas,
) => Promise<{
  data: Uint8Array | Uint8ClampedArray
  width: number
  height: number
  channels: number
}>

let cachedSegmenter: {
  modelId: BgRemoveModelId
  device: 'webgpu' | 'wasm'
  fn: SegmenterCallable
} | null = null

let activeDevice: 'webgpu' | 'wasm' | null = null

/** Detect whether WebGPU is genuinely available with an adapter in this browser. */
export async function detectPreferredDevice(): Promise<'webgpu' | 'wasm'> {
  if (activeDevice) return activeDevice
  try {
    if (typeof navigator !== 'undefined' && 'gpu' in navigator) {
      const gpu = (navigator as Navigator & { gpu?: { requestAdapter?: () => Promise<unknown> } }).gpu
      if (gpu && typeof gpu.requestAdapter === 'function') {
        const adapter = await gpu.requestAdapter()
        if (adapter) {
          activeDevice = 'webgpu'
          return 'webgpu'
        }
      }
    }
  } catch {
    // WebGPU unavailable or blocked; fall back to WASM
  }
  activeDevice = 'wasm'
  return 'wasm'
}

/**
 * Lazy-load the open-license background removal pipeline (`Xenova/modnet` Apache-2.0
 * or `onnx-community/BiRefNet_lite-ONNX` MIT). Prefers WebGPU and falls back to WASM.
 */
export async function getBgRemovePipeline(
  modelId: BgRemoveModelId,
  onProgress?: (info: BgModelProgress) => void,
): Promise<{ segmenter: SegmenterCallable; device: 'webgpu' | 'wasm' }> {
  const preferredDevice = await detectPreferredDevice()

  if (cachedSegmenter && cachedSegmenter.modelId === modelId) {
    onProgress?.({ status: 'ready', progress: 100, device: cachedSegmenter.device })
    return { segmenter: cachedSegmenter.fn, device: cachedSegmenter.device }
  }

  const { pipeline, env } = await import('@huggingface/transformers')
  env.allowLocalModels = false
  env.allowRemoteModels = true

  const tryLoad = async (device: 'webgpu' | 'wasm'): Promise<SegmenterCallable> => {
    onProgress?.({ status: 'initiate', progress: 0, device })
    const pipe = await pipeline('background-removal', modelId, {
      device,
      progress_callback: (p: {
        status?: string
        file?: string
        progress?: number
        loaded?: number
        total?: number
      }) => {
        onProgress?.({
          status: p.status ?? 'progress',
          file: p.file,
          progress: typeof p.progress === 'number' ? Math.round(p.progress) : undefined,
          loaded: p.loaded,
          total: p.total,
          device,
        })
      },
    })
    return pipe as unknown as SegmenterCallable
  }

  let fn: SegmenterCallable
  let finalDevice: 'webgpu' | 'wasm' = preferredDevice
  try {
    fn = await tryLoad(preferredDevice)
  } catch (err) {
    if (preferredDevice === 'webgpu') {
      finalDevice = 'wasm'
      activeDevice = 'wasm'
      fn = await tryLoad('wasm')
    } else {
      throw err
    }
  }

  cachedSegmenter = { modelId, device: finalDevice, fn }
  onProgress?.({ status: 'ready', progress: 100, device: finalDevice })
  return { segmenter: fn, device: finalDevice }
}

/**
 * Run on-device background removal on a single image file and composite onto
 * transparent PNG, solid color, or blurred original backdrop.
 */
export async function removeImageBackground(
  file: File,
  settings: BgRemoveSettings,
  onModelProgress?: (info: BgModelProgress) => void,
): Promise<{ output: OutputFile; device: 'webgpu' | 'wasm'; width: number; height: number }> {
  const { segmenter, device } = await getBgRemovePipeline(settings.modelId, onModelProgress)

  const bmp = await decodeBitmap(file)
  try {
    const W = bmp.width
    const H = bmp.height
    const srcCanvas = makeCanvas(W, H)
    const sctx = ctx2d(srcCanvas)
    sctx.drawImage(bmp, 0, 0, srcCanvas.width, srcCanvas.height)
    const cw = srcCanvas.width
    const ch = srcCanvas.height

    // Convert normalized source canvas to a PNG blob for the segmentation pipeline
    const { blob: inputBlob } = await encodeVerified(srcCanvas, 'image/png')
    const rawOut = await segmenter(inputBlob)

    // Extract 1-channel alpha mask at (cw, ch)
    const rawW = rawOut.width
    const rawH = rawOut.height
    const channels = rawOut.channels
    const rawData = rawOut.data

    let mask1Ch = new Uint8ClampedArray(cw * ch)

    if (rawW === cw && rawH === ch) {
      const alphaOffset = channels === 4 ? 3 : 0
      for (let i = 0; i < cw * ch; i++) {
        mask1Ch[i] = rawData[i * channels + alphaOffset]
      }
    } else {
      // Resample mask to match (cw, ch)
      const maskCanvas = makeCanvas(rawW, rawH)
      const mctx = ctx2d(maskCanvas)
      const mImgData = mctx.createImageData(rawW, rawH)
      const alphaOffset = channels === 4 ? 3 : 0
      for (let i = 0; i < rawW * rawH; i++) {
        const a = rawData[i * channels + alphaOffset]
        mImgData.data[i * 4] = a
        mImgData.data[i * 4 + 1] = a
        mImgData.data[i * 4 + 2] = a
        mImgData.data[i * 4 + 3] = 255
      }
      mctx.putImageData(mImgData, 0, 0)

      const scaledMaskCanvas = makeCanvas(cw, ch)
      const smCtx = ctx2d(scaledMaskCanvas)
      smCtx.drawImage(maskCanvas, 0, 0, cw, ch)
      const scaledData = smCtx.getImageData(0, 0, cw, ch).data
      for (let i = 0; i < cw * ch; i++) {
        mask1Ch[i] = scaledData[i * 4]
      }
    }

    if (settings.featherPx > 0) {
      mask1Ch = featherAlphaMask(mask1Ch, cw, ch, settings.featherPx)
    }

    const fgImageData = sctx.getImageData(0, 0, cw, ch)
    const fgPixels = fgImageData.data

    const outCanvas = makeCanvas(cw, ch)
    const octx = ctx2d(outCanvas)

    if (settings.bgMode === 'transparent') {
      for (let i = 0; i < cw * ch; i++) {
        fgPixels[i * 4 + 3] = Math.round((fgPixels[i * 4 + 3] * mask1Ch[i]) / 255)
      }
      octx.putImageData(fgImageData, 0, 0)
    } else if (settings.bgMode === 'color') {
      // Fill solid background color, then alpha-blend foreground on top
      octx.fillStyle = settings.bgColor || '#ffffff'
      octx.fillRect(0, 0, cw, ch)

      const fgCanvas = makeCanvas(cw, ch)
      const fctx = ctx2d(fgCanvas)
      for (let i = 0; i < cw * ch; i++) {
        fgPixels[i * 4 + 3] = Math.round((fgPixels[i * 4 + 3] * mask1Ch[i]) / 255)
      }
      fctx.putImageData(fgImageData, 0, 0)
      octx.drawImage(fgCanvas, 0, 0)
    } else {
      // 'blur': blur a copy of the original background, then draw sharp foreground over it
      const bgData = sctx.getImageData(0, 0, cw, ch)
      const blurRadius = Math.max(4, Math.min(60, Math.round(settings.bgBlurRadius || 18)))
      boxBlurRgba(bgData.data, cw, ch, 0, 0, cw, ch, blurRadius, 3)
      octx.putImageData(bgData, 0, 0)

      const fgCanvas = makeCanvas(cw, ch)
      const fctx = ctx2d(fgCanvas)
      for (let i = 0; i < cw * ch; i++) {
        fgPixels[i * 4 + 3] = Math.round((fgPixels[i * 4 + 3] * mask1Ch[i]) / 255)
      }
      fctx.putImageData(fgImageData, 0, 0)
      octx.drawImage(fgCanvas, 0, 0)
    }

    const { blob: outBlob } = await encodeVerified(outCanvas, 'image/png')
    return {
      output: {
        name: `${stemOf(file.name)}-nobg.png`,
        blob: outBlob,
      },
      device,
      width: cw,
      height: ch,
    }
  } finally {
    bmp.close()
  }
}
