import type { OutputFile } from './download'
import { stem } from './download'
import { compressImage, type CompressOpts } from './image'
import type { CompressRequest, CompressResponse } from '../workers/imageWorker'

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }

export const workerSupported = (): boolean =>
  typeof Worker !== 'undefined' && typeof OffscreenCanvas !== 'undefined' && typeof createImageBitmap !== 'undefined'

let worker: Worker | null = null
let seq = 0
const pending = new Map<number, { resolve: (r: CompressResponse) => void; reject: (e: Error) => void }>()

function getWorker(): Worker {
  if (worker) return worker
  worker = new Worker(new URL('../workers/imageWorker.ts', import.meta.url), { type: 'module' })
  worker.onmessage = (e: MessageEvent<CompressResponse>) => {
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

/** Compress one image in the worker; transparently falls back to the main thread. */
export async function compressImageSmart(file: File, opts: CompressOpts): Promise<OutputFile> {
  if (!workerSupported()) return compressImage(file, opts)
  try {
    const id = ++seq
    const res = await new Promise<CompressResponse>((resolve, reject) => {
      pending.set(id, { resolve, reject })
      const req: CompressRequest = {
        id, buffer: undefined as unknown as ArrayBuffer, name: file.name, type: file.type, quality: opts.quality, format: opts.format,
        maxEdge: opts.maxEdge, targetSizeKB: opts.targetSizeKB,
      }
      file.arrayBuffer().then((buffer) => {
        req.buffer = buffer
        getWorker().postMessage(req, [buffer])
      }, reject)
    })
    if (!res.blob || !res.outType) throw new Error('Worker returned no image.')
    if (res.blob.size >= file.size && !opts.targetSizeKB) {
      return { name: `${stem(file.name)}-compressed.${EXT[res.outType] ?? 'jpg'}`, blob: file }
    }
    return { name: `${stem(file.name)}-compressed.${EXT[res.outType] ?? 'jpg'}`, blob: res.blob }
  } catch {
    return compressImage(file, opts)
  }
}
