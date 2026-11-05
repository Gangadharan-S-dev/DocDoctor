import { PDFDocument } from '@cantoo/pdf-lib'
import type { OutputFile } from './download'
import { stem } from './download'

const pdfBlob = (bytes: Uint8Array) => new Blob([bytes.buffer as ArrayBuffer], { type: 'application/pdf' })
const isEncryptedError = (e: unknown) =>
  e instanceof Error && (e.name === 'EncryptedPDFError' || /encrypted/i.test(e.message))

/**
 * Encrypt a PDF with AES-256 (ISO 32000-2) via the @cantoo/pdf-lib fork.
 * The output is verified before success: it must refuse to open without the
 * password and open with it.
 */
export async function protectPdf(file: File, password: string): Promise<OutputFile> {
  if (!password || password.length < 4) throw new Error('Use a password of at least 4 characters.')
  const bytes = await file.arrayBuffer()
  let doc
  try {
    doc = await PDFDocument.load(bytes)
  } catch (e) {
    if (isEncryptedError(e)) throw new Error('This PDF is already password-protected. Unlock it first, then protect it with a new password.')
    throw new Error('Could not open this PDF — it may be damaged.')
  }
  doc.encrypt({ userPassword: password, algorithm: 'AES-256' })
  const out = await doc.save()
  // Self-verification: never hand back a file that does not actually lock.
  try {
    await PDFDocument.load(out.slice())
    throw new Error('Verification failed: the output opened without a password, so it was not returned.')
  } catch (e) {
    if (e instanceof Error && e.message.startsWith('Verification failed')) throw e
    // Expected: opening without the password must fail.
  }
  const check = await PDFDocument.load(out.slice(), { password } as Parameters<typeof PDFDocument.load>[1])
  if (!check.getPageCount()) throw new Error('Verification failed: encrypted output has no pages.')
  return { name: `${stem(file.name)}-protected.pdf`, blob: pdfBlob(out) }
}

/**
 * Remove password protection — only with the correct password supplied by
 * someone authorized. Wrong passwords fail; nothing is ever bypassed.
 */
export async function unlockPdf(file: File, password: string): Promise<OutputFile> {
  if (!password) throw new Error('Enter the document password.')
  const bytes = await file.arrayBuffer()
  let opened
  try {
    opened = await PDFDocument.load(bytes.slice(), { password } as Parameters<typeof PDFDocument.load>[1])
  } catch (e) {
    if (e instanceof Error && /password incorrect/i.test(e.message)) {
      throw new Error('Incorrect password. DocDoctor can only unlock a PDF with its correct password — it cannot bypass or crack encryption.')
    }
    if (isEncryptedError(e)) throw new Error('This PDF is encrypted and the password was not accepted.')
    throw new Error('Could not open this PDF — it may be damaged or use an unsupported encryption type.')
  }
  // Rebuild into a fresh document so the Encrypt dictionary is dropped.
  const fresh = await PDFDocument.create()
  ;(await fresh.copyPages(opened, opened.getPageIndices())).forEach((p) => fresh.addPage(p))
  const out = await fresh.save()
  // Verify the unlocked copy really opens without a password.
  const check = await PDFDocument.load(out.slice())
  if (!check.getPageCount()) throw new Error('Verification failed: unlocked output has no pages.')
  return { name: `${stem(file.name)}-unlocked.pdf`, blob: pdfBlob(out) }
}
