import express from 'express'
import multer from 'multer'
import { mkdir, rm, readdir, stat } from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { randomUUID } from 'node:crypto'
import { renderPdfToImages } from './render.js'
import { resolveLibreOffice, runLibreOffice, INSTALL_HINT } from './libreoffice.js'
import { resolvePdfCompressor, compressPdfFile, COMPRESS_HINT } from './pdf-compress.js'

const TMP_ROOT = path.join(os.tmpdir(), 'docdoctor-jobs')
const MAX_FILE = 50 * 1024 * 1024
const JOB_TIMEOUT_MS = 120_000
const RETENTION_MS = 30 * 60_000

await mkdir(TMP_ROOT, { recursive: true }).catch(() => {})

// Sweep stale job folders (crash/failure cleanup, max retention 30 min).
setInterval(async () => {
  try {
    for (const name of await readdir(TMP_ROOT)) {
      const p = path.join(TMP_ROOT, name)
      const s = await stat(p).catch(() => null)
      if (s && Date.now() - s.mtimeMs > RETENTION_MS) await rm(p, { recursive: true, force: true })
    }
  } catch { /* tmp root may not exist yet */ }
}, 5 * 60_000).unref()

// ── App ──────────────────────────────────────────────────────────
const SERVER_TOOLS = ['pptx-to-pdf', 'slides-to-images', 'docx-to-pdf', 'xlsx-to-pdf']

