/**
 * Off-main-thread image compression. Uses createImageBitmap + OffscreenCanvas
 * so batch jobs never block scrolling or input. The client falls back to the
 * main-thread engine whenever Worker/OffscreenCanvas is unavailable.
 */
export interface CompressRequest {
  id: number
  buffer: ArrayBuffer
  name: string
  type: string
  quality: number
  format: 'keep' | 'image/jpeg' | 'image/png' | 'image/webp'
  maxEdge?: number
  targetSizeKB?: number
}
export interface CompressResponse {
  id: number
  blob?: Blob
  outType?: string
  error?: string
}

const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' }
export const stemOf = (name: string) => name.replace(/\.[^.]+$/, '')

self.onmessage = async (e: MessageEvent<CompressRequest>) => {
  const { id, buffer, type, quality, format, maxEdge, targetSizeKB } = e.data
  try {
    const bmp = await createImageBitmap(new Blob([buffer], { type }))
    let w = bmp.width, h = bmp.height
    if (maxEdge && Math.max(w, h) > maxEdge) {
      const s = maxEdge / Math.max(w, h)
      w = Math.max(1, Math.round(w * s))
      h = Math.max(1, Math.round(h * s))
    }
    const canvas = new OffscreenCanvas(w, h)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable.')
    const outType = format === 'keep' ? (type === 'image/png' || type === 'image/webp' ? type : 'image/jpeg') : format
    if (outType === 'image/jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height) }
    ctx.drawImage(bmp, 0, 0, w, h)
    bmp.close()

    // Quantize PNG pixel noise to optimize DEFLATE compression
    if (outType === 'image/png') {
      try {
        const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height)
        const data = imgData.data
        for (let i = 0; i < data.length; i += 4) {
          data[i] = data[i] & 0xf8
          data[i + 1] = data[i + 1] & 0xf8
          data[i + 2] = data[i + 2] & 0xf8
        }
        ctx.putImageData(imgData, 0, 0)
      } catch {
        // ignore
      }
    }

    let curQuality = quality
    let blob = await canvas.convertToBlob({ type: outType, quality: curQuality })

    // Target size adaptive loop: tunes quality and downsamples until under target
    if (targetSizeKB && targetSizeKB > 0) {
      const targetBytes = targetSizeKB * 1024
      let attempts = 0
      let currentCanvas = canvas
      while (blob.size > targetBytes && attempts < 6) {
        attempts++
        if (outType !== 'image/png' && curQuality > 0.35) {
          curQuality = Math.max(0.15, curQuality - 0.18)
          blob = await currentCanvas.convertToBlob({ type: outType, quality: curQuality })
        } else {
          const nw = Math.max(160, Math.round(currentCanvas.width * 0.75))
          const nh = Math.max(160, Math.round(currentCanvas.height * 0.75))
          if (nw === currentCanvas.width && nh === currentCanvas.height) break
          const sc = new OffscreenCanvas(nw, nh)
          const sctx = sc.getContext('2d')
          if (!sctx) break
          if (outType === 'image/jpeg') { sctx.fillStyle = '#ffffff'; sctx.fillRect(0, 0, nw, nh) }
          sctx.drawImage(currentCanvas, 0, 0, nw, nh)
          currentCanvas = sc
          blob = await currentCanvas.convertToBlob({ type: outType, quality: curQuality })
        }
      }
    }

    // Never return an image larger than the input
    if (!targetSizeKB && blob.size >= buffer.byteLength) {
      if (outType !== 'image/png' && curQuality > 0.40) {
        const retryQuality = Math.max(0.35, curQuality * 0.75)
        const retryBlob = await canvas.convertToBlob({ type: outType, quality: retryQuality })
        if (retryBlob.size < buffer.byteLength) {
          blob = retryBlob
        } else {
          blob = new Blob([buffer], { type })
        }
      } else {
        blob = new Blob([buffer], { type })
      }
    }

    const res: CompressResponse = { id, blob, outType }
    ;(self as unknown as Worker).postMessage(res)
  } catch (err) {
    const res: CompressResponse = { id, error: err instanceof Error ? err.message : 'Worker compression failed.' }
    ;(self as unknown as Worker).postMessage(res)
  }
}

export function workerOutputName(name: string, outType: string): string {
  return `${stemOf(name)}-compressed.${EXT[outType] ?? 'jpg'}`
}
