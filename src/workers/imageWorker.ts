/**
 * Off-main-thread image processing worker. Supports an op-based protocol:
 * - compress (with WASM MozJPEG/WebP/AVIF, UPNG palette quantization, binary-search target size)
 * - resize (stepped halving downscale)
 * - rotate (90°/180°/270° + fine angles)
 * - flip (horizontal / vertical)
 * - crop (rectangle, circular/rounded, 4-point perspective warp + scan enhancement)
 * - convert (JPG / PNG / WebP / AVIF)
 * - watermark-text (text overlay + tiling)
 *
 * Also supports legacy `CompressRequest` messages without an `op` field so
 * existing callers stay backward compatible.
 */
import {
  type CompressOpts,
  type ConvertOpts,
  type CropOpts,
  type ImgFormat,
  type ResizeOpts,
  type RotateOpts,
  type WatermarkOpts,
  compressImageBlob,
  convertImageBlob,
  cropImageBlob,
  flipImageBlob,
  resizeImageBlob,
  rotateImageBlob,
  watermarkTextBlob,
} from '../processing/image'
import { extFor, stemOf } from '../processing/imageCore'

export { stemOf }

export type ImageWorkerOp =
  | { op: 'compress'; opts: CompressOpts }
  | { op: 'resize'; width: number; height: number; format: 'keep' | ImgFormat; opts?: ResizeOpts }
  | { op: 'rotate'; deg: number; opts?: RotateOpts }
  | { op: 'flip'; horizontal: boolean; vertical: boolean }
  | { op: 'crop'; xPct: number; yPct: number; wPct: number; hPct: number; opts?: CropOpts }
  | { op: 'convert'; targetType: ImgFormat; quality?: number; opts?: ConvertOpts }
  | { op: 'watermark-text'; opts: WatermarkOpts }

export interface ImageWorkerRequest {
  id: number
  buffer: ArrayBuffer
  name: string
  type: string
  job?: ImageWorkerOp
  // Legacy flat fields (kept for backward compatibility with CompressRequest)
  quality?: number
  format?: 'keep' | ImgFormat
  maxEdge?: number
  targetSizeKB?: number
}

export type CompressRequest = ImageWorkerRequest

export interface ImageWorkerResponse {
  id: number
  blob?: Blob
  outType?: string
  width?: number
  height?: number
  error?: string
}

export type CompressResponse = ImageWorkerResponse

if (typeof self !== 'undefined' && typeof (self as unknown as Worker).postMessage === 'function') {
  self.onmessage = async (e: MessageEvent<ImageWorkerRequest>) => {
    const msg = e.data
    const { id, buffer, name, type } = msg
    try {
      const inputBlob = new Blob([buffer], { type })
      const job: ImageWorkerOp = msg.job ?? {
        op: 'compress',
        opts: {
          quality: msg.quality ?? 0.8,
          format: msg.format ?? 'keep',
          maxEdge: msg.maxEdge,
          targetSizeKB: msg.targetSizeKB,
        },
      }

      let result: { blob: Blob; outType: string; width: number; height: number }
      switch (job.op) {
        case 'compress':
          result = await compressImageBlob(inputBlob, name, job.opts)
          break
        case 'resize':
          result = await resizeImageBlob(inputBlob, job.width, job.height, job.format, job.opts)
          break
        case 'rotate':
          result = await rotateImageBlob(inputBlob, job.deg, job.opts)
          break
        case 'flip':
          result = await flipImageBlob(inputBlob, job.horizontal, job.vertical)
          break
        case 'crop':
          result = await cropImageBlob(inputBlob, job.xPct, job.yPct, job.wPct, job.hPct, job.opts)
          break
        case 'convert':
          result = await convertImageBlob(inputBlob, job.targetType, job.quality, job.opts)
          break
        case 'watermark-text':
          result = await watermarkTextBlob(inputBlob, job.opts)
          break
      }

      const res: ImageWorkerResponse = {
        id,
        blob: result.blob,
        outType: result.outType,
        width: result.width,
        height: result.height,
      }
      ;(self as unknown as Worker).postMessage(res)
    } catch (err) {
      const res: ImageWorkerResponse = {
        id,
        error: err instanceof Error ? err.message : 'Worker image operation failed.',
      }
      ;(self as unknown as Worker).postMessage(res)
    }
  }
}

export function workerOutputName(name: string, outType: string, suffix = '-compressed'): string {
  return `${stemOf(name)}${suffix}.${extFor(outType)}`
}
