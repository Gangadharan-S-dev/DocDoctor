// Protect/Unlock PDF tests (@cantoo/pdf-lib AES-256) + invalid-input checks.
import { JSDOM } from 'jsdom'
const { window } = new JSDOM('')
globalThis.DOMParser = window.DOMParser
globalThis.XMLSerializer = window.XMLSerializer

import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import { PDFDocument as CantooDoc } from '@cantoo/pdf-lib'
import { PDFDocument, StandardFonts } from 'pdf-lib'

mkdirSync('tests/.tmp', { recursive: true })
await build({ entryPoints: ['src/processing/crypto.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: 'tests/.tmp/crypto-engine.cjs', logLevel: 'silent' })
await build({ entryPoints: ['src/processing/office.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: 'tests/.tmp/office-crypto.cjs', logLevel: 'silent' })
const req = createRequire(import.meta.url)
const CRY = req('./.tmp/crypto-engine.cjs')
const OFF = req('./.tmp/office-crypto.cjs')

let pass = 0, fail = 0
const check = (name, cond) => { if (cond) { pass++; console.log('PASS', name) } else { fail++; console.log('FAIL', name) } }
const asFile = (blob, name, type) => new File([blob], name, { type })
const expectThrow = async (name, fn, match) => {
  try { await fn(); check(name, false) } catch (e) { check(name, !match || match.test(e.message)) }
}

// Fixture PDF
const doc = await PDFDocument.create()
const font = await doc.embedFont(StandardFonts.HelveticaBold)
doc.addPage([595, 842]).drawText('Confidential payroll', { x: 60, y: 700, size: 22, font })
const pdfFile = asFile(new Blob([await doc.save()], { type: 'application/pdf' }), 'payroll.pdf', 'application/pdf')

// ── Protect ──
const protectedOut = await CRY.protectPdf(pdfFile, 's3cret!')
const protectedBytes = new Uint8Array(await protectedOut.blob.arrayBuffer())
await expectThrow('protected pdf refuses to open without password', () => CantooDoc.load(protectedBytes.slice()))
{
  const opened = await CantooDoc.load(protectedBytes.slice(), { password: 's3cret!' })
  check('protected pdf opens with correct password', opened.getPageCount() === 1)
}
await expectThrow('protected pdf rejects wrong password', async () => {
  await CantooDoc.load(protectedBytes.slice(), { password: 'nope123' })
}, /password incorrect/i)
await expectThrow('protect rejects short password', () => CRY.protectPdf(pdfFile, 'abc'), /at least 4/)
await expectThrow('protect rejects already-encrypted input', () =>
  CRY.protectPdf(asFile(protectedOut.blob, 'p.pdf', 'application/pdf'), 'another1'), /already password-protected/)
await expectThrow('protect rejects invalid file', () =>
  CRY.protectPdf(asFile(new Blob(['junk']), 'j.pdf', 'application/pdf'), 'longenough'), /could not open/i)

// ── Unlock ──
const protectedFile = asFile(protectedOut.blob, 'payroll-protected.pdf', 'application/pdf')
const unlocked = await CRY.unlockPdf(protectedFile, 's3cret!')
{
  const opened = await CantooDoc.load(new Uint8Array(await unlocked.blob.arrayBuffer()))
  check('unlocked pdf opens with no password', opened.getPageCount() === 1)
}
await expectThrow('unlock rejects wrong password (no bypass)', () => CRY.unlockPdf(protectedFile, 'wrong-pass'), /Incorrect password/)
await expectThrow('unlock requires a password', () => CRY.unlockPdf(protectedFile, ''), /Enter the document password/)

// ── Word content-block removal ──
const { Document, Packer, Paragraph, HeadingLevel } = await import('docx')
const srcDocx = new Document({ sections: [{ children: [
  new Paragraph({ text: 'Keep This Section', heading: HeadingLevel.HEADING_1 }),
  new Paragraph('Keep this paragraph.'),
  new Paragraph({ text: 'Delete This Section', heading: HeadingLevel.HEADING_1 }),
  new Paragraph('Delete this paragraph.'),
] }] })
const docxFile = asFile(await Packer.toBlob(srcDocx), 'doc.docx', OFF.DOCX_TYPE)
const blocks = await OFF.listDocxBlocks(docxFile)
check('docx blocks listed with kinds', blocks.length === 4 && blocks[0].kind === 'heading' && blocks[1].kind === 'paragraph')
const edited = await OFF.removeDocxBlocks(docxFile, [2, 3])
const editedText = await OFF.wordExtractText(asFile(edited.blob, 'e.docx', OFF.DOCX_TYPE))
check('removed section gone, kept content intact', editedText.includes('Keep this paragraph.') && !editedText.includes('Delete this paragraph.'))
await expectThrow('removing all blocks refused', () => OFF.removeDocxBlocks(docxFile, [0, 1, 2, 3]), /cannot remove all/)

const docxPages = await OFF.listDocxPages(docxFile)
check('docx pages listed with page numbers', docxPages.length >= 1 && docxPages[0].pageNumber === 1)
const removedPages = await OFF.removeDocxPages(docxFile, [2, 3])
check('remove docx pages produces valid docx', (await OFF.wordExtractText(asFile(removedPages.blob, 'p.docx', OFF.DOCX_TYPE))).includes('Keep this paragraph.'))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
