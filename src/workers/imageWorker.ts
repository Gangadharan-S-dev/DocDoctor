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
  const { id, buffer, type, quality, format } = e.data
  try {
    const bmp = await createImageBitmap(new Blob([buffer], { type }))
    const canvas = new OffscreenCanvas(bmp.width, bmp.height)
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('OffscreenCanvas 2D context unavailable.')
    const outType = format === 'keep' ? (type === 'image/png' || type === 'image/webp' ? type : 'image/jpeg') : format
    if (outType === 'image/jpeg') { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height) }
    ctx.drawImage(bmp, 0, 0)
    bmp.close()
    const blob = await canvas.convertToBlob({ type: outType, quality })
    const res: CompressResponse = { id, blob, outType }
    ;(self as unknown as Worker).postMessage(res)
    void EXT
  } catch (err) {
    const res: CompressResponse = { id, error: err instanceof Error ? err.message : 'Worker compression failed.' }
    ;(self as unknown as Worker).postMessage(res)
  }
}

export function workerOutputName(name: string, outType: string): string {
  return `${stemOf(name)}-compressed.${EXT[outType] ?? 'jpg'}`
}