export async function createApp() {
  const { bin: soffice, version } = await resolveLibreOffice()
  const alive = version !== null
  const compressor = await resolvePdfCompressor()
  const app = express()
  app.disable('x-powered-by')
  if (process.env.TRUST_PROXY) app.set('trust proxy', process.env.TRUST_PROXY)

  // Security headers on every response (helmet-equivalent, hand-rolled to keep deps small).
  app.use((_req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff')
    res.setHeader('X-Frame-Options', 'DENY')
    res.setHeader('Referrer-Policy', 'no-referrer')
    res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'")
    next()
  })

  // CORS only when an explicit allowlist origin is configured (same-origin by default).
  const allowedOrigin = process.env.ALLOWED_ORIGIN
  if (allowedOrigin) {
    app.use((req, res, next) => {
      if (req.headers.origin === allowedOrigin) {
        res.setHeader('Access-Control-Allow-Origin', allowedOrigin)
        res.setHeader('Vary', 'Origin')
        if (req.method === 'OPTIONS') {
          res.setHeader('Access-Control-Allow-Methods', 'GET, POST')
          res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
          return res.sendStatus(204)
        }
      }
      next()
    })
  }

  // Tiny in-memory rate limit: 30 conversions / 10 min / IP.
  // Single-instance only — put a shared limiter in front for multi-instance deploys.
  const hits = new Map()
  const rateLimit = (req, res, next) => {
    const now = Date.now()
    const list = (hits.get(req.ip) ?? []).filter((t) => now - t < 600_000)
    if (list.length >= 30) {
      res.setHeader('Retry-After', '600')
      return res.status(429).json({ error: 'Too many conversions — please wait a few minutes.' })
    }
    list.push(now); hits.set(req.ip, list); next()
  }

  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: MAX_FILE, files: 1 },
  })

  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      libreOffice: alive,
      version: alive ? version : null,
      tools: alive ? SERVER_TOOLS : [],
      ...(alive ? {} : { installHint: INSTALL_HINT }),
      pdfCompressor: compressor.bin !== null,
      compressor: compressor.version,
    })
  })

  const requireSoffice = (_req, res, next) => {
    if (!alive) return res.status(503).json({ error: INSTALL_HINT })
    next()
  }

  const requireCompressor = (_req, res, next) => {
    if (!compressor.bin) return res.status(503).json({ error: COMPRESS_HINT })
    next()
  }

  /** Run one soffice conversion inside an isolated job dir; always cleans up. */
  async function convert(req, res, { toFormat, outName, after }) {
    const jobDir = path.join(TMP_ROOT, randomUUID())
    await mkdir(jobDir, { recursive: true })
    try {
      const original = (req.file.originalname ?? 'input').replace(/[^\w.\-]+/g, '_')
      const inPath = path.join(jobDir, original)
      const { writeFile, readFile } = await import('node:fs/promises')
      await writeFile(inPath, req.file.buffer)
      // Per-job LibreOffice profile: concurrent jobs must never share (and
      // lock) the default user profile.
      const profileUrl = new URL(`file:///${path.join(jobDir, 'profile').replace(/\\/g, '/')}`).href
      await runLibreOffice(soffice, ['--headless', '--norestore', `-env:UserInstallation=${profileUrl}`, '--convert-to', toFormat, '--outdir', jobDir, inPath], JOB_TIMEOUT_MS)
      const files = []
      for (const f of await readdir(jobDir)) {
        if (f === original || f === 'profile') continue
        const s = await stat(path.join(jobDir, f)).catch(() => null)
        if (s?.isFile()) files.push(f)
      }
      if (!files.length) throw new Error('Converter produced no output file.')
      let outPath = path.join(jobDir, files[0])
      let download = outName(files[0])
      let contentType = 'application/octet-stream'
      if (after) ({ outPath, download, contentType } = await after(jobDir, outPath))
      const data = await readFile(outPath)
      res.setHeader('Content-Type', contentType)
      res.setHeader('Content-Disposition', `attachment; filename="${download}"`)
      res.send(data)
    } catch (e) {
      res.status(422).json({ error: e instanceof Error ? e.message : 'Conversion failed.' })
    } finally {
      await rm(jobDir, { recursive: true, force: true }).catch(() => {})
    }
  }

  const stem = (n) => n.replace(/\.[^.]+$/, '')

  /** OOXML files are ZIPs (PK…); legacy .doc/.xls/.ppt are OLE2 (D0CF…). Anything else is not an Office file, whatever the name says. */
  const looksLikeOffice = (buf) =>
    !!buf && buf.length > 4 && ((buf[0] === 0x50 && buf[1] === 0x4b) || (buf[0] === 0xd0 && buf[1] === 0xcf))
  const requireOfficeFile = (res, file) => {
    if (!looksLikeOffice(file.buffer)) {
      res.status(400).json({ error: 'This file does not appear to be a valid Office document (bad file signature).' })
      return false
    }
    return true
  }

  app.post('/api/convert/pptx-to-pdf', rateLimit, requireSoffice, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' })
    if (!/\.pptx?$/i.test(req.file.originalname)) return res.status(400).json({ error: 'Expected a .ppt or .pptx file.' })
    if (!requireOfficeFile(res, req.file)) return
    await convert(req, res, { toFormat: 'pdf', outName: (f) => f, after: pdfAfter(req) })
  })

  const pdfAfter = (req) => async (_dir, outPath) => {
    const { readFile } = await import('node:fs/promises')
    const head = (await readFile(outPath)).subarray(0, 4).toString('latin1')
    if (head !== '%PDF') throw new Error('LibreOffice did not produce a valid PDF for this file.')
    return { outPath, download: `${stem(req.file.originalname)}.pdf`, contentType: 'application/pdf' }
  }

  app.post('/api/convert/docx-to-pdf', rateLimit, requireSoffice, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' })
    if (!/\.docx?$/i.test(req.file.originalname)) return res.status(400).json({ error: 'Expected a .doc or .docx file.' })
    if (!requireOfficeFile(res, req.file)) return
    await convert(req, res, { toFormat: 'pdf', outName: (f) => f, after: pdfAfter(req) })
  })

  app.post('/api/convert/xlsx-to-pdf', rateLimit, requireSoffice, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' })
    if (!/\.xlsx?$/i.test(req.file.originalname)) return res.status(400).json({ error: 'Expected an .xls or .xlsx file.' })
    if (!requireOfficeFile(res, req.file)) return
    await convert(req, res, { toFormat: 'pdf', outName: (f) => f, after: pdfAfter(req) })
  })

  app.post('/api/convert/slides-to-images', rateLimit, requireSoffice, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' })
    if (!/\.pptx?$/i.test(req.file.originalname)) return res.status(400).json({ error: 'Expected a .ppt or .pptx file.' })
    if (!requireOfficeFile(res, req.file)) return
    const format = req.body?.format === 'png' ? 'png' : 'jpg'
    await convert(req, res, {
      toFormat: 'pdf',
      outName: (f) => f,
      after: async (jobDir, pdfPath) => {
        const { zipPath, count } = await renderPdfToImages(pdfPath, jobDir, stem(req.file.originalname), format)
        if (!count) throw new Error('No slides could be rendered.')
        return { outPath: zipPath, download: `${stem(req.file.originalname)}-slides.zip`, contentType: 'application/zip' }
      },
    })
  })

  app.post('/api/convert/compress-pdf', rateLimit, requireCompressor, upload.single('file'), async (req, res) => {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded.' })
    if (!/\.pdf$/i.test(req.file.originalname)) return res.status(400).json({ error: 'Expected a .pdf file.' })
    if (req.file.buffer.subarray(0, 4).toString('latin1') !== '%PDF') {
      return res.status(400).json({ error: 'This file does not appear to be a valid PDF (bad file signature).' })
    }
    const level = ['less', 'recommended', 'extreme'].includes(req.body?.level) ? req.body.level : 'recommended'
    const jobDir = path.join(TMP_ROOT, randomUUID())
    await mkdir(jobDir, { recursive: true })
    try {
      const { writeFile, readFile } = await import('node:fs/promises')
      const inPath = path.join(jobDir, 'input.pdf')
      const outPath = path.join(jobDir, 'output.pdf')
      await writeFile(inPath, req.file.buffer)
      await compressPdfFile(compressor, inPath, outPath, level, JOB_TIMEOUT_MS)
      let data = await readFile(outPath)
      if (!data.length || data.subarray(0, 4).toString('latin1') !== '%PDF') throw new Error('Compressor did not produce a valid PDF.')

      // If output was larger than input and level was not extreme, try extreme (screen preset) with Ghostscript
      if (data.length >= req.file.buffer.length && level !== 'extreme' && compressor.kind === 'ghostscript') {
        try {
          await compressPdfFile(compressor, inPath, outPath, 'extreme', JOB_TIMEOUT_MS)
          const extremeData = await readFile(outPath)
          if (extremeData.length < req.file.buffer.length) {
            data = extremeData
          }
        } catch {
          // ignore
        }
      }

      // Never return a file larger than input
      if (data.length > req.file.buffer.length) {
        data = req.file.buffer
      }
      res.setHeader('Content-Type', 'application/pdf')
      res.setHeader('Content-Disposition', `attachment; filename="${stem(req.file.originalname)}-compressed.pdf"`)
      res.setHeader('X-Original-Size', String(req.file.buffer.length))
      res.setHeader('X-Compressed-Size', String(data.length))
      res.setHeader('X-Compressor', compressor.kind)
      res.send(data)
    } catch (e) {
      res.status(422).json({ error: e instanceof Error ? e.message : 'Compression failed.' })
    } finally {
      await rm(jobDir, { recursive: true, force: true }).catch(() => {})
    }
  })

  app.use('/api', (_req, res) => res.status(404).json({ error: 'Not found.' }))

  app.use((err, _req, res, _next) => {
    if (err?.code === 'LIMIT_FILE_SIZE') return res.status(413).json({ error: 'File exceeds the 50 MB server limit.' })
    if (err instanceof SyntaxError) return res.status(400).json({ error: 'Malformed request.' })
    return res.status(500).json({ error: 'Server error.' })
  })

  return { app, alive, version, compressor }
}

if (import.meta.url === `file://${process.argv[1]?.replace(/\\/g, '/')}` || process.argv[1]?.endsWith('index.js')) {
  const { app, alive, version, compressor } = await createApp()
  const port = Number(process.env.PORT ?? 8080)
  const host = process.env.HOST ?? '127.0.0.1'
  app.listen(port, host, () => {
    console.log(`DocDoctor conversion service on http://${host}:${port}`)
    console.log(alive ? `LibreOffice: ${version} — endpoints: ${SERVER_TOOLS.join(', ')}` : `LibreOffice: NOT found — endpoints return 503. ${INSTALL_HINT}`)
    console.log(compressor.bin ? `PDF compressor: ${compressor.version} — endpoint: compress-pdf` : 'PDF compressor: NOT found — compress-pdf returns 503.')
  })
}
