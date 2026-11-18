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
check('csv sort-asc & column filter', () => {
  const sorted = TXT.csvTools('Name,Score\nZoe,5\nAda,10', 'sort-asc', ',', { sortCol: 0, keepCols: [0] })
  const lines = sorted.split('\n')
  return lines[0] === 'Name' && lines[1] === 'Ada' && lines[2] === 'Zoe'
})
check('csv filter & find-replace', () => {
  const filtered = TXT.csvTools('Name,Role\nAda,Engineer\nBob,Sales', 'filter', ',', { filterQuery: 'Engineer' })
  const replaced = TXT.csvTools(filtered, 'find-replace', ',', { findText: 'Engineer', replaceText: 'Lead' })
  return replaced.includes('Ada,Lead') && !replaced.includes('Bob')
})

// Upgraded DOCX in-place find & replace + Markdown table rebuild
const replacedDocx = await OFF.replaceInDocx(docxA, 'Alpha body', 'Upgraded Alpha body', true)
const replacedTxt = await (await OFF.wordToText(asFile(replacedDocx.blob, 'rep.docx', OFF.DOCX_TYPE))).blob.text()
check('replaceInDocx preserves doc and replaces text', replacedTxt.includes('Upgraded Alpha body'))

const mdDocx = await OFF.textToDocx('# Heading\n**Bold** and *italic*\n| ColA | ColB |\n| --- | --- |\n| Val1 | Val2 |', 'md.docx')
const mdTxt = await (await OFF.wordToText(asFile(mdDocx.blob, 'md.docx', OFF.DOCX_TYPE))).blob.text()
check('textToDocx supports markdown bold and tables', mdTxt.includes('Bold') && mdTxt.includes('Val1'))

const mediaInfo = await OFF.inspectOfficeMedia(docxA)
check('inspectOfficeMedia returns summary', mediaInfo.count === 0 && mediaInfo.totalBytes > 0)

// Upgraded AES-256 Encrypted ZIP roundtrip
const encZip = await TXT.createZip([asFile(new Blob(['secret payload 123']), 'secret.txt', 'text/plain')], { password: 'correct-horse-battery' })
const encSummary = await TXT.listZipEntries(asFile(encZip.blob, 'enc.zip', 'application/zip'))
check('listZipEntries detects AES-256 encrypted archive', encSummary.encrypted === true)
const decFiles = await TXT.extractZip(asFile(encZip.blob, 'enc.zip', 'application/zip'), { password: 'correct-horse-battery' })
check('encrypted zip decrypts with correct password', (await decFiles[0].blob.text()) === 'secret payload 123')

// Upgraded PPTX -> PDF & Slides -> Images in-browser rendering + range splitting
const pptxPdf = await OFF.pptxToPdf(pptxFile, { includeNotes: true })
check('pptxToPdf renders valid 3-page PDF in browser', (await PDFDocument.load(await pptxPdf.blob.arrayBuffer())).getPageCount() === 3)
const slideImgs = await OFF.slidesToImages(pptxFile, 'image/png', 1)
check('slidesToImages exports 3 slide images', slideImgs.length === 3 && slideImgs[0].name.endsWith('.png'))
const splitRangeDeck = await OFF.splitPresentation(pptxFile, { mode: 'ranges', ranges: '1-2; 3' })
check('splitPresentation supports custom slide ranges', splitRangeDeck.length === 2 && (await deckOrder(splitRangeDeck[0])).length === 2)

// Upgraded DOCX match counter & multi-rule replace
const matchCount = await OFF.countDocxMatches(docxA, 'Alpha', false)
check('countDocxMatches counts occurrences across DOCX', matchCount >= 2)
const multiRuleDocx = await OFF.replaceInDocx(docxA, '', '', false, [
  { find: 'Alpha Doc', replace: 'Omega Title' },
  { find: 'Second section', replace: 'Final section' },
])
const multiRuleTxt = await (await OFF.wordToText(asFile(multiRuleDocx.blob, 'mr.docx', OFF.DOCX_TYPE))).blob.text()
check('replaceInDocx applies multiple rules in one pass', multiRuleTxt.includes('Omega Title') && multiRuleTxt.includes('Final section'))

