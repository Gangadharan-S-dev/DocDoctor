// One explicit observed-output pass against the running service (port 8081).
import { mkdirSync, writeFileSync } from 'node:fs'
import { PDFDocument } from 'pdf-lib'
import JSZip from 'jszip'

const BASE = 'http://127.0.0.1:8081'
mkdirSync('tests/.tmp/observed', { recursive: true })
const named = (blob, name, type) => new File([blob], name, { type })
const post = async (ep, file, extra = {}) => {
  const form = new FormData()
  form.append('file', file)
  for (const [k, v] of Object.entries(extra)) form.append(k, v)
  return fetch(`${BASE}/api/convert/${ep}`, { method: 'POST', body: form })
}
const magic = (buf) => new TextDecoder('latin1').decode(buf.slice(0, 4))

const { Document, Packer, Paragraph } = await import('docx')
const docx = new Document({ sections: [{ children: [new Paragraph('Observed DOCX conversion')] }] })
const r1 = await post('docx-to-pdf', named(await Packer.toBlob(docx), 'observed.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'))
const b1 = new Uint8Array(await r1.arrayBuffer())
writeFileSync('tests/.tmp/observed/observed-docx.pdf', b1)
console.log(`docx->pdf: HTTP ${r1.status}, ${b1.length} bytes, magic=${magic(b1)}, pages=${(await PDFDocument.load(b1)).getPageCount()}`)

const XLSX = await import('xlsx')
const wb = XLSX.utils.book_new()
XLSX.utils.book_append_sheet(wb, XLSX.utils.aoa_to_sheet([['Item', 'Qty'], ['Pens', 12]]), 'Stock')
const r2 = await post('xlsx-to-pdf', named(new Blob([XLSX.write(wb, { bookType: 'xlsx', type: 'array' })]), 'observed.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'))
const b2 = new Uint8Array(await r2.arrayBuffer())
writeFileSync('tests/.tmp/observed/observed-xlsx.pdf', b2)
console.log(`xlsx->pdf: HTTP ${r2.status}, ${b2.length} bytes, magic=${magic(b2)}, pages=${(await PDFDocument.load(b2)).getPageCount()}`)

const PptxGenJS = (await import('pptxgenjs')).default
const deck = new PptxGenJS()
deck.addSlide().addText('Observed Slide One', { x: 1, y: 1, fontSize: 24 })
deck.addSlide().addText('Observed Slide Two', { x: 1, y: 1, fontSize: 24 })
const pptxFile = named(await deck.write({ outputType: 'blob' }), 'observed.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation')
const r3 = await post('pptx-to-pdf', pptxFile)
const b3 = new Uint8Array(await r3.arrayBuffer())
writeFileSync('tests/.tmp/observed/observed-pptx.pdf', b3)
console.log(`pptx->pdf: HTTP ${r3.status}, ${b3.length} bytes, magic=${magic(b3)}, pages=${(await PDFDocument.load(b3)).getPageCount()}`)

const r4 = await post('slides-to-images', pptxFile, { format: 'jpg' })
const b4 = new Uint8Array(await r4.arrayBuffer())
writeFileSync('tests/.tmp/observed/observed-slides.zip', b4)
const zip = await JSZip.loadAsync(b4)
const names = Object.keys(zip.files)
const first = await zip.file(names[0]).async('uint8array')
console.log(`slides->images: HTTP ${r4.status}, ${b4.length} bytes, entries=[${names.join(', ')}], first image magic=${first[0].toString(16)}/${first[1].toString(16)} (FF/D8 = JPEG)`)
