import type { Tool } from '../../data/tools'
import type { OutputFile } from '../../processing/download'
import type { ImgFormat, PerspectiveQuad, ScanEnhanceMode } from '../../processing/image'
import type { PageNumberPosition, PageOp, PdfWatermarkPosition } from '../../processing/pdf'
import type { PdfAnnotation, PdfEditAnnotationMode, SignPlacement } from '../../processing/advanced'
import type { CsvAction } from '../../processing/text'
import type { DocxReplaceRule } from '../../processing/office'

export interface RunSettings {
  quality: number
  format: 'keep' | ImgFormat
  width: number
  height: number
  crop: { x: number; y: number; w: number; h: number }
  cropCornerRadius?: number
  angle: number
  flipH: boolean
  flipV: boolean
  wmText: string
  wmOpacity: number
  wmFontSize: number
  wmPos?: 'bottom-right' | 'center' | 'tile' | 'top-left' | 'bottom-left'
  wmLogoUrl?: string | null
  pageSize: 'fit' | 'a4' | 'letter'
  ranges: string
  splitPdfMode?: 'ranges' | 'every-n' | 'all-individual'
  splitEveryN?: number
  mergeFileRanges?: Record<number, string>
  mergeAddBookmarks?: boolean
  rotateFilter?: 'all' | 'odd' | 'even' | 'landscape' | 'portrait' | 'custom'
  rotateCustomRanges?: string
  level: 'less' | 'recommended' | 'extreme'
  pos: PageNumberPosition
  scale: number
  slideSel: string[]
  slideOrder: string[]
  sheetSel: string[]
  splitMode: 'heading' | 'paragraphs'
  splitPptxMode?: 'all' | 'ranges' | 'every-n'
  splitPptxRanges?: string
  splitPptxEveryN?: number
  pptxIncludeNotes?: boolean
  slidesImgFormat?: 'jpg' | 'png'
  csvMergeSingleWorkbook?: boolean
  excelCsvDelim?: string
  excelCsvBom?: boolean
  txtTo: 'txt' | 'html' | 'md'
  jsonMinify: boolean
  jsonSortKeys?: boolean
  jsonFilterKey?: string
  jsonExportCsv?: boolean
  csvAction: CsvAction
  csvOutDelim?: string
  csvSortCol?: number
  csvFilterQuery?: string
  csvFindText?: string
  csvReplaceText?: string
  csvKeepCols?: number[]
  csvTrimAll?: boolean
  csvDedupeAll?: boolean
  csvRenameCols?: Record<number, string>
  editText: string
  wordEditMode?: 'editor' | 'replace'
  wordFind?: string
  wordReplace?: string
  wordMatchCase?: boolean
  wordReplaceRules?: DocxReplaceRule[]
  pdfText: string
  pdfPage: number
  pdfX: number
  pdfY: number
  pdfSize: number
  pdfColor: string
  pdfEditMode?: PdfEditAnnotationMode
  pdfFont?: 'Helvetica' | 'TimesRoman' | 'Courier'
  pdfRedactW?: number
  pdfRedactH?: number
  pdfAnnotations?: PdfAnnotation[]
  pdfDestructiveRedact?: boolean
  pdfToImgRange?: string
  pdfToImgGrayscale?: boolean
  pdfToImgStitch?: boolean
  pdfExcelMergeSheets?: boolean
  docPageSize?: 'a4' | 'letter'
  docOrientation?: 'portrait' | 'landscape'
  docFontFamily?: 'Helvetica' | 'TimesRoman' | 'Courier'
  docFontSize?: number
  docMargin?: 'compact' | 'standard' | 'wide'
  docIncludePageNumbers?: boolean
  wordHtmlMode?: 'styled' | 'clean' | 'dark'
  wordTxtMarkdown?: boolean
  wordTxtCollapseBlank?: boolean
  mergeWordSeparator?: 'page-break' | 'continuous' | 'filename-heading'
  imgPdfLayout?: '1-up' | '2-up' | '4-up'
  imgPdfBgColor?: string
  imgPdfCaptions?: boolean
  icoFitMode?: 'pad' | 'cover' | 'stretch'
  icoExportWebKit?: boolean
  zipRootFolder?: string
  zipGroupByType?: boolean
  xmlRootTag?: string
  xmlItemTag?: string
  xmlMinify?: boolean
  xmlExportJson?: boolean
  htmlPreserveLinks?: boolean
  htmlPreserveHeadings?: boolean
  txtStyledHtml?: boolean
  sigData: string | null
  signPos: 'bottom-right' | 'bottom-left' | 'center' | 'custom'
  sigWidth?: number
  signAllPages?: boolean
  signDateStamp?: string
  signPlacements?: SignPlacement[]
  pptxMode?: 'image' | 'editable'
  pwd: string
  pwd2: string
  ownerPwd?: string
  pdfAllowPrinting?: boolean
  pdfAllowCopying?: boolean
  pdfAllowModifying?: boolean
  pdfAllowAnnotating?: boolean
  zipLevel?: number
  zipPassword?: string
  zipArchiveName?: string
  zipFilterNames?: string[]
  blockSel: number[]
  gridValue: number[] | PageOp[]
  ocrLang: string
  ocrFormat: 'txt' | 'pdf' | 'docx' | 'both'
  excelOrientation?: 'landscape' | 'portrait'
  excelGridlines?: boolean
  officeMediaQuality?: number
  officeMediaMaxEdge?: number
  pdfNumFormat?: string
  pdfNumStart?: number
  pdfNumSize?: number
  pdfNumColor?: string
  pdfNumSkipCover?: boolean
  pdfNumFont?: 'Helvetica' | 'TimesRoman' | 'Courier'
  pdfNumStyle?: 'arabic' | 'roman-lower' | 'roman-upper'
  pdfNumRange?: string
  pdfNumMargin?: number
  pdfWmAngle?: number
  pdfWmColor?: string
  pdfWmSize?: number
  pdfWmPos?: PdfWatermarkPosition
  pdfWmLogoUrl?: string | null
  pdfWmLogoScale?: number
  comparePixelDiff?: boolean
  icoSizes?: number[]
  jsonIndent?: number | 'tab'
  csvDelim?: string
  maxEdge?: number
  targetSizeKB?: number
  resizeMode?: 'stretch' | 'contain' | 'cover'
  smoothing?: 'high' | 'pixelated'
  cropCircular?: boolean
  cropMode?: 'rect' | 'perspective'
  perspectiveQuad?: PerspectiveQuad
  perspectiveAspect?: number | null
  cropScanEnhance?: ScanEnhanceMode
  imgBgColor?: string
  rotBgColor?: string
  wmColor?: string
  wmAngle?: number
  wmLogoScale?: number
  imgPdfMargin?: 'none' | 'compact' | 'standard'
  imgPdfOrientation?: 'auto' | 'portrait' | 'landscape'
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
const OFFICE_IDS = new Set(['word-to-txt', 'extract-word-text', 'word-to-html', 'compress-docx', 'merge-word', 'split-word', 'edit-word', 'compress-powerpoint', 'merge-presentations', 'split-presentations', 'remove-slides', 'extract-slides', 'reorder-slides', 'pptx-to-pdf', 'slides-to-images', 'xls-to-xlsx', 'csv-to-excel', 'excel-to-csv', 'merge-excel', 'split-worksheets', 'remove-worksheets', 'compress-excel', 'excel-to-html', 'xlsx-to-pdf', 'excel-to-pdf', 'remove-word-pages', 'docx-page-remover'])
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
  const batch = async <T,>(items: T[], fn: (item: T, index: number) => Promise<OutputFile>): Promise<OutputFile[]> => {
    const out: OutputFile[] = []
    for (let i = 0; i < items.length; i++) {
      aborted()
      out.push(await fn(items[i], i))
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
        return batch(fs, (f) => compressImageSmart(f, {
          quality: s.quality / 100,
          format: s.format,
          maxEdge: s.maxEdge,
          targetSizeKB: s.targetSizeKB,
        }))
      }
      case 'resize-image': return batch(fs, (f) => IMG.resizeImage(f, s.width, s.height, s.format, {
        mode: s.resizeMode,
        smoothing: s.smoothing,
        bgColor: s.imgBgColor,
      }))
      case 'crop-image': return batch(fs, (f) => IMG.cropImage(f, s.crop.x, s.crop.y, s.crop.w, s.crop.h, {
        circular: s.cropCircular,
        cornerRadius: s.cropCornerRadius,
        cropMode: s.cropMode,
        perspectiveQuad: s.perspectiveQuad,
        perspectiveAspect: s.perspectiveAspect,
        scanEnhance: s.cropScanEnhance,
      }))
      case 'jpg-to-png': case 'png-to-jpg': case 'jpg-to-webp': case 'png-to-webp': {
        const t: ImgFormat = id.endsWith('png') ? 'image/png' : id.endsWith('webp') ? 'image/webp' : 'image/jpeg'
        return batch(fs, (f) => IMG.convertImage(f, t, s.quality / 100, { bgColor: s.imgBgColor }))
      }
      case 'webp-converter': return batch(fs, (f) => IMG.convertImage(f, s.format === 'keep' ? 'image/webp' : s.format, s.quality / 100, { bgColor: s.imgBgColor }))
      case 'rotate-image': return batch(fs, (f) => IMG.rotateImage(f, s.angle, { bgColor: s.rotBgColor }))
      case 'flip-image': return batch(fs, (f) => IMG.flipImage(f, s.flipH, s.flipV))
      case 'image-watermark': return batch(fs, (f) => IMG.watermarkImage(f, {
        text: s.wmText || 'DocDoctor',
        opacity: s.wmOpacity,
        fontSize: s.wmFontSize,
        position: s.wmPos || 'bottom-right',
        logoUrl: s.wmLogoUrl,
        colorHex: s.wmColor,
        angle: s.wmAngle,
        logoScale: s.wmLogoScale,
      }))
      case 'image-to-pdf': return [await IMG.imagesToPdf(fs, s.pageSize, {
        pageSize: s.pageSize,
        margin: s.imgPdfMargin,
        orientation: s.imgPdfOrientation,
        layout: s.imgPdfLayout,
        bgColor: s.imgPdfBgColor,
        addCaptions: s.imgPdfCaptions,
      })]
      case 'ico-converter': return batch(fs, (f) => IMG.imageToIco(f, s.icoSizes?.length ? s.icoSizes : [16, 24, 32, 48, 64], {
        fitMode: s.icoFitMode,
        exportWebKit: s.icoExportWebKit,
      }))
    }
  }
  if (PDF_IDS.has(id)) {
    const PDF = await import('../../processing/pdf')
    switch (id) {
      case 'merge-pdf': return [await PDF.mergePdfs(fs, {
        fileRanges: s.mergeFileRanges,
        addBookmarks: s.mergeAddBookmarks,
      })]
      case 'split-pdf': return PDF.splitPdf(f0, s.ranges, {
        mode: s.splitPdfMode,
        everyN: s.splitEveryN,
      })
      case 'remove-pdf-pages': return [await PDF.removePages(f0, s.gridValue as number[])]
      case 'extract-pdf-pages': return [await PDF.extractPages(f0, s.gridValue as number[])]
      case 'organize-pdf': return [await PDF.organizePdf(f0, s.gridValue as PageOp[])]
      case 'rotate-pdf': return batch(fs, (f) => PDF.rotatePdf(f, s.angle, 'all', {
        filter: s.rotateFilter,
        customRanges: s.rotateCustomRanges,
      }))
      case 'compress-pdf': return [await PDF.compressPdf(f0, s.level, proc)]
      case 'pdf-page-numbers': return batch(fs, (f) => PDF.addPageNumbers(
        f,
        s.pos,
        s.pdfNumStart ?? 1,
        s.pdfNumFormat ?? 'Page {n} of {total}',
        {
          fontSize: s.pdfNumSize,
          colorHex: s.pdfNumColor,
          skipCover: s.pdfNumSkipCover,
          fontFamily: s.pdfNumFont,
          numStyle: s.pdfNumStyle,
          pageRange: s.pdfNumRange,
          marginPt: s.pdfNumMargin,
        }
      ))
      case 'pdf-watermark': {
        let imageBytes: Uint8Array | undefined
        let imageMime: 'image/png' | 'image/jpeg' | undefined
        if (s.pdfWmLogoUrl) {
          imageBytes = new Uint8Array(await (await fetch(s.pdfWmLogoUrl)).arrayBuffer())
          imageMime = s.pdfWmLogoUrl.startsWith('data:image/png') ? 'image/png' : 'image/jpeg'
        }
        return batch(fs, (f) => PDF.watermarkPdf(
          f,
          s.wmText || 'DocDoctor',
          s.wmOpacity,
          s.pdfWmSize ?? 48,
          {
            angle: s.pdfWmAngle,
            colorHex: s.pdfWmColor,
            position: s.pdfWmPos,
            imageBytes,
            imageMime,
            imageScale: s.pdfWmLogoScale,
          }
        ))
      }
      case 'pdf-to-jpg': case 'pdf-to-image': return PDF.pdfToImages(f0, 'image/jpeg', s.scale, {
        ...proc,
        pageRange: s.pdfToImgRange,
        grayscale: s.pdfToImgGrayscale,
        stitchVertical: s.pdfToImgStitch,
      })
      case 'pdf-to-png': return PDF.pdfToImages(f0, 'image/png', s.scale, {
        ...proc,
        pageRange: s.pdfToImgRange,
        grayscale: s.pdfToImgGrayscale,
        stitchVertical: s.pdfToImgStitch,
      })
      case 'compare-pdf': return PDF.comparePdfs(fs, { ...proc, highlightPixelDiff: s.comparePixelDiff })
    }
  }
  if (OFFICE_IDS.has(id)) {
    const OFF = await import('../../processing/office')
    const mediaOpts = {
      quality: s.officeMediaQuality ? s.officeMediaQuality / 100 : undefined,
      maxEdge: s.officeMediaMaxEdge,
    }
    switch (id) {
      case 'word-to-txt': case 'extract-word-text': return batch(fs, (f) => OFF.wordToText(f, {
        markdownFormatting: s.wordTxtMarkdown,
        collapseBlankLines: s.wordTxtCollapseBlank,
      }))
      case 'word-to-html': return batch(fs, (f) => OFF.wordToHtml(f, { mode: s.wordHtmlMode }))
      case 'compress-docx': return batch(fs, (f) => OFF.recompressPackage(f, `${f.name.replace(/\.docx$/i, '')}-compressed.docx`, OFF.DOCX_TYPE, mediaOpts))
      case 'merge-word': return [await OFF.mergeWord(fs, { separator: s.mergeWordSeparator })]
      case 'split-word': return OFF.splitWord(f0, s.splitMode)
      case 'edit-word': {
        if (s.wordEditMode === 'replace') {
          return [await OFF.replaceInDocx(f0, s.wordFind ?? '', s.wordReplace ?? '', s.wordMatchCase, s.wordReplaceRules)]
        }
        return [await OFF.textToDocx(s.editText, `${f0.name.replace(/\.docx$/i, '')}-edited.docx`)]
      }
      case 'compress-powerpoint': return batch(fs, (f) => OFF.recompressPackage(f, `${f.name.replace(/\.pptx$/i, '')}-compressed.pptx`, OFF.PPTX_TYPE, mediaOpts))
      case 'merge-presentations': return [await OFF.mergePresentations(fs)]
      case 'split-presentations': return OFF.splitPresentation(f0, {
        mode: s.splitPptxMode,
        ranges: s.splitPptxRanges,
        everyN: s.splitPptxEveryN,
      })
      case 'remove-slides': return [await OFF.removeSlides(f0, s.slideSel)]
      case 'extract-slides': return [await OFF.extractSlides(f0, s.slideSel)]
      case 'reorder-slides': return [await OFF.reorderSlides(f0, s.slideOrder)]
      case 'pptx-to-pdf': return [await OFF.pptxToPdf(f0, { includeNotes: s.pptxIncludeNotes })]
      case 'slides-to-images': return OFF.slidesToImages(f0, s.slidesImgFormat === 'png' ? 'image/png' : 'image/jpeg', s.scale || 1)
      case 'xls-to-xlsx': return batch(fs, (f) => OFF.xlsToXlsx(f))
      case 'csv-to-excel': {
        if (fs.length > 1 && s.csvMergeSingleWorkbook !== false) {
          return [await OFF.csvToExcel(fs)]
        }
        return batch(fs, (f) => OFF.csvToExcel(f))
      }
      case 'excel-to-csv': return OFF.excelToCsv(f0, {
        sheets: s.sheetSel?.length ? s.sheetSel : undefined,
        delimiter: s.excelCsvDelim || ',',
        utf8Bom: s.excelCsvBom,
      })
      case 'merge-excel': return [await OFF.mergeExcel(fs)]
      case 'split-worksheets': return OFF.splitWorksheets(f0)
      case 'remove-worksheets': return [await OFF.removeWorksheets(f0, s.sheetSel)]
      case 'compress-excel': return batch(fs, (f) => OFF.recompressPackage(f, `${f.name.replace(/\.xlsx$/i, '')}-compressed.xlsx`, OFF.XLSX_TYPE, mediaOpts))
      case 'excel-to-html': return batch(fs, (f) => OFF.excelToHtml(f, { sheets: s.sheetSel?.length ? s.sheetSel : undefined }))
      case 'xlsx-to-pdf': case 'excel-to-pdf': return [await OFF.excelToPdf(f0, {
        orientation: s.excelOrientation,
        showGridlines: s.excelGridlines,
        sheets: s.sheetSel?.length ? s.sheetSel : undefined,
      })]
      case 'remove-word-pages': case 'docx-page-remover': return [await OFF.removeDocxPages(f0, s.blockSel)]
    }
  }
  if (TEXT_IDS.has(id)) {
    const TXT = await import('../../processing/text')
    switch (id) {
      case 'zip-files': return [await TXT.createZip(fs, {
        level: s.zipLevel,
        password: s.zipPassword,
        archiveName: s.zipArchiveName,
        rootFolder: s.zipRootFolder,
        groupByType: s.zipGroupByType,
      })]
      case 'extract-zip': return TXT.extractZip(f0, {
        password: s.zipPassword,
        filterNames: s.zipFilterNames,
      })
      case 'html-to-txt': return batch(fs, (f, idx) => TXT.htmlToText(f, {
        preserveLinks: s.htmlPreserveLinks,
        preserveHeadings: s.htmlPreserveHeadings,
        editedText: idx === 0 && s.editText?.trim() ? s.editText : undefined,
      }))
      case 'txt-converter': case 'markdown-converter': return batch(fs, (f, idx) => TXT.convertText(f, s.txtTo, {
        styledHtml: s.txtStyledHtml,
        editedText: idx === 0 && s.editText?.trim() ? s.editText : undefined,
      }))
      case 'json-formatter': {
        const rawText = s.editText?.trim() ? s.editText : await f0.text()
        if (s.jsonExportCsv) {
          return [{ name: `${f0.name.replace(/\.json$/i, '')}.csv`, blob: new Blob([TXT.jsonToCsv(rawText)], { type: 'text/csv' }) }]
        }
        return [{
          name: f0.name,
          blob: new Blob([TXT.formatJson(rawText, s.jsonMinify, s.jsonIndent ?? 2, {
            sortKeys: s.jsonSortKeys,
            filterKeyQuery: s.jsonFilterKey,
          })], { type: 'application/json' }),
        }]
      }
      case 'json-to-xml': {
        const rawText = s.editText?.trim() ? s.editText : await f0.text()
        return [{
          name: `${f0.name.replace(/\.json$/i, '')}.xml`,
          blob: new Blob([TXT.jsonToXml(rawText, { rootTag: s.xmlRootTag, itemTag: s.xmlItemTag })], { type: 'application/xml' }),
        }]
      }
      case 'xml-formatter': {
        const rawText = s.editText?.trim() ? s.editText : await f0.text()
        if (s.xmlExportJson) {
          return [{ name: `${f0.name.replace(/\.xml$/i, '')}.json`, blob: new Blob([TXT.xmlToJson(rawText, s.jsonIndent ?? 2)], { type: 'application/json' }) }]
        }
        return [{
          name: f0.name,
          blob: new Blob([TXT.formatXml(rawText, { minify: s.xmlMinify, indent: s.jsonIndent ?? 2 })], { type: 'application/xml' }),
        }]
      }
      case 'csv-tools': return [{ name: f0.name, blob: new Blob([TXT.csvTools(await f0.text(), s.csvAction, s.csvDelim || ',', {
        outDelimiter: s.csvOutDelim || s.csvDelim || ',',
        sortCol: s.csvSortCol,
        filterQuery: s.csvFilterQuery,
        findText: s.csvFindText,
        replaceText: s.csvReplaceText,
        keepCols: s.csvKeepCols,
        trimAll: s.csvTrimAll,
        dedupeAll: s.csvDedupeAll,
        renameCols: s.csvRenameCols,
      })], { type: 'text/csv' }) }]
    }
  }
  if (ADVANCED_IDS.has(id)) {
    const ADV = await import('../../processing/advanced')
    const docLayout = {
      pageSize: s.docPageSize,
      orientation: s.docOrientation,
      fontFamily: s.docFontFamily,
      fontSize: s.docFontSize,
      margin: s.docMargin,
      includePageNumbers: s.docIncludePageNumbers,
    }
    switch (id) {
      case 'edit-pdf': return [await ADV.editPdfAddText(f0, s.pdfText, s.pdfPage, s.pdfX, s.pdfY, s.pdfSize, s.pdfColor, {
        mode: s.pdfEditMode,
        isRedact: s.pdfEditMode === 'redact',
        isHighlight: s.pdfEditMode === 'highlight',
        fontFamily: s.pdfFont,
        redactWidth: s.pdfRedactW,
        redactHeight: s.pdfRedactH,
        annotations: s.pdfAnnotations,
        destructiveRedact: s.pdfDestructiveRedact,
      })]
      case 'sign-pdf': {
        if (!s.sigData) throw new Error('Draw your signature first.')
        const sigBytes = new Uint8Array(await (await fetch(s.sigData)).arrayBuffer())
        const pos = s.signPos === 'custom' ? { xPct: s.pdfX, yPct: s.pdfY, width: s.sigWidth } : s.signPos
        return [await ADV.signPdf(f0, sigBytes, s.pdfPage, pos, {
          allPages: s.signAllPages,
          dateStamp: s.signDateStamp,
          placements: s.signPlacements,
        })]
      }
      case 'repair-pdf': return batch(fs, (f) => ADV.repairPdf(f))
      case 'pdf-to-word': case 'pdf-to-docx': return [await ADV.pdfToDocx(f0)]
      case 'pdf-to-excel': return [await ADV.pdfToExcel(f0, { mergeSheets: s.pdfExcelMergeSheets })]
      case 'pdf-to-powerpoint': case 'pdf-to-pptx': return [await ADV.pdfToPowerpoint(f0, s.scale, { mode: s.pptxMode })]
      case 'word-to-pdf': case 'docx-to-pdf': return [await ADV.docxToPdf(f0, docLayout)]
      case 'epub-to-pdf': return [await ADV.epubToPdf(f0, docLayout)]
    }
  }
  if (CRYPTO_IDS.has(id)) {
    const CRY = await import('../../processing/crypto')
    if (id === 'protect-pdf') {
      if (s.pwd !== s.pwd2) throw new Error('Passwords do not match.')
      return batch(fs, (f) => CRY.protectPdf(f, s.pwd, {
        ownerPassword: s.ownerPwd,
        allowPrinting: s.pdfAllowPrinting,
        allowCopying: s.pdfAllowCopying,
        allowModifying: s.pdfAllowModifying,
        allowAnnotating: s.pdfAllowAnnotating,
      }))
    }
    return batch(fs, (f) => CRY.unlockPdf(f, s.pwd))
  }
  throw new Error('This engine is not available yet.')
}