// Upgraded Excel preview, multi-CSV merge, and filtered sheet export
const excelPrev = await OFF.previewExcel(xlsxFile)
check('previewExcel inspects all sheets and row counts', excelPrev.length === 2 && excelPrev[0].name === 'People' && excelPrev[0].totalRows === 3)
const multiCsvWb = await OFF.csvToExcel([csvFile, asFile(new Blob(['x,y\n9,8'], { type: 'text/csv' }), 'second.csv', 'text/csv')])
check('csvToExcel merges multiple CSVs into multi-sheet XLSX', (await OFF.sheetNames(asFile(multiCsvWb.blob, 'mc.xlsx', OFF.XLSX_TYPE))).length === 2)
const filteredCsvOut = await OFF.excelToCsv(xlsxFile, { sheets: ['Cities'], delimiter: ';', utf8Bom: true })
const bomBytes = new Uint8Array(await filteredCsvOut[0].blob.arrayBuffer())
check('excelToCsv filters sheets and supports custom delimiter + BOM', filteredCsvOut.length === 1 && bomBytes[0] === 0xef && bomBytes[1] === 0xbb && bomBytes[2] === 0xbf && (await filteredCsvOut[0].blob.text()).includes('City'))

// Upgraded JSON sortKeys, jsonToCsv, CSV multi-step pipeline, and Deep File Metadata + Sanitizer
check('formatJson sortKeys sorts object keys alphabetically', TXT.formatJson('{"z":1,"a":2}', true, 2, { sortKeys: true }) === '{"a":2,"z":1}')
check('jsonToCsv converts JSON array to CSV table', TXT.jsonToCsv('[{"name":"Ada","score":10}]').includes('name,score\nAda,10'))
const multiCsvClean = TXT.csvTools(' Name , Score \n Zoe , 5 \n Zoe , 5 \n Ada , 10 ', 'sort-asc', ',', {
  sortCol: 0,
  trimAll: true,
  dedupeAll: true,
  renameCols: { 0: 'Student' },
})
check('csvTools multi-step pipeline trims, dedupes, sorts, and renames headers', multiCsvClean.startsWith('Student,Score\nAda,10\nZoe,5'))

const deepDocxMeta = await TXT.fileMetadata(docxA)
check('fileMetadata computes SHA-1/256/512 and detects office kind', Boolean(deepDocxMeta.sha1 && deepDocxMeta.sha256 && deepDocxMeta.sha512 && deepDocxMeta.kind === 'office' && deepDocxMeta.canScrub))
const scrubbedDocx = await TXT.scrubFileMetadata(docxA)
check('scrubFileMetadata produces valid sanitized DOCX', scrubbedDocx.blob.size > 0 && scrubbedDocx.name.endsWith('-sanitized.docx'))

// Round 2 upgrades: Word stats, Markdown export, HTML themes, Merge separators, ZIP folders, XML/HTML tools
const stats = OFF.analyzeTextStats('Hello world.\n\nSecond paragraph with five words.')
check('analyzeTextStats counts words, paragraphs, and reading time', stats.words === 7 && stats.paragraphs === 2 && stats.readingTimeMin === 1)
const mdWordTxt = await (await OFF.wordToText(docxA, { markdownFormatting: true, collapseBlankLines: true })).blob.text()
check('wordToText markdownFormatting prefixes headings with #', mdWordTxt.includes('# Alpha Doc'))
const darkWordHtml = await (await OFF.wordToHtml(docxA, { mode: 'dark' })).blob.text()
const cleanWordHtml = await (await OFF.wordToHtml(docxA, { mode: 'clean' })).blob.text()
check('wordToHtml supports dark theme and clean mode', darkWordHtml.includes('#0f172a') && !cleanWordHtml.includes('<style>'))
const mergedHeadingDocx = await OFF.mergeWord([docxA, docxB], { separator: 'filename-heading' })
const mergedHeadingTxt = await (await OFF.wordToText(asFile(mergedHeadingDocx.blob, 'mh.docx', OFF.DOCX_TYPE))).blob.text()
check('mergeWord filename-heading inserts document titles', mergedHeadingTxt.includes('AlphaDoc') && mergedHeadingTxt.includes('BetaDoc'))

const groupedZip = await TXT.createZip([csvFile, asFile(new Blob(['hello']), 'readme.txt', 'text/plain')], { rootFolder: 'backup', groupByType: true })
const groupedEntries = await TXT.listZipEntries(asFile(groupedZip.blob, 'g.zip', 'application/zip'))
check('createZip supports rootFolder and groupByType subfolders', groupedEntries.entries.some((e) => e.name === 'backup/spreadsheets/data.csv') && groupedEntries.entries.some((e) => e.name === 'backup/documents/readme.txt'))

check('jsonToXml supports custom rootTag and itemTag', TXT.jsonToXml('[{"id":1}]', { rootTag: 'catalog', itemTag: 'product' }).includes('<catalog>\n  <product>\n    <id>1</id>'))
check('formatXml supports minify and xmlToJson converts XML to JSON', () => {
  const minXml = TXT.formatXml('<root>\n  <a>1</a>\n</root>', { minify: true })
  const xmlJson = JSON.parse(TXT.xmlToJson('<root><user id="7"><name>Ada</name></user></root>'))
  return minXml === '<root><a>1</a></root>' && xmlJson.root.user['@id'] === '7' && xmlJson.root.user.name === 'Ada'
})

