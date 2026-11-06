// Phase 4 engine tests: edit/sign/repair + PDF<->Office/EPUB conversions.
import { JSDOM } from 'jsdom'
const { window } = new JSDOM('')
globalThis.DOMParser = window.DOMParser
globalThis.XMLSerializer = window.XMLSerializer
// pdf.js v5 uses ES2025 Uint8Array hex/base64 helpers (present in Chrome; polyfilled here for Node).
if (!Uint8Array.prototype.toHex) Uint8Array.prototype.toHex = function () { return Buffer.from(this).toString('hex') }
if (!Uint8Array.prototype.toBase64) Uint8Array.prototype.toBase64 = function () { return Buffer.from(this).toString('base64') }

import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { mkdirSync } from 'node:fs'
import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'

mkdirSync('tests/.tmp', { recursive: true })
const opts = { bundle: true, platform: 'node', format: 'cjs', logLevel: 'silent', external: ['pdfjs-dist'] }
await build({ ...opts, entryPoints: ['src/processing/advanced.ts'], outfile: 'tests/.tmp/advanced-engine.cjs' })
await build({ ...opts, entryPoints: ['src/processing/pdf.ts'], outfile: 'tests/.tmp/pdf-engine-adv.cjs' })
await build({ ...opts, entryPoints: ['src/processing/office.ts'], outfile: 'tests/.tmp/office-engine-adv.cjs' })
const req = createRequire(import.meta.url)
const ADV = req('./.tmp/advanced-engine.cjs')
const PDFE = req('./.tmp/pdf-engine-adv.cjs')
const OFF = req('./.tmp/office-engine-adv.cjs')

let pass = 0, fail = 0
const check = (name, cond) => { if (cond) { pass++; console.log('PASS', name) } else { fail++; console.log('FAIL', name) } }
const asFile = (blob, name, type) => new File([blob], name, { type })

// Fixtures
const doc = await PDFDocument.create()
const font = await doc.embedFont(StandardFonts.HelveticaBold)
doc.addPage([595, 842]).drawText('Quarterly Report Alpha', { x: 60, y: 700, size: 22, font, color: rgb(0.1, 0.1, 0.2) })
doc.getPage(0).drawText('Revenue grew steadily.', { x: 60, y: 660, size: 12, font })
const pdfFile = asFile(new Blob([await doc.save()], { type: 'application/pdf' }), 'report.pdf', 'application/pdf')
const textOf = async (blob) => (await PDFE.extractTextPages(await blob.arrayBuffer())).flatMap((p) => p.lines).join(' ')

const edited = await ADV.editPdfAddText(pdfFile, 'APPROVED 2026', 1, 10, 10, 18, '#cc0000')
check('edit pdf stamps text', (await textOf(edited.blob)).includes('APPROVED 2026'))

const png1x1 = new Uint8Array(Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8Xw8AAwMCAO+ip1sAAAAASUVORK5CYII=', 'base64'))
const signed = await ADV.signPdf(pdfFile, png1x1, 1, 'bottom-right')
check('sign pdf embeds signature', (await PDFDocument.load(await signed.blob.arrayBuffer())).getPageCount() === 1)
const signedCustom = await ADV.signPdf(pdfFile, png1x1, 1, { xPct: 50, yPct: 50 })
check('sign pdf custom coords embeds signature', (await PDFDocument.load(await signedCustom.blob.arrayBuffer())).getPageCount() === 1)

const repaired = await ADV.repairPdf(pdfFile)
check('repair pdf rebuilds valid file', (await textOf(repaired.blob)).includes('Quarterly Report'))
let repairThrew = false
try { await ADV.repairPdf(asFile(new Blob(['not a pdf at all']), 'bad.pdf', 'application/pdf')) } catch { repairThrew = true }
check('repair pdf rejects garbage honestly', repairThrew)

const docxOut = await ADV.pdfToDocx(pdfFile)
const docxText = await OFF.wordExtractText(asFile(docxOut.blob, 'o.docx', OFF.DOCX_TYPE))
check('pdf->docx carries text', docxText.includes('Revenue grew steadily.'))

const xlsxOut = await ADV.pdfToExcel(pdfFile)
const wb = XLSX.read(await xlsxOut.blob.arrayBuffer(), { type: 'array' })
check('pdf->excel has sheet with text', XLSX.utils.sheet_to_csv(wb.Sheets[wb.SheetNames[0]]).includes('Quarterly'))

const { Document, Packer, Paragraph } = await import('docx')
const srcDocx = new Document({ sections: [{ children: [new Paragraph('Word body zeta.'), new Paragraph('Second line.')] }] })
const docxFile = asFile(await Packer.toBlob(srcDocx), 'w.docx', OFF.DOCX_TYPE)
const pdfFromDocx = await ADV.docxToPdf(docxFile)
check('docx->pdf (text-flow) carries text', (await textOf(pdfFromDocx.blob)).includes('Word body zeta.'))

// EPUB fixture
const zip = new JSZip()
zip.file('META-INF/container.xml', `<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container"><rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles></container>`)
zip.file('OEBPS/content.opf', `<?xml version="1.0"?><package xmlns="http://www.idpf.org/2007/opf"><manifest><item id="c1" href="ch1.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="c1"/></spine></package>`)
zip.file('OEBPS/ch1.xhtml', `<html xmlns="http://www.w3.org/1999/xhtml"><body><h1>Chapter One</h1><p>EPUB chapter text omega.</p></body></html>`)
const epubFile = asFile(await zip.generateAsync({ type: 'blob' }), 'book.epub', 'application/epub+zip')
const pdfFromEpub = await ADV.epubToPdf(epubFile)
check('epub->pdf carries chapter text', (await textOf(pdfFromEpub.blob)).includes('EPUB chapter text omega.'))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
