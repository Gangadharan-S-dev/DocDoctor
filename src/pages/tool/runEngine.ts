import type { Tool } from '../../data/tools'
import type { OutputFile } from '../../processing/download'
import type { ImgFormat } from '../../processing/image'
import type { PageOp } from '../../processing/pdf'

export interface RunSettings {
  quality: number
  format: 'keep' | ImgFormat
  width: number
  height: number
  crop: { x: number; y: number; w: number; h: number }
  angle: number
  flipH: boolean
  flipV: boolean
  wmText: string
  wmOpacity: number
  wmFontSize: number
  pageSize: 'fit' | 'a4'
  ranges: string
  level: 'less' | 'recommended' | 'extreme'
  pos: 'bottom-center' | 'bottom-right' | 'bottom-left'
  scale: number
  slideSel: string[]
  slideOrder: string[]
  sheetSel: string[]
  splitMode: 'heading' | 'paragraphs'
  txtTo: 'txt' | 'html' | 'md'
  jsonMinify: boolean
  csvAction: 'dedupe' | 'trim'
  editText: string
  pdfText: string
  pdfPage: number
  pdfX: number
  pdfY: number
  pdfSize: number
  pdfColor: string
  sigData: string | null
  signPos: 'bottom-right' | 'bottom-left' | 'center' | 'custom'
  pwd: string
  pwd2: string
  blockSel: number[]
  gridValue: number[] | PageOp[]
  ocrLang: string
  ocrFormat: 'txt' | 'pdf' | 'docx' | 'both'
}

export interface RunContext {
  tool: Tool
  files: File[]
  settings: RunSettings
  signal: AbortSignal
  onProgress: (done: number, total: number) => void
}

const IMAGE_IDS = new Set(['compress-image', 'resize-image', 'crop-image', 'jpg-to-png', 'png-to-jpg', 'webp-converter', 'jpg-to-webp', 'png-to-webp', 'rotate-image', 'flip-image', 'image-watermark', 'image-to-pdf', 'ico-converter', 'image-ocr'])
const PDF_IDS = new Set(['merge-pdf', 'split-pdf', 'remove-pdf-pages', 'extract-pdf-pages', 'organize-pdf', 'rotate-pdf', 'compress-pdf', 'pdf-page-numbers', 'pdf-watermark', 'pdf-to-jpg', 'pdf-to-image', 'pdf-to-png', 'ocr-pdf', 'compare-pdf'])
const OFFICE_IDS = new Set(['word-to-txt', 'extract-word-text', 'word-to-html', 'compress-docx', 'merge-word', 'split-word', 'edit-word', 'compress-powerpoint', 'merge-presentations', 'split-presentations', 'remove-slides', 'extract-slides', 'reorder-slides', 'xls-to-xlsx', 'csv-to-excel', 'excel-to-csv', 'merge-excel', 'split-worksheets', 'remove-worksheets', 'compress-excel', 'excel-to-html', 'xlsx-to-pdf', 'excel-to-pdf', 'remove-word-pages', 'docx-page-remover'])
const TEXT_IDS = new Set(['zip-files', 'extract-zip', 'html-to-txt', 'txt-converter', 'markdown-converter', 'json-formatter', 'json-to-xml', 'xml-formatter', 'csv-tools'])
const ADVANCED_IDS = new Set(['edit-pdf', 'sign-pdf', 'repair-pdf', 'pdf-to-word', 'pdf-to-docx', 'pdf-to-excel', 'pdf-to-powerpoint', 'pdf-to-pptx', 'word-to-pdf', 'docx-to-pdf', 'epub-to-pdf'])
const CRYPTO_IDS = new Set(['protect-pdf', 'unlock-pdf'])
const OCR_IDS = new Set(['ocr-pdf', 'image-ocr'])

/**
 * Run one tool. Only the engine module the tool actually needs is imported,
 * so a JPG conversion no longer downloads the PDF/Office/crypto engines.
 */
