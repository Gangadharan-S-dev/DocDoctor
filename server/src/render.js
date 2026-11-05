import { readFile } from 'node:fs/promises'
import path from 'node:path'
import JSZip from 'jszip'

/**
 * Render every PDF page to JPG/PNG with pdf.js + @napi-rs/canvas and bundle
 * them into a ZIP. Node-only counterpart of the browser's PDF.js rendering.
 */
export async function renderPdfToImages(pdfPath, outDir, stem, format = 'jpg') {
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const { createCanvas } = await import('@napi-rs/canvas')
  const data = new Uint8Array(await readFile(pdfPath))
  const pdf = await getDocument({ data, disableFontFace: true }).promise
  const zip = new JSZip()
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const viewport = page.getViewport({ scale: 2 })
    const canvas = createCanvas(Math.floor(viewport.width), Math.floor(viewport.height))
    const ctx = canvas.getContext('2d')
    ctx.fillStyle = '#ffffff'
    ctx.fillRect(0, 0, canvas.width, canvas.height)
    await page.render({ canvasContext: ctx, viewport }).promise
    const buf = format === 'png' ? await canvas.encode('png') : await canvas.encode('jpeg', 92)
    zip.file(`${stem}-slide-${i}.${format}`, buf)
  }
  const zipPath = path.join(outDir, 'slides.zip')
  const content = await zip.generateAsync({ type: 'nodebuffer' })
  const { writeFile } = await import('node:fs/promises')
  await writeFile(zipPath, content)
  return { zipPath, count: pdf.numPages }
}
