import { spawn } from 'node:child_process'
import { existsSync, readdirSync } from 'node:fs'
import path from 'node:path'

/**
 * PDF compressor discovery (Ghostscript preferred, qpdf fallback):
 *  1. GHOSTSCRIPT_PATH / QPDF_PATH / PDF_COMPRESSOR_PATH env vars
 *     (PDF_COMPRESSOR=off — or a path value of "off"/"none" — disables)
 *  2. Standard install locations (Windows Ghostscript folders, /usr/bin)
 *  3. `gswin64c` / `gs` / `qpdf` on PATH
 *
 * Each candidate is verified with `--version`; only output that really
 * names Ghostscript or qpdf passes. Ghostscript downsamples images per
 * preset (text stays selectable); qpdf only recompresses streams —
 * the endpoint reports which engine ran so nothing is oversold.
 */
export function compressorCandidates() {
  if (/^(off|none)$/i.test((process.env.PDF_COMPRESSOR ?? '').trim())) return []
  const configured = process.env.GHOSTSCRIPT_PATH ?? process.env.QPDF_PATH ?? process.env.PDF_COMPRESSOR_PATH
  if (configured !== undefined) {
    const v = configured.trim()
    if (/^(off|none)$/i.test(v)) return []
    if (v) {
      if (existsSync(v)) return [v]
      console.warn(`[docdoctor] compressor path "${v}" does not exist — falling back to auto-detection.`)
    }
  }
  const candidates = []
  if (process.platform === 'win32') {
    for (const root of ['C:\\Program Files\\gs', 'C:\\Program Files (x86)\\gs']) {
      try {
        for (const sub of readdirSync(root)) {
          for (const exe of ['gswin64c.exe', 'gswin32c.exe']) {
            const p = path.join(root, sub, 'bin', exe)
            if (existsSync(p)) candidates.push(p)
          }
        }
      } catch { /* not installed there */ }
    }
    candidates.push('gswin64c', 'gswin32c', 'gs', 'qpdf')
  } else {
    for (const exe of ['/usr/bin/gs', '/usr/local/bin/gs', '/usr/bin/qpdf', '/usr/local/bin/qpdf']) {
      if (existsSync(exe)) candidates.push(exe)
    }
    candidates.push('gs', 'qpdf')
  }
  return [...new Set(candidates)]
}

/** Run a binary with an argv array (never a shell). Rejects on timeout/non-zero. */
export function runBinary(bin, args, timeoutMs = 120_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true })
    let stdout = '', stderr = ''
    child.stdout?.on('data', (d) => { stdout += d.toString().slice(0, 2000) })
    child.stderr?.on('data', (d) => { stderr += d.toString().slice(0, 2000) })
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('PDF compression timed out.')) }, timeoutMs)
    child.on('error', (e) => { clearTimeout(timer); reject(e) })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(stdout)
      else reject(new Error(`Compressor exited with code ${code}. ${(stderr || stdout).split('\n')[0] ?? ''}`.trim()))
    })
  })
}

/** Verify a candidate really is Ghostscript or qpdf; returns {kind, version} or null. */
export async function probeCompressor(bin) {
  if (!bin) return null
  try {
    const out = (await runBinary(bin, ['--version'], 15_000)).trim().split('\n')[0] ?? ''
    if (/ghostscript/i.test(out)) return { kind: 'ghostscript', version: out }
    if (/qpdf/i.test(out)) return { kind: 'qpdf', version: out }
    // Ghostscript's --version prints only the number ("10.08.0"), so a
    // candidate found under a Ghostscript binary name is classified by
    // name and must still have answered with a version-looking string.
    const name = path.basename(bin).toLowerCase()
    if (/^\d+\.\d+/.test(out) && (name === 'gs' || name === 'gs.exe' || /^gswin(64|32)c(\.exe)?$/.test(name))) {
      return { kind: 'ghostscript', version: `Ghostscript ${out}` }
    }
    return null
  } catch {
    return null
  }
}

/** Resolve the first candidate that verifiably compresses PDFs. */
export async function resolvePdfCompressor() {
  for (const bin of compressorCandidates()) {
    const found = await probeCompressor(bin)
    if (found) return { bin, ...found }
  }
  return { bin: null, kind: null, version: null }
}

const GS_LEVELS = {
  extreme: { preset: 'screen', dpi: 72 },
  recommended: { preset: 'ebook', dpi: 150 },
  less: { preset: 'printer', dpi: 300 },
}

/** Compress inPath to outPath. Level: less | recommended | extreme. */
export async function compressPdfFile({ bin, kind }, inPath, outPath, level = 'recommended', timeoutMs = 120_000) {
  if (kind === 'ghostscript') {
    const { preset, dpi } = GS_LEVELS[level] ?? GS_LEVELS.recommended
    await runBinary(bin, [
      '-sDEVICE=pdfwrite', '-dCompatibilityLevel=1.7', `-dPDFSETTINGS=/${preset}`,
      // Explicit downsampling + JPEG re-encode: the presets alone leave
      // embedded JPEG images untouched (Ghostscript passes them through
      // by default), which silently produces no size reduction.
      '-dPassThroughJPEGImages=false',
      '-dDownsampleColorImages=true', `-dColorImageResolution=${dpi}`,
      '-dDownsampleGrayImages=true', `-dGrayImageResolution=${dpi}`,
      '-dDownsampleMonoImages=true', `-dMonoImageResolution=${dpi}`,
      '-dNOPAUSE', '-dQUIET', '-dBATCH', `-sOutputFile=${outPath}`, inPath,
    ], timeoutMs)
  } else if (kind === 'qpdf') {
    // qpdf cannot downsample images; it recompresses streams losslessly.
    await runBinary(bin, ['--object-streams=generate', '--compress-streams=y', '--recompress-flate', inPath, outPath], timeoutMs)
  } else {
    throw new Error('No PDF compressor is available.')
  }
}

export const COMPRESS_HINT =
  'No PDF compressor is available on this server. Install Ghostscript (https://www.ghostscript.com/) ' +
  'or qpdf, or set GHOSTSCRIPT_PATH / QPDF_PATH, then restart this service.'