export async function runTool({ tool, files: fs, settings: s, signal, onProgress }: RunContext): Promise<OutputFile[]> {
  const id = tool.id
  const f0 = fs[0]
  const proc = { signal, onProgress }
  const aborted = () => { if (signal.aborted) throw new DOMException('Processing cancelled.', 'AbortError') }

  // Sequential batch helper: reports progress and honors cancellation between files.
  const batch = async <T,>(items: T[], fn: (item: T) => Promise<OutputFile>): Promise<OutputFile[]> => {
    const out: OutputFile[] = []
    for (let i = 0; i < items.length; i++) {
      aborted()
      out.push(await fn(items[i]))
      onProgress(i + 1, items.length)
    }
    return out
  }

  if (OCR_IDS.has(id)) {
    const OCR = await import('../../processing/ocr')
    const ocrOpts = { ...proc, lang: s.ocrLang, format: s.ocrFormat }
    return id === 'ocr-pdf' ? OCR.ocrPdf(f0, ocrOpts) : OCR.ocrImage(f0, ocrOpts)
  }
  if (IMAGE_IDS.has(id)) {
    const IMG = await import('../../processing/image')
    switch (id) {
      case 'compress-image': {
        const { compressImageSmart } = await import('../../processing/imageWorkerClient')
        return batch(fs, (f) => compressImageSmart(f, { quality: s.quality / 100, format: s.format }))
      }
      case 'resize-image': return batch(fs, (f) => IMG.resizeImage(f, s.width, s.height, s.format))
      case 'crop-image': return [await IMG.cropImage(f0, s.crop.x, s.crop.y, s.crop.w, s.crop.h)]
      case 'jpg-to-png': case 'png-to-jpg': case 'jpg-to-webp': case 'png-to-webp': {
        const t: ImgFormat = id.endsWith('png') ? 'image/png' : id.endsWith('webp') ? 'image/webp' : 'image/jpeg'
        return batch(fs, (f) => IMG.convertImage(f, t))
      }
      case 'webp-converter': return batch(fs, (f) => IMG.convertImage(f, s.format === 'keep' ? 'image/webp' : s.format))
      case 'rotate-image': return batch(fs, (f) => IMG.rotateImage(f, s.angle))
      case 'flip-image': return batch(fs, (f) => IMG.flipImage(f, s.flipH, s.flipV))
      case 'image-watermark': return batch(fs, (f) => IMG.watermarkImage(f, { text: s.wmText || 'DocDoctor', opacity: s.wmOpacity, fontSize: s.wmFontSize, position: 'bottom-right' }))
      case 'image-to-pdf': return [await IMG.imagesToPdf(fs, s.pageSize)]
      case 'ico-converter': return [await IMG.imageToIco(f0, [16, 24, 32, 48, 64])]
    }
  }
  if (PDF_IDS.has(id)) {
    const PDF = await import('../../processing/pdf')
    switch (id) {
      case 'merge-pdf': return [await PDF.mergePdfs(fs)]
      case 'split-pdf': return PDF.splitPdf(f0, s.ranges)
      case 'remove-pdf-pages': return [await PDF.removePages(f0, s.gridValue as number[])]
      case 'extract-pdf-pages': return [await PDF.extractPages(f0, s.gridValue as number[])]
      case 'organize-pdf': return [await PDF.organizePdf(f0, s.gridValue as PageOp[])]
      case 'rotate-pdf': return [await PDF.rotatePdf(f0, s.angle, 'all')]
      case 'compress-pdf': return [await PDF.compressPdf(f0, s.level, proc)]
      case 'pdf-page-numbers': return [await PDF.addPageNumbers(f0, s.pos, 1, 'Page {n} of {total}')]
      case 'pdf-watermark': return [await PDF.watermarkPdf(f0, s.wmText || 'DocDoctor', s.wmOpacity, 48)]
      case 'pdf-to-jpg': case 'pdf-to-image': return PDF.pdfToImages(f0, 'image/jpeg', s.scale, proc)
      case 'pdf-to-png': return PDF.pdfToImages(f0, 'image/png', s.scale, proc)
      case 'compare-pdf': return PDF.comparePdfs(fs, proc)
    }
  }
  if (OFFICE_IDS.has(id)) {
    const OFF = await import('../../processing/office')
    switch (id) {
      case 'word-to-txt': case 'extract-word-text': return [await OFF.wordToText(f0)]
      case 'word-to-html': return [await OFF.wordToHtml(f0)]
      case 'compress-docx': return [await OFF.recompressPackage(f0, `${f0.name.replace(/\.docx$/i, '')}-compressed.docx`, OFF.DOCX_TYPE)]
      case 'merge-word': return [await OFF.mergeWord(fs)]
      case 'split-word': return OFF.splitWord(f0, s.splitMode)
      case 'edit-word': return [await OFF.textToDocx(s.editText, `${f0.name.replace(/\.docx$/i, '')}-edited.docx`)]
      case 'compress-powerpoint': return [await OFF.recompressPackage(f0, `${f0.name.replace(/\.pptx$/i, '')}-compressed.pptx`, OFF.PPTX_TYPE)]
      case 'merge-presentations': return [await OFF.mergePresentations(fs)]
      case 'split-presentations': return OFF.splitPresentation(f0)
      case 'remove-slides': return [await OFF.removeSlides(f0, s.slideSel)]
      case 'extract-slides': return [await OFF.extractSlides(f0, s.slideSel)]
      case 'reorder-slides': return [await OFF.reorderSlides(f0, s.slideOrder)]
      case 'xls-to-xlsx': return [await OFF.xlsToXlsx(f0)]
      case 'csv-to-excel': return [await OFF.csvToExcel(f0)]
      case 'excel-to-csv': return OFF.excelToCsv(f0)
      case 'merge-excel': return [await OFF.mergeExcel(fs)]
      case 'split-worksheets': return OFF.splitWorksheets(f0)
      case 'remove-worksheets': return [await OFF.removeWorksheets(f0, s.sheetSel)]
      case 'compress-excel': return [await OFF.recompressPackage(f0, `${f0.name.replace(/\.xlsx$/i, '')}-compressed.xlsx`, OFF.XLSX_TYPE)]
      case 'excel-to-html': return [await OFF.excelToHtml(f0)]
      case 'xlsx-to-pdf': case 'excel-to-pdf': return [await OFF.excelToPdf(f0)]
      case 'remove-word-pages': case 'docx-page-remover': return [await OFF.removeDocxPages(f0, s.blockSel)]
    }
  }
  if (TEXT_IDS.has(id)) {
    const TXT = await import('../../processing/text')
    switch (id) {
      case 'zip-files': return [await TXT.createZip(fs)]
      case 'extract-zip': return TXT.extractZip(f0)
      case 'html-to-txt': return [await TXT.htmlToText(f0)]
      case 'txt-converter': case 'markdown-converter': return [await TXT.convertText(f0, s.txtTo)]
      case 'json-formatter': return [{ name: f0.name, blob: new Blob([TXT.formatJson(await f0.text(), s.jsonMinify)], { type: 'application/json' }) }]
      case 'json-to-xml': return [{ name: `${f0.name.replace(/\.json$/i, '')}.xml`, blob: new Blob([TXT.jsonToXml(await f0.text())], { type: 'application/xml' }) }]
      case 'xml-formatter': return [{ name: f0.name, blob: new Blob([TXT.formatXml(await f0.text())], { type: 'application/xml' }) }]
      case 'csv-tools': return [{ name: f0.name, blob: new Blob([TXT.csvTools(await f0.text(), s.csvAction, ',')], { type: 'text/csv' }) }]
    }
  }
  if (ADVANCED_IDS.has(id)) {
    const ADV = await import('../../processing/advanced')
    switch (id) {
      case 'edit-pdf': return [await ADV.editPdfAddText(f0, s.pdfText, s.pdfPage, s.pdfX, s.pdfY, s.pdfSize, s.pdfColor)]
      case 'sign-pdf': {
        if (!s.sigData) throw new Error('Draw your signature first.')
        const sigBytes = new Uint8Array(await (await fetch(s.sigData)).arrayBuffer())
        const pos = s.signPos === 'custom' ? { xPct: s.pdfX, yPct: s.pdfY } : s.signPos
        return [await ADV.signPdf(f0, sigBytes, s.pdfPage, pos)]
      }
      case 'repair-pdf': return [await ADV.repairPdf(f0)]
      case 'pdf-to-word': case 'pdf-to-docx': return [await ADV.pdfToDocx(f0)]
      case 'pdf-to-excel': return [await ADV.pdfToExcel(f0)]
      case 'pdf-to-powerpoint': case 'pdf-to-pptx': return [await ADV.pdfToPowerpoint(f0, s.scale)]
      case 'word-to-pdf': case 'docx-to-pdf': return [await ADV.docxToPdf(f0)]
      case 'epub-to-pdf': return [await ADV.epubToPdf(f0)]
    }
  }
  if (CRYPTO_IDS.has(id)) {
    const CRY = await import('../../processing/crypto')
    if (id === 'protect-pdf') {
      if (s.pwd !== s.pwd2) throw new Error('Passwords do not match.')
      return [await CRY.protectPdf(f0, s.pwd)]
    }
    return [await CRY.unlockPdf(f0, s.pwd)]
  }
  throw new Error('This engine is not available yet.')
}
