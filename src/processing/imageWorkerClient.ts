import type { OutputFile } from './download'
import { stem } from './download'
import {
  type CompressOpts,
  compressImage,
  convertImage,
  cropImage,
  flipImage,
  resizeImage,
  rotateImage,
  watermarkImage,
} from './image'
import { extFor } from './imageCore'
import type { ImageWorkerOp, ImageWorkerRequest, ImageWorkerResponse } from '../workers/imageWorker'

export type { ImageWorkerOp, ImageWorkerRequest, ImageWorkerResponse }

export interface ImageOpOutput extends OutputFile {
  width?: number
  height?: number
  outType?: string
}

export const workerSupported = (): boolean =>
  typeof Worker !== 'undefined' &&
  typeof OffscreenCanvas !== 'undefined' &&
  typeof createImageBitmap !== 'undefined'

let worker: Worker | null = null
let seq = 0
const pending = new Map<
  number,
  { resolve: (r: ImageWorkerResponse) => void; reject: (e: Error) => void }
>()

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('../workers/imageWorker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<ImageWorkerResponse>) => {
    const slot = pending.get(e.data.id)
    if (!slot) return
    pending.delete(e.data.id)
    if (e.data.error) slot.reject(new Error(e.data.error))
    else slot.resolve(e.data)
  }
  worker.onerror = () => {
    pending.forEach((s) => s.reject(new Error('Image worker crashed.')))
    pending.clear()
    worker?.terminate()
    worker = null
  }
  return worker
}

function defaultOutputName(fileName: string, job: ImageWorkerOp, outType: string, width?: number, height?: number): string {
  const base = stem(fileName)
  const ext = extFor(outType)
  switch (job.op) {
    case 'compress':
      return `${base}-compressed.${ext}`
    case 'resize':
      return `${base}-${width ?? job.width}x${height ?? job.height}.${ext}`
    case 'rotate':
      return `${base}-rotated.${ext}`
    case 'flip':
      return `${base}-flipped.${ext}`
    case 'crop':
      return `${base}-cropped.${ext}`
    case 'convert':
      return `${base}.${ext}`
    case 'watermark-text':
      return `${base}-watermarked.${ext}`
  }
}

async function runMainThreadFallback(file: File, job: ImageWorkerOp): Promise<ImageOpOutput> {
  switch (job.op) {
    case 'compress':
      return compressImage(file, job.opts)
    case 'resize':
      return resizeImage(file, job.width, job.height, job.format, job.opts)
    case 'rotate':
      return rotateImage(file, job.deg, job.opts)
    case 'flip':
      return flipImage(file, job.horizontal, job.vertical)
    case 'crop':
      return cropImage(file, job.xPct, job.yPct, job.wPct, job.hPct, job.opts)
    case 'convert':
      return convertImage(file, job.targetType, job.quality, job.opts)
    case 'watermark-text':
      return watermarkImage(file, job.opts)
  }
}

/**
 * Run any heavy image operation (`compress`, `resize`, `rotate`, `flip`, `crop`,
 * `convert`, `watermark-text`) inside the Web Worker with transferable
 * ArrayBuffers, transparently falling back to the main thread if Workers or
 * OffscreenCanvas are unavailable.
 */
export async function runImageOp(file: File, job: ImageWorkerOp): Promise<ImageOpOutput> {
  // Logo watermarks require HTMLImageElement decoding — run on main thread
  if (job.op === 'watermark-text' && job.opts.logoUrl) {
    return watermarkImage(file, job.opts)
  }
  if (!workerSupported()) return runMainThreadFallback(file, job)

  try {
    const id = ++seq
    const res = await new Promise<ImageWorkerResponse>((resolve, reject) => {
      pending.set(id, { resolve, reject })
      file
        .arrayBuffer()
        .then((buffer) => {
          const req: ImageWorkerRequest = {
            id,
            buffer,
            name: file.name,
            type: file.type,
            job,
          }
          getWorker().postMessage(req, [buffer])
        })
        .catch((err) => {
          pending.delete(id)
          reject(err)
        })
    })
    if (!res.blob || !res.outType) throw new Error('Worker returned no image.')
    return {
      name: defaultOutputName(file.name, job, res.outType, res.width, res.height),
      blob: res.blob,
      width: res.width,
      height: res.height,
      outType: res.outType,
    }
  } catch {
    return runMainThreadFallback(file, job)
  }
}

/** Compress one image in the worker; transparently falls back to the main thread. */
export async function compressImageSmart(file: File, opts: CompressOpts): Promise<ImageOpOutput> {
  return runImageOp(file, { op: 'compress', opts })
}
