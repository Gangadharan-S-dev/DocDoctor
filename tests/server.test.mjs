// Conversion-service tests.
//  A) LibreOffice forced off  -> health reports it, conversions return 503.
//  B) LibreOffice available   -> real DOCX/PPTX/XLSX->PDF + slides->images
//     conversions verified by file magic and page/slide counts.
//     (Skipped with a clear log when LibreOffice is not installed.)
import { spawn } from 'node:child_process'
import { readdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { PDFDocument } from 'pdf-lib'

let pass = 0, fail = 0, skipped = 0
const check = (name, cond) => { if (cond) { pass++; console.log('PASS', name) } else { fail++; console.log('FAIL', name) } }
const skip = (name) => { skipped++; console.log('SKIP', name) }

async function startServer(port, env) {
  const child = spawn(process.execPath, ['server/src/index.js'], { env: { ...process.env, PORT: String(port), ...env }, stdio: 'ignore' })
  for (let i = 0; i < 40; i++) {
    try { const r = await fetch(`http://127.0.0.1:${port}/api/health`); if (r.ok) return { child, health: await r.json() } } catch { await new Promise((r) => setTimeout(r, 300)) }
  }
  child.kill()
  throw new Error('server did not start')
}

const post = async (port, endpoint, file) => {
  const form = new FormData()
  form.append('file', file)
  return fetch(`http://127.0.0.1:${port}/api/convert/${endpoint}`, { method: 'POST', body: form })
}
const named = (blob, name, type) => new File([blob], name, { type })
const isPdf = async (res) => (await res.clone().arrayBuffer()).byteLength > 4 &&
  new TextDecoder('latin1').decode((await res.arrayBuffer()).slice(0, 4)) === '%PDF'

// ── A: unavailable behavior ──────────────────────────────────────
{
  const { child, health } = await startServer(18099, { LIBREOFFICE_PATH: 'off' })
  try {
    check('health reports LibreOffice missing', health.libreOffice === false && health.tools.length === 0)
    check('health carries install hint', typeof health.installHint === 'string' && health.installHint.includes('libreoffice.org'))
    const res = await post(18099, 'pptx-to-pdf', named(new Blob(['x']), 'deck.pptx', 'application/vnd.ms-powerpoint'))
    const body = await res.json().catch(() => ({}))
    check('pptx->pdf returns 503 (never fake) when missing', res.status === 503 && /LibreOffice is not installed/.test(body.error ?? ''))
    const res2 = await post(18099, 'docx-to-pdf', named(new Blob(['x']), 'a.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))
    check('docx->pdf returns 503 when missing', res2.status === 503)
    const res3 = await post(18099, 'xlsx-to-pdf', named(new Blob(['x']), 'a.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))
    check('xlsx->pdf returns 503 when missing', res3.status === 503)
  } finally { child.kill() }
}

// ── A2: a non-LibreOffice binary must never pass the probe ──────
{
  const { child, health } = await startServer(18101, { LIBREOFFICE_PATH: process.execPath })
  try {
    check('probe rejects non-LibreOffice binaries (node.exe)', health.libreOffice === false)
  } finally { child.kill() }
}

// ── A3: detection preference + hanging/unavailable process control ──
{
  const LO = await import('../server/src/libreoffice.js')
  if (process.platform === 'win32') {
    const cands = LO.libreOfficeCandidates()
    const comIdx = cands.findIndex((c) => /soffice\.com$/i.test(c))
    const exeIdx = cands.findIndex((c) => /soffice\.exe$/i.test(c))
    check('windows detection prefers soffice.com over soffice.exe',
      comIdx !== -1 && (exeIdx === -1 || comIdx < exeIdx))
  } else skip('windows detection preference (non-windows)')

  const t0 = Date.now()
  let hangError = ''
  try { await LO.runLibreOffice(process.execPath, ['-e', 'setTimeout(() => {}, 30000)'], 600) } catch (e) { hangError = e.message }
  check('hanging process is killed at timeout with controlled error', /timed out/i.test(hangError) && Date.now() - t0 < 5000)

  let missingError = ''
  try { await LO.runLibreOffice('docdoctor-no-such-binary-xyz', ['--version'], 5000) } catch (e) { missingError = e.message }
  check('unavailable binary produces controlled error (no crash/hang)', missingError.length > 0)
}

// ── B: real conversions (only when LibreOffice exists here) ─────
{
  const { child, health } = await startServer(18100, {})
  try {
    if (!health.libreOffice) {
      console.log(`LibreOffice not installed on this machine — success-path tests skipped (health: ${JSON.stringify(health)})`)
      skip('docx->pdf success'); skip('pptx->pdf success'); skip('xlsx->pdf success'); skip('slides->images success')
    } else {
      console.log(`Testing real conversions with ${health.version}`)
      check('health accurately reports availability + all tools',
        health.libreOffice === true && /LibreOffice/.test(health.version ?? '') &&
        JSON.stringify([...health.tools].sort()) === JSON.stringify(['docx-to-pdf', 'pptx-to-pdf', 'slides-to-images', 'xlsx-to-pdf']))

      // Invalid signatures and renamed text files must be rejected per-endpoint.
      const sigCases = [
        ['docx-to-pdf', 'fake.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
        ['pptx-to-pdf', 'fake.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
        ['xlsx-to-pdf', 'fake.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
        ['slides-to-images', 'fake.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
      ]
      for (const [ep, name, type] of sigCases) {
        const badSig = await post(18100, ep, named(new Blob([new Uint8Array([0x25, 0x21, 0x00, 0x7f, 0x13, 0x37])]), name, type))
        const body = await badSig.json().catch(() => ({}))
        check(`invalid signature rejected: ${name} -> ${ep}`, badSig.status === 400 && /signature/i.test(body.error ?? ''))
        const renamed = await post(18100, ep, named(new Blob(['just plain text, renamed']), name, type))
        check(`renamed text file rejected: ${name} -> ${ep}`, renamed.status === 400)
      }

      // A valid-signature but corrupt archive fails conversion and cleans up.
      const jobRoot = path.join(os.tmpdir(), 'docdoctor-jobs')
      const countJobs = async () => (await readdir(jobRoot).catch(() => [])).length
      const jobsBefore = await countJobs()
      const corruptZip = new Blob([new Uint8Array([0x50, 0x4b, 0x03, 0x04, ...new TextEncoder().encode('not-a-real-archive')])])
      const failedConv = await post(18100, 'docx-to-pdf', named(corruptZip, 'corrupt.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))
      check('corrupt archive conversion fails honestly (422)', failedConv.status === 422)
      await new Promise((r) => setTimeout(r, 500))
      check('failed conversion cleans up its job folder', (await countJobs()) === jobsBefore)
      const { Document, Packer, Paragraph } = await import('docx')
      const docx = new Document({ sections: [{ children: [new Paragraph('LibreOffice conversion test')] }] })
      const docxFile = named(await Packer.toBlob(docx), 'report.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')
      const r1 = await post(18100, 'docx-to-pdf', docxFile)
      check('docx->pdf returns a real PDF', r1.status === 200 && await isPdf(r1))

      const PptxGenJS = (await import('pptxgenjs')).default
      const deck = new PptxGenJS()
      deck.addSlide().addText('Slide One', { x: 1, y: 1, fontSize: 24 })
      deck.addSlide().addText('Slide Two', { x: 1, y: 1, fontSize: 24 })
      const pptxBlob = await deck.write({ outputType: 'blob' })
      const pptxFile = named(pptxBlob, 'deck.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
      const r2 = await post(18100, 'pptx-to-pdf', pptxFile)
      let pptxPages = 0
      if (r2.status === 200) pptxPages = (await PDFDocument.load(await r2.arrayBuffer())).getPageCount()
      check('pptx->pdf returns 2-page PDF', r2.status === 200 && pptxPages === 2)

      const form = new FormData(); form.append('file', pptxFile); form.append('format', 'jpg')
      const r3 = await fetch('http://127.0.0.1:18100/api/convert/slides-to-images', { method: 'POST', body: form })
      const zipBuf = r3.status === 200 ? await r3.arrayBuffer() : new ArrayBuffer(0)
      const zipHead = new Uint8Array(zipBuf.slice(0, 2))
      check('slides->images returns ZIP (PK)', r3.status === 200 && zipHead[0] === 0x50 && zipHead[1] === 0x4B)
      let slideImages = []
      if (r3.status === 200) {
        const JSZip = (await import('jszip')).default
        const zip = await JSZip.loadAsync(zipBuf)
        slideImages = Object.keys(zip.files).filter((n) => /\.jpe?g$/i.test(n))
        const firstBytes = slideImages.length ? await zip.file(slideImages[0]).async('uint8array') : new Uint8Array()
        check('slides archive contains 2 rendered JPEGs', slideImages.length === 2 && firstBytes[0] === 0xFF && firstBytes[1] === 0xD8)
      }

      const XLSX = await import('xlsx')
      const wb = XLSX.utils.book_new()
      XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Item', 'Qty'], ['Pens', 12]]), 'Stock')
      const xlsxFile = named(new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })]), 'stock.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
      const r4 = await post(18100, 'xlsx-to-pdf', xlsxFile)
      check('xlsx->pdf returns a real PDF', r4.status === 200 && await isPdf(r4))

      const bad = await post(18100, 'docx-to-pdf', named(new Blob(['not a docx']), 'bad.docx', 'text/plain'))
      check('corrupt docx rejected honestly (4xx, no fake PDF)', bad.status >= 400 && bad.status < 500 && !(await isPdf(bad).catch(() => false)))
    }
  } finally { child.kill() }
}

// ── C: PDF compressor forced off -> honest 503 ────────────────
{
  const { child, health } = await startServer(18103, { LIBREOFFICE_PATH: 'off', PDF_COMPRESSOR: 'off' })
  try {
    check('health reports PDF compressor missing', health.pdfCompressor === false)
    const doc = await PDFDocument.create()
    doc.addPage([300, 300])
    const pdfFile = named(new Blob([await doc.save()]), 'a.pdf', 'application/pdf')
    const res = await post(18103, 'compress-pdf', pdfFile)
    const body = await res.json().catch(() => ({}))
    check('compress-pdf returns 503 (never fake) when no compressor', res.status === 503 && /No PDF compressor is available/i.test(body.error ?? ''))
  } finally { child.kill() }
}

{
  const PC = await import('../server/src/pdf-compress.js')
  check('compressor probe rejects non-compressor binaries (node.exe)', (await PC.probeCompressor(process.execPath)) === null)
  check('compressor candidates honor PDF_COMPRESSOR=off', (() => { const prev = process.env.PDF_COMPRESSOR; process.env.PDF_COMPRESSOR = 'off'; const n = PC.compressorCandidates().length; if (prev === undefined) delete process.env.PDF_COMPRESSOR; else process.env.PDF_COMPRESSOR = prev; return n === 0 })())
}

// ── D: real PDF compression (only when gs/qpdf exists here) ───
{
  const { child, health } = await startServer(18105, { LIBREOFFICE_PATH: 'off' })
  try {
    if (!health.pdfCompressor) skip('compress-pdf real compression (gs/qpdf not installed)')
    else {
      check('health names the compressor', typeof health.compressor === 'string' && health.compressor.length > 0)
      const doc = await PDFDocument.create()
      const page = doc.addPage([612, 792])
      page.drawText('DocDoctor server compression test', { x: 48, y: 700, size: 14 })
      const pdfFile = named(new Blob([await doc.save()]), 'doc.pdf', 'application/pdf')
      const res = await post(18105, 'compress-pdf', pdfFile)
      check('compress-pdf returns a real PDF', res.status === 200 && await isPdf(res.clone()))
      check('compress-pdf reports sizes', Number(res.headers.get('x-original-size')) > 0 && Number(res.headers.get('x-compressed-size')) > 0)
      if (res.status === 200) {
        const out = await PDFDocument.load(await res.arrayBuffer())
        check('compressed PDF keeps its page (text-preserving pipeline)', out.getPageCount() === 1)
      }
      const bad = await post(18105, 'compress-pdf', named(new Blob(['not a pdf']), 'bad.pdf', 'application/pdf'))
      check('compress-pdf rejects non-PDF input (400)', bad.status === 400)

      // Regression guard: embedded JPEGs must actually shrink (Ghostscript
      // passes JPEG images through untouched unless told not to).
      try {
        const { createCanvas } = await import('../server/node_modules/@napi-rs/canvas/index.js')
        const cv = createCanvas(1600, 1200)
        const cx = cv.getContext('2d')
        const grad = cx.createLinearGradient(0, 0, 1600, 1200)
        grad.addColorStop(0, '#87b5d9'); grad.addColorStop(1, '#7fb069')
        cx.fillStyle = grad; cx.fillRect(0, 0, 1600, 1200)
        for (let i = 0; i < 120; i++) {
          cx.fillStyle = `rgba(${120 + Math.floor(Math.random() * 120)},110,90,0.5)`
          cx.beginPath(); cx.arc(Math.random() * 1600, Math.random() * 1200, 20 + Math.random() * 120, 0, Math.PI * 2); cx.fill()
        }
        const jpg = await cv.encode('jpeg', 92)
        const imgDoc = await PDFDocument.create()
        const imgPage = imgDoc.addPage([612, 792])
        imgPage.drawImage(await imgDoc.embedJpg(new Uint8Array(jpg)), { x: 0, y: 0, width: 612, height: 792 })
        imgPage.drawText('Image compression test', { x: 48, y: 756, size: 14 })
        const imgPdf = named(new Blob([await imgDoc.save()]), 'photo.pdf', 'application/pdf')
        const form2 = new FormData(); form2.append('file', imgPdf); form2.append('level', 'recommended')
        const res2 = await fetch('http://127.0.0.1:18105/api/convert/compress-pdf', { method: 'POST', body: form2 })
        const inSize = Number(res2.headers.get('x-original-size'))
        const outSize = Number(res2.headers.get('x-compressed-size'))
        check('compress-pdf actually shrinks an image PDF (>40%)', res2.status === 200 && outSize > 0 && outSize < inSize * 0.6)
      } catch { skip('compress-pdf image shrink (canvas unavailable)') }
    }
  } finally { child.kill() }
}

console.log(`\n${pass} passed, ${fail} failed, ${skipped} skipped`)
process.exit(fail ? 1 : 0)
