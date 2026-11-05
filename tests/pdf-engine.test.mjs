// Real-engine tests: bundles src/processing/pdf.ts and exercises it against
// generated sample PDFs. Run: npm test
import { build } from 'esbuild'
import { PDFDocument, StandardFonts, rgb } from 'pdf-lib'
import { writeFileSync, mkdirSync, readFileSync } from 'node:fs'

mkdirSync('tests/.tmp', { recursive: true })
mkdirSync('tests/fixtures', { recursive: true })

// ── Fixtures ─────────────────────────────────────────────────────
const doc = await PDFDocument.create()
const font = await doc.embedFont(StandardFonts.HelveticaBold)
for (let i = 1; i <= 3; i++) {
  const p = doc.addPage([595, 842])
  p.drawText(`DocDoctor sample page ${i}`, { x: 60, y: 700, size: 24, font, color: rgb(0.1, 0.15, 0.3) })
}
writeFileSync('tests/fixtures/sample.pdf', await doc.save())
const doc2 = await PDFDocument.create()
doc2.addPage([595, 842]).drawText('Second document', { x: 60, y: 700, size: 24, font })
writeFileSync('tests/fixtures/sample2.pdf', await doc2.save())

// ── Bundle the real engine ───────────────────────────────────────
await build({ entryPoints: ['src/processing/pdf.ts'], bundle: true, platform: 'node', format: 'esm', outfile: 'tests/.tmp/pdf-engine.mjs', external: ['pdfjs-dist'], logLevel: 'silent' })
const PDF = await import('./.tmp/pdf-engine.mjs')

const file = (p) => new File([readFileSync(p)], p.split('/').pop(), { type: 'application/pdf' })
const a = file('tests/fixtures/sample.pdf')
const b = file('tests/fixtures/sample2.pdf')
const pages = async (out) => (await PDFDocument.load(await out.blob.arrayBuffer())).getPageCount()
let pass = 0, fail = 0
const check = async (name, cond) => { if (await cond) { pass++; console.log('PASS', name) } else { fail++; console.log('FAIL', name) } }

await check('merge 3+1=4 pages', async () => (await pages(await PDF.mergePdfs([a, b]))) === 4)
await check('split range 1-2 -> 2 pages', async () => (await pages((await PDF.splitPdf(a, '1-2'))[0])) === 2)
await check('split groups 1;3 -> 2 files', async () => (await PDF.splitPdf(a, '1; 3')).length === 2)
await check('remove page 2 -> 2 pages', async () => (await pages(await PDF.removePages(a, [1]))) === 2)
await check('extract pages 1,3 -> 2 pages', async () => (await pages(await PDF.extractPages(a, [0, 2]))) === 2)
await check('organize reorder+delete+rotate', async () => {
  const out = await PDF.organizePdf(a, [
    { index: 2, rotation: 0, deleted: false },
    { index: 0, rotation: 90, deleted: false },
    { index: 1, rotation: 0, deleted: true },
  ])
  const d = await PDFDocument.load(await out.blob.arrayBuffer())
  return d.getPageCount() === 2 && d.getPage(1).getRotation().angle === 90
})
await check('rotate all 90', async () => {
  const d = await PDFDocument.load(await (await PDF.rotatePdf(a, 90, 'all')).blob.arrayBuffer())
  return d.getPage(0).getRotation().angle === 90
})
await check('compress produces valid pdf', async () => (await pages(await PDF.compressPdf(a, 'recommended'))) === 3)
await check('page numbers valid', async () => (await pages(await PDF.addPageNumbers(a, 'bottom-center', 1, 'Page {n} of {total}'))) === 3)
await check('watermark valid', async () => (await pages(await PDF.watermarkPdf(a, 'TEST', 0.3, 48))) === 3)
await check('parseRanges', () => PDF.parseRanges('1-2, 3', 5).join(',') === '0,1,2')
console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
