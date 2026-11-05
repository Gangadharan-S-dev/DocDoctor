import { spawn } from 'node:child_process'
import { existsSync } from 'node:fs'
import path from 'node:path'

/**
 * LibreOffice discovery, in priority order:
 *  1. LIBREOFFICE_PATH env var ("off"/"none" explicitly disables detection)
 *  2. SOFFICE_PATH env var (legacy name, still honored)
 *  3. Standard Windows install locations (Program Files, x86, per-user)
 *  4. `soffice` / `soffice.com` on PATH (shell-free spawn)
 *
 * Each candidate is verified by probeLibreOffice(); the first one that
 * really answers as LibreOffice wins.
 */
export function libreOfficeCandidates() {
  const configured = process.env.LIBREOFFICE_PATH ?? process.env.SOFFICE_PATH
  if (configured !== undefined) {
    const v = configured.trim()
    if (/^(off|none)$/i.test(v)) return []
    if (v) {
      if (existsSync(v)) return [v]
      // A configured-but-missing path should not silently win; fall through
      // to auto-detection so a stale env var can't break a working install.
      console.warn(`[docdoctor] LIBREOFFICE_PATH is set to "${v}" but no file exists there — falling back to auto-detection.`)
    }
  }

  const candidates = []
  if (process.platform === 'win32') {
    const roots = [
      process.env.ProgramFiles,
      process.env['ProgramFiles(x86)'],
      process.env.ProgramW6432,
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs'),
      'C:\\Program Files',
      'C:\\Program Files (x86)',
    ].filter(Boolean)
    for (const root of roots) {
      // soffice.com is the console launcher: --version/--convert-to return
      // synchronously, unlike the soffice.exe GUI stub which can linger.
      const com = path.join(root, 'LibreOffice', 'program', 'soffice.com')
      if (existsSync(com)) candidates.push(com)
      const exe = path.join(root, 'LibreOffice', 'program', 'soffice.exe')
      if (existsSync(exe)) candidates.push(exe)
    }
    candidates.push('soffice.com', 'soffice.exe', 'soffice')
  } else {
    for (const exe of ['/usr/bin/soffice', '/usr/local/bin/soffice', '/snap/bin/libreoffice', '/opt/libreoffice/program/soffice']) {
      if (existsSync(exe)) candidates.push(exe)
    }
    candidates.push('soffice', 'libreoffice')
  }
  return [...new Set(candidates)]
}

/** Back-compat: first candidate without verification. Prefer resolveLibreOffice(). */
export function findLibreOffice() {
  return libreOfficeCandidates()[0] ?? null
}

/** Resolve the first candidate that verifiably is LibreOffice. */
export async function resolveLibreOffice() {
  for (const bin of libreOfficeCandidates()) {
    const version = await probeLibreOffice(bin)
    if (version) return { bin, version }
  }
  return { bin: null, version: null }
}

/** Run soffice with an argv array (never a shell). Rejects on timeout/non-zero. */
export function runLibreOffice(bin, args, timeoutMs = 120_000) {
  return new Promise((resolve, reject) => {
    const child = spawn(bin, args, { windowsHide: true })
    let stdout = '', stderr = ''
    child.stdout?.on('data', (d) => { stdout += d.toString().slice(0, 2000) })
    child.stderr?.on('data', (d) => { stderr += d.toString().slice(0, 2000) })
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('LibreOffice conversion timed out.')) }, timeoutMs)
    child.on('error', (e) => { clearTimeout(timer); reject(e) })
    child.on('close', (code) => {
      clearTimeout(timer)
      if (code === 0) resolve(stdout)
      else reject(new Error(`LibreOffice exited with code ${code}. ${stderr.split('\n')[0] ?? ''}`.trim()))
    })
  })
}

/** Verify a candidate binary really is LibreOffice; returns its version string or null. */
export async function probeLibreOffice(bin) {
  if (!bin) return null
  try {
    const out = await runLibreOffice(bin, ['--version'], 15_000)
    const first = out.trim().split('\n')[0] ?? ''
    // Any executable can answer --version; only LibreOffice may pass.
    return /libreoffice/i.test(first) ? first : null
  } catch {
    return null
  }
}

export const INSTALL_HINT =
  'LibreOffice is not installed (or not found). Install it from https://www.libreoffice.org/download/ ' +
  'or with `winget install --id TheDocumentFoundation.LibreOffice`, then restart this service. ' +
  'If it is installed in a custom location, set LIBREOFFICE_PATH to the full path of soffice.exe.'