const htmlFile = asFile(new Blob(['<h1>Title</h1><p>Visit <a href="https://example.com">Example</a></p>'], { type: 'text/html' }), 'page.html', 'text/html')
const extractedHtmlTxt = await (await TXT.htmlToText(htmlFile, { preserveLinks: true, preserveHeadings: true })).blob.text()
check('htmlToText preserves headings and inline link URLs', extractedHtmlTxt.includes('# Title') && extractedHtmlTxt.includes('Example (https://example.com)'))

// Word Tools Deep Upgrades: In-Place Visual Editor, Placeholder Auto-Detection, Context Snippets, Keep/Extract Pages, 5-Mode Split, Auto-TOC Merge, Multi-Target Extract
const editableNodes = await OFF.listEditableDocxNodes(docxA)
check('listEditableDocxNodes parses paragraphs and headings from DOCX XML', editableNodes.length === 4 && editableNodes[0].kind === 'heading1' && editableNodes[0].text === 'Alpha Doc')
editableNodes[1].text = 'In-place edited Alpha paragraph!'
const savedVisualDocx = await OFF.saveEditedDocxNodes(docxA, editableNodes)
const savedVisualTxt = await (await OFF.wordToText(asFile(savedVisualDocx.blob, 'sv.docx', OFF.DOCX_TYPE))).blob.text()
check('saveEditedDocxNodes updates DOCX XML in-place preserving document structure', savedVisualTxt.includes('In-place edited Alpha paragraph!') && savedVisualTxt.includes('Section Two'))

const phDocx = await makeDocx('Contract for {{CLIENT_NAME}}', 'Signed on [SIGN_DATE] for project <PROJECT_CODE>.')
const detectedPh = await OFF.detectDocxPlaceholders(phDocx)
check('detectDocxPlaceholders finds {{...}}, [...], and <...> tokens', detectedPh.includes('{{CLIENT_NAME}}') && detectedPh.includes('[SIGN_DATE]') && detectedPh.includes('<PROJECT_CODE>'))

const matchPrev = await OFF.previewDocxMatches(docxA, 'Alpha', { matchCase: false, wholeWord: true })
check('previewDocxMatches returns count and context snippets', matchPrev.count === 2 && matchPrev.snippets.length === 2 && matchPrev.snippets[0].match === 'Alpha')

const extractedKeepDocx = await OFF.removeDocxPages(docxA, [0, 1], 'keep')
const extractedKeepTxt = await (await OFF.wordToText(asFile(extractedKeepDocx.blob, 'ek.docx', OFF.DOCX_TYPE))).blob.text()
check('removeDocxPages keep mode extracts only selected blocks', extractedKeepTxt.includes('Alpha body') && !extractedKeepTxt.includes('Second section body'))

const splitPrev = await OFF.previewSplitWord(docxA, { mode: 'heading-any', nameByHeading: true })
check('previewSplitWord computes smart heading-slugged filenames and word counts', splitPrev.length === 2 && splitPrev[0].fileName.includes('alpha-doc.docx'))
const customSplitOut = await OFF.splitWord(docxA, { mode: 'custom-blocks', customSplitIndices: [2], nameByHeading: true })
check('splitWord custom-blocks splits at exact block index', customSplitOut.length === 2)

const docxSum = await OFF.inspectDocxSummary(docxA)
check('inspectDocxSummary reports wordCount, headings, and pageCount', docxSum.wordCount > 0 && docxSum.headings.includes('Alpha Doc'))
const mergedTocDocx = await OFF.mergeWord([docxA, docxB], { separator: 'page-break', includeToc: true, importStyles: true })
const mergedTocTxt = await (await OFF.wordToText(asFile(mergedTocDocx.blob, 'mtoc.docx', OFF.DOCX_TYPE))).blob.text()
check('mergeWord includeToc generates Table of Contents cover section', mergedTocTxt.includes('Table of Contents') && mergedTocTxt.includes('1. AlphaDoc'))

const headingsAsset = await OFF.extractWordAssets(docxA, { extractTarget: 'headings' })
check('extractWordAssets headings extracts markdown outline', (await headingsAsset[0].blob.text()).includes('# Alpha Doc'))

const tocHtmlOut = await (await OFF.wordToHtml(docxA, { mode: 'styled', includeTocSidebar: true })).blob.text()
check('wordToHtml includeTocSidebar injects clickable Table of Contents nav', tocHtmlOut.includes('class="doc-toc"') && tocHtmlOut.includes('#section-1'))

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
