// Phase 3 engine tests: real DOCX/PPTX/XLSX/ZIP fixtures through the bundled engines.
import { JSDOM } from 'jsdom'
const { window } = new JSDOM('')
globalThis.DOMParser = window.DOMParser
globalThis.XMLSerializer = window.XMLSerializer

import { build } from 'esbuild'
import { mkdirSync, writeFileSync } from 'node:fs'
import JSZip from 'jszip'
import * as XLSX from 'xlsx'
import { PDFDocument } from 'pdf-lib'

mkdirSync('tests/.tmp', { recursive: true })
mkdirSync('tests/fixtures', { recursive: true })
await build({ entryPoints: ['src/processing/office.ts'], bundle: true, platform: 'node', format: 'cjs', outfile: 'tests/.tmp/office-engine.cjs', logLevel: 'silent' })
await build({ entryPoints: ['src/processing/text.ts'], bundle: true, platform: 'node', format: 'esm', outfile: 'tests/.tmp/text-engine.mjs', logLevel: 'silent' })
import { createRequire } from 'node:module'
const OFF = createRequire(import.meta.url)('./.tmp/office-engine.cjs')
const TXT = await import('./.tmp/text-engine.mjs')

let pass = 0, fail = 0
const check = (name, cond) => { const ok = typeof cond === 'function' ? cond() : cond; if (ok) { pass++; console.log('PASS', name) } else { fail++; console.log('FAIL', name) } }
const asFile = (blob, name, type) => new File([blob], name, { type })

// ── Fixtures ─────────────────────────────────────────────────────
const { Document, Packer, Paragraph, HeadingLevel } = await import('docx')
async function makeDocx(title, body) {
  const d = new Document({ sections: [{ children: [
    new Paragraph({ text: title, heading: HeadingLevel.HEADING_1 }),
    new Paragraph(body),
    new Paragraph({ text: 'Section Two', heading: HeadingLevel.HEADING_1 }),
    new Paragraph('Second section body.'),
  ] }] })
  return asFile(await Packer.toBlob(d), `${title.replace(/\s/g, '')}.docx`, OFF.DOCX_TYPE)
}
const docxA = await makeDocx('Alpha Doc', 'Alpha body text here.')
const docxB = await makeDocx('Beta Doc', 'Beta body text here.')
writeFileSync('tests/fixtures/alpha.docx', new Uint8Array(await docxA.arrayBuffer()))

const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Name', 'Score'], ['Ada', 10], ['Grace', 9]]), 'People')
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['City'], ['Paris']]), 'Cities')
const xlsxFile = asFile(new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })]), 'book.xlsx', OFF.XLSX_TYPE)
writeFileSync('tests/fixtures/book.xlsx', new Uint8Array(await xlsxFile.arrayBuffer()))
const csvFile = asFile(new Blob(['a,b\n1,2\n1,2\n3,4'], { type: 'text/csv' }), 'data.csv', 'text/csv')

async function makePptx() {
  const zip = new JSZip()
  const slideXml = (t) => `<?xml version="1.0"?><p:sld xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:cSld><p:spTree><p:sp><p:txBody><a:p><a:r><a:t>${t}</a:t></a:r></a:p></p:txBody></p:sp></p:spTree></p:cSld></p:sld>`
  zip.file('[Content_Types].xml', `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slides/slide1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slides/slide2.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/><Override PartName="/ppt/slides/slide3.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/></Types>`)
  zip.file('ppt/presentation.xml', `<?xml version="1.0"?><p:presentation xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><p:sldIdLst><p:sldId id="256" r:id="rId1"/><p:sldId id="257" r:id="rId2"/><p:sldId id="258" r:id="rId3"/></p:sldIdLst></p:presentation>`)
  zip.file('ppt/_rels/presentation.xml.rels', `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide3.xml"/></Relationships>`)
  for (let i = 1; i <= 3; i++) {
    zip.file(`ppt/slides/slide${i}.xml`, slideXml(`Slide Title ${i}`))
    zip.file(`ppt/slides/_rels/slide${i}.xml.rels`, `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`)
  }
  const blob = await zip.generateAsync({ type: 'blob' })
  return asFile(blob, 'deck.pptx', OFF.PPTX_TYPE)
}
const pptxFile = await makePptx()

async function deckOrder(out) {
  const zip = await JSZip.loadAsync(await out.blob.arrayBuffer())
  const rels = await zip.file('ppt/_rels/presentation.xml.rels').async('string')
  const pres = await zip.file('ppt/presentation.xml').async('string')
  const idToTarget = Object.fromEntries([...rels.matchAll(/Id="(rId\d+)"[^>]*Target="(slides\/slide\d+\.xml)"/g)].map((m) => [m[1], m[2]]))
  return [...pres.matchAll(/r:id="(rId\d+)"/g)].map((m) => idToTarget[m[1]])
}

// ── Word ─────────────────────────────────────────────────────────
const txt = await (await OFF.wordToText(docxA)).blob.text()
check('word->txt contains body', txt.includes('Alpha body text here.'))
const html = await (await OFF.wordToHtml(docxA)).blob.text()
check('word->html contains heading', html.includes('Alpha Doc'))
const mergedDocx = await OFF.mergeWord([docxA, docxB])
const mergedTxt = await (await OFF.wordToText(asFile(mergedDocx.blob, 'm.docx', OFF.DOCX_TYPE))).blob.text()
check('merge word contains both docs', mergedTxt.includes('Alpha body') && mergedTxt.includes('Beta body'))
const split = await OFF.splitWord(docxA, 'heading')
check('split word by heading -> 2 parts', split.length === 2)
const rebuilt = await OFF.textToDocx('# New Title\nEdited paragraph.', 'edited.docx')
check('edit word rebuild readable', (await (await OFF.wordToText(asFile(rebuilt.blob, 'e.docx', OFF.DOCX_TYPE))).blob.text()).includes('Edited paragraph.'))
const compressedDocx = await OFF.recompressPackage(docxA, 'c.docx', OFF.DOCX_TYPE)
check('compress docx still readable', (await (await OFF.wordToText(asFile(compressedDocx.blob, 'c.docx', OFF.DOCX_TYPE))).blob.text()).includes('Alpha'))
check('compress docx output is never larger than input', compressedDocx.blob.size <= docxA.size)

// ── PowerPoint ───────────────────────────────────────────────────
const slides = await OFF.listSlides(pptxFile)
check('list slides finds 3 with titles', slides.length === 3 && slides[0].title === 'Slide Title 1')
const removed = await OFF.removeSlides(pptxFile, ['ppt/slides/slide2.xml'])
check('remove slides -> 2 in order', JSON.stringify(await deckOrder(removed)) === JSON.stringify(['slides/slide1.xml', 'slides/slide3.xml']))
const extracted = await OFF.extractSlides(pptxFile, ['ppt/slides/slide3.xml'])
check('extract slides -> 1', JSON.stringify(await deckOrder(extracted)) === JSON.stringify(['slides/slide3.xml']))
const reordered = await OFF.reorderSlides(pptxFile, ['ppt/slides/slide3.xml', 'ppt/slides/slide1.xml', 'ppt/slides/slide2.xml'])
check('reorder slides order kept', JSON.stringify(await deckOrder(reordered)) === JSON.stringify(['slides/slide3.xml', 'slides/slide1.xml', 'slides/slide2.xml']))
const splitDeck = await OFF.splitPresentation(pptxFile)
check('split presentation -> 3 files', splitDeck.length === 3)
const mergedDeck = await OFF.mergePresentations([pptxFile, pptxFile])
check('merge presentations -> 6 slides', (await deckOrder(mergedDeck)).length === 6)

// ── Excel ────────────────────────────────────────────────────────
const csvXlsx = await OFF.csvToExcel(csvFile)
const backCsv = await OFF.excelToCsv(asFile(csvXlsx.blob, 'b.xlsx', OFF.XLSX_TYPE))
check('csv->excel->csv roundtrip', (await backCsv[0].blob.text()).includes('1,2'))
check('sheet names', JSON.stringify(await OFF.sheetNames(xlsxFile)) === JSON.stringify(['People', 'Cities']))
const mergedWb = await OFF.mergeExcel([xlsxFile, xlsxFile])
check('merge excel dedupes sheet names', (await OFF.sheetNames(asFile(mergedWb.blob, 'm.xlsx', OFF.XLSX_TYPE))).length === 4)
const splitWb = await OFF.splitWorksheets(xlsxFile)
check('split worksheets -> 2 files', splitWb.length === 2)
const removedSheet = await OFF.removeWorksheets(xlsxFile, ['Cities'])
check('remove worksheets', JSON.stringify(await OFF.sheetNames(asFile(removedSheet.blob, 'r.xlsx', OFF.XLSX_TYPE))) === JSON.stringify(['People']))
check('excel->html has table', (await (await OFF.excelToHtml(xlsxFile)).blob.text()).includes('<table'))
const pdfOut = await OFF.excelToPdf(xlsxFile)
check('excel->pdf valid', (await PDFDocument.load(await pdfOut.blob.arrayBuffer())).getPageCount() === 2)

// ── Text / ZIP ───────────────────────────────────────────────────
const zipped = await TXT.createZip([csvFile, asFile(new Blob(['hello']), 'note.txt', 'text/plain')])
const extractedFiles = await TXT.extractZip(asFile(zipped.blob, 'f.zip', 'application/zip'))
check('zip create/extract roundtrip', extractedFiles.length === 2 && extractedFiles.some((f) => f.name === 'note.txt'))
{
  // Path traversal in entry names must be stripped, never preserved.
  const evil = new JSZip()
  evil.file('../evil.txt', 'x')
  evil.file('a/../../evil2.txt', 'y')
  const evilOut = await TXT.extractZip(asFile(await evil.generateAsync({ type: 'blob' }), 'e.zip', 'application/zip'))
  check('zip extraction strips traversal', evilOut.every((f) => !f.name.includes('..')))
  // Entry-count limit fails closed.
  const many = new JSZip()
  for (let i = 0; i < 201; i++) many.file(`f${i}.txt`, 'x')
  let limitThrew = false
  try { await TXT.extractZip(asFile(await many.generateAsync({ type: 'blob' }), 'm.zip', 'application/zip')) } catch { limitThrew = true }
  check('zip extraction enforces 200-file limit', limitThrew)
}
check('json formatter pretty', TXT.formatJson('{"a":1}', false) === '{\n  "a": 1\n}')
check('json formatter rejects invalid', () => { try { TXT.formatJson('{nope', false); return false } catch { return true } })
check('json->xml', TXT.jsonToXml('{"user":{"name":"Ada"}}').includes('<name>Ada</name>'))
check('csv dedupe', TXT.csvTools('a,b\n1,2\n1,2', 'dedupe', ',').split('\n').length === 2)
check('csv parse quoted', TXT.parseCsv('"x,y",2')[0][0] === 'x,y')

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
