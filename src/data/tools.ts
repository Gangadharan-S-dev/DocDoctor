import {
  FileText, Image, FileType2, Presentation, Table2, Archive,
  FileArchive, Scissors, Merge, RotateCw, Lock, Unlock, Hash, Droplets,
  Wrench, PenLine, Stamp, Layers, FlipHorizontal2, Crop,
  Maximize2, RefreshCw, Info, FileImage, FileSpreadsheet, FileCode2,
  Braces, FileJson2, ArrowLeftRight, Eye, type LucideIcon,
} from 'lucide-react'

export type CategoryId = 'pdf' | 'image' | 'word' | 'powerpoint' | 'excel' | 'other'

export interface Category {
  id: CategoryId
  name: string
  tagline: string
  blurb: string
  color: string
  soft: string
  icon: LucideIcon
}

export interface Tool {
  id: string
  name: string
  description: string
  category: CategoryId
  accept: string
  acceptLabel: string
  maxSizeMB: number
  multiple: boolean
  icon: LucideIcon
  popular?: boolean
  phase: 2 | 3 | 4
  engine: string
}

export const CATEGORIES: Category[] = [
  { id: 'pdf', name: 'PDF Tools', tagline: 'Compress, merge, split & edit PDFs', blurb: 'The complete PDF toolkit — organize pages, convert formats, protect and repair documents.', color: '#E5484D', soft: '#FDECEC', icon: FileText },
  { id: 'image', name: 'Image Tools', tagline: 'Compress, resize, crop & convert', blurb: 'Fast image optimization and conversion with side-by-side previews and batch support.', color: '#0EA5A0', soft: '#E6F6F5', icon: Image },
  { id: 'word', name: 'Word Tools', tagline: 'DOCX conversion & editing', blurb: 'Convert and edit Word documents while preserving formatting wherever possible.', color: '#1D6FF2', soft: '#E8F0FE', icon: FileType2 },
  { id: 'powerpoint', name: 'PowerPoint Tools', tagline: 'Slides, decks & thumbnails', blurb: 'Merge, split, reorder and convert presentations with visual slide grids.', color: '#E86A2C', soft: '#FDEEE3', icon: Presentation },
  { id: 'excel', name: 'Excel Tools', tagline: 'Workbooks, sheets & CSV', blurb: 'Convert and manage spreadsheets — formulas, sheets and structure preserved where possible.', color: '#1F9D55', soft: '#E6F5EB', icon: Table2 },
  { id: 'other', name: 'Other File Tools', tagline: 'ZIP, text, JSON & more', blurb: 'Archives, data formatting and everyday file utilities in one place.', color: '#6D5DF6', soft: '#EEECFE', icon: Archive },
]

const T = (t: Tool): Tool => t

export const TOOLS: Tool[] = [
  // ── PDF (Phase 2) ──────────────────────────────────────────────
  T({ id: 'compress-pdf', name: 'Compress PDF', description: 'Reduce PDF file size with Extreme, Recommended or Less Compression presets.', category: 'pdf', accept: '.pdf', acceptLabel: 'PDF', maxSizeMB: 100, multiple: false, icon: FileArchive, popular: true, phase: 2, engine: 'pdf-lib rebuild (browser)' }),
  T({ id: 'merge-pdf', name: 'Merge PDF', description: 'Combine multiple PDFs into one document, in the order you choose.', category: 'pdf', accept: '.pdf', acceptLabel: 'PDF', maxSizeMB: 100, multiple: true, icon: Merge, popular: true, phase: 2, engine: 'pdf-lib' }),
  T({ id: 'split-pdf', name: 'Split PDF', description: 'Extract page ranges or split every page into its own file.', category: 'pdf', accept: '.pdf', acceptLabel: 'PDF', maxSizeMB: 100, multiple: false, icon: Scissors, popular: true, phase: 2, engine: 'pdf-lib' }),
  T({ id: 'remove-pdf-pages', name: 'Remove PDF Pages', description: 'Pick pages visually and delete them from your PDF.', category: 'pdf', accept: '.pdf', acceptLabel: 'PDF', maxSizeMB: 100, multiple: false, icon: Layers, phase: 2, engine: 'pdf-lib + PDF.js' }),
  T({ id: 'extract-pdf-pages', name: 'Extract PDF Pages', description: 'Save selected pages as a new, smaller PDF.', category: 'pdf', accept: '.pdf', acceptLabel: 'PDF', maxSizeMB: 100, multiple: false, icon: Scissors, phase: 2, engine: 'pdf-lib + PDF.js' }),
  T({ id: 'organize-pdf', name: 'Organize PDF', description: 'Reorder, rotate and delete pages with drag-and-drop thumbnails.', category: 'pdf', accept: '.pdf', acceptLabel: 'PDF', maxSizeMB: 100, multiple: false, icon: Layers, popular: true, phase: 2, engine: 'pdf-lib + PDF.js' }),
  T({ id: 'rotate-pdf', name: 'Rotate PDF', description: 'Rotate all pages or individual pages by 90°, 180° or 270°.', category: 'pdf', accept: '.pdf', acceptLabel: 'PDF', maxSizeMB: 100, multiple: false, icon: RotateCw, phase: 2, engine: 'pdf-lib' }),
  T({ id: 'pdf-to-word', name: 'PDF to Word', description: 'Convert PDF documents to editable DOCX files.', category: 'pdf', accept: '.pdf', acceptLabel: 'PDF', maxSizeMB: 100, multiple: false, icon: FileType2, popular: true, phase: 4, engine: 'Browser text-flow (LibreOffice server optional)' }),
  T({ id: 'word-to-pdf', name: 'Word to PDF', description: 'Convert DOC and DOCX documents to PDF.', category: 'pdf', accept: '.doc,.docx', acceptLabel: 'DOC / DOCX', maxSizeMB: 50, multiple: false, icon: FileText, popular: true, phase: 3, engine: 'Browser text-flow (LibreOffice server optional)' }),
  T({ id: 'pdf-to-jpg', name: 'PDF to JPG', description: 'Render each PDF page as a high-quality JPG image.', category: 'pdf', accept: '.pdf', acceptLabel: 'PDF', maxSizeMB: 100, multiple: false, icon: FileImage, phase: 2, engine: 'PDF.js canvas' }),
  T({ id: 'pdf-to-png', name: 'PDF to PNG', description: 'Render each PDF page as a lossless PNG image.', category: 'pdf', accept: '.pdf', acceptLabel: 'PDF', maxSizeMB: 100, multiple: false, icon: FileImage, phase: 2, engine: 'PDF.js canvas' }),
  T({ id: 'pdf-to-excel', name: 'PDF to Excel', description: 'Extract tables from PDF into XLSX spreadsheets.', category: 'pdf', accept: '.pdf', acceptLabel: 'PDF', maxSizeMB: 100, multiple: false, icon: FileSpreadsheet, phase: 4, engine: 'Browser text-flow (LibreOffice server optional)' }),
  T({ id: 'pdf-to-powerpoint', name: 'PDF to PowerPoint', description: 'Convert PDF pages into editable PPTX slides.', category: 'pdf', accept: '.pdf', acceptLabel: 'PDF', maxSizeMB: 100, multiple: false, icon: Presentation, phase: 4, engine: 'Browser text-flow (LibreOffice server optional)' }),
  T({ id: 'pdf-page-numbers', name: 'Add Page Numbers', description: 'Stamp page numbers with position, format and font controls.', category: 'pdf', accept: '.pdf', acceptLabel: 'PDF', maxSizeMB: 100, multiple: false, icon: Hash, phase: 2, engine: 'pdf-lib' }),
  T({ id: 'pdf-watermark', name: 'Add Watermark', description: 'Add text or image watermarks with opacity and tiling options.', category: 'pdf', accept: '.pdf', acceptLabel: 'PDF', maxSizeMB: 100, multiple: false, icon: Droplets, phase: 2, engine: 'pdf-lib' }),
  T({ id: 'protect-pdf', name: 'Protect PDF', description: 'Encrypt your PDF with a password you control.', category: 'pdf', accept: '.pdf', acceptLabel: 'PDF', maxSizeMB: 100, multiple: false, icon: Lock, phase: 2, engine: '@cantoo/pdf-lib AES-256 (browser)' }),
  T({ id: 'unlock-pdf', name: 'Unlock PDF', description: 'Remove a password you own or are authorized to remove.', category: 'pdf', accept: '.pdf', acceptLabel: 'PDF', maxSizeMB: 100, multiple: false, icon: Unlock, phase: 2, engine: '@cantoo/pdf-lib (browser, password required)' }),
  T({ id: 'edit-pdf', name: 'Edit PDF', description: 'Add text, shapes and annotations directly on the page.', category: 'pdf', accept: '.pdf', acceptLabel: 'PDF', maxSizeMB: 100, multiple: false, icon: PenLine, phase: 4, engine: 'pdf-lib + PDF.js' }),
  T({ id: 'sign-pdf', name: 'Sign PDF', description: 'Draw or type a signature and place it on any page.', category: 'pdf', accept: '.pdf', acceptLabel: 'PDF', maxSizeMB: 100, multiple: false, icon: Stamp, phase: 4, engine: 'pdf-lib + canvas' }),
  T({ id: 'repair-pdf', name: 'Repair PDF', description: 'Attempt to recover and rebuild damaged PDF files.', category: 'pdf', accept: '.pdf', acceptLabel: 'PDF', maxSizeMB: 100, multiple: false, icon: Wrench, phase: 4, engine: 'pdf-lib rebuild (browser)' }),
  T({ id: 'ocr-pdf', name: 'OCR PDF to Text', description: 'Recognize text in scanned PDFs with on-device OCR in 13 languages. Download plain text, a searchable PDF, or both.', category: 'pdf', accept: '.pdf', acceptLabel: 'PDF', maxSizeMB: 100, multiple: false, icon: Eye, phase: 4, engine: 'Tesseract.js OCR (browser)' }),
  T({ id: 'compare-pdf', name: 'Compare PDFs', description: 'Compare two PDF documents side-by-side to highlight page differences and changes.', category: 'pdf', accept: '.pdf', acceptLabel: 'PDF', maxSizeMB: 100, multiple: true, icon: ArrowLeftRight, phase: 2, engine: 'PDF.js visual diff (browser)' }),
  // ── Image (Phase 2) ────────────────────────────────────────────
  T({ id: 'compress-image', name: 'Compress Image', description: 'Shrink JPG, PNG and WebP with adjustable quality and batch support.', category: 'image', accept: '.jpg,.jpeg,.png,.webp,.gif,.avif', acceptLabel: 'JPG, PNG, WebP, GIF, AVIF', maxSizeMB: 50, multiple: true, icon: FileArchive, popular: true, phase: 2, engine: 'Canvas (browser)' }),
  T({ id: 'resize-image', name: 'Resize Image', description: 'Set exact width and height, with aspect-ratio lock.', category: 'image', accept: '.jpg,.jpeg,.png,.webp', acceptLabel: 'JPG, PNG, WebP', maxSizeMB: 50, multiple: true, icon: Maximize2, popular: true, phase: 2, engine: 'Canvas (browser)' }),
  T({ id: 'crop-image', name: 'Crop Image', description: 'Crop with a visual editor and preset aspect ratios.', category: 'image', accept: '.jpg,.jpeg,.png,.webp', acceptLabel: 'JPG, PNG, WebP', maxSizeMB: 50, multiple: false, icon: Crop, phase: 2, engine: 'Canvas editor (browser)' }),
  T({ id: 'jpg-to-png', name: 'JPG to PNG', description: 'Convert JPG images to lossless PNG.', category: 'image', accept: '.jpg,.jpeg', acceptLabel: 'JPG', maxSizeMB: 50, multiple: true, icon: RefreshCw, phase: 2, engine: 'Canvas (browser)' }),
  T({ id: 'png-to-jpg', name: 'PNG to JPG', description: 'Convert PNG images to compact JPG.', category: 'image', accept: '.png', acceptLabel: 'PNG', maxSizeMB: 50, multiple: true, icon: RefreshCw, phase: 2, engine: 'Canvas (browser)' }),
  T({ id: 'webp-converter', name: 'WebP Converter', description: 'Convert images to and from modern WebP.', category: 'image', accept: '.jpg,.jpeg,.png,.webp', acceptLabel: 'JPG, PNG, WebP', maxSizeMB: 50, multiple: true, icon: ArrowLeftRight, phase: 2, engine: 'Canvas (browser)' }),
  T({ id: 'jpg-to-webp', name: 'JPG to WebP', description: 'Convert JPG images to smaller WebP files.', category: 'image', accept: '.jpg,.jpeg', acceptLabel: 'JPG', maxSizeMB: 50, multiple: true, icon: RefreshCw, phase: 2, engine: 'Canvas (browser)' }),
  T({ id: 'png-to-webp', name: 'PNG to WebP', description: 'Convert PNG images to smaller WebP files.', category: 'image', accept: '.png', acceptLabel: 'PNG', maxSizeMB: 50, multiple: true, icon: RefreshCw, phase: 2, engine: 'Canvas (browser)' }),
  T({ id: 'rotate-image', name: 'Rotate Image', description: 'Rotate images in 90° steps or fine angles.', category: 'image', accept: '.jpg,.jpeg,.png,.webp', acceptLabel: 'JPG, PNG, WebP', maxSizeMB: 50, multiple: true, icon: RotateCw, phase: 2, engine: 'Canvas (browser)' }),
  T({ id: 'flip-image', name: 'Flip Image', description: 'Mirror images horizontally or vertically.', category: 'image', accept: '.jpg,.jpeg,.png,.webp', acceptLabel: 'JPG, PNG, WebP', maxSizeMB: 50, multiple: true, icon: FlipHorizontal2, phase: 2, engine: 'Canvas (browser)' }),
  T({ id: 'image-to-pdf', name: 'Image to PDF', description: 'Combine images into a single, well-ordered PDF.', category: 'image', accept: '.jpg,.jpeg,.png,.webp', acceptLabel: 'JPG, PNG, WebP', maxSizeMB: 50, multiple: true, icon: FileText, popular: true, phase: 2, engine: 'pdf-lib' }),
  T({ id: 'pdf-to-image', name: 'PDF to Image', description: 'Render PDF pages as JPG or PNG images.', category: 'image', accept: '.pdf', acceptLabel: 'PDF', maxSizeMB: 100, multiple: false, icon: FileImage, phase: 2, engine: 'PDF.js canvas' }),
  T({ id: 'image-watermark', name: 'Add Image Watermark', description: 'Overlay text or logo watermarks on images.', category: 'image', accept: '.jpg,.jpeg,.png', acceptLabel: 'JPG, PNG', maxSizeMB: 50, multiple: true, icon: Droplets, phase: 2, engine: 'Canvas composite (browser)' }),
  T({ id: 'image-metadata', name: 'Image Metadata Viewer', description: 'Inspect EXIF, dimensions, format and color profile.', category: 'image', accept: '.jpg,.jpeg,.png,.webp,.gif', acceptLabel: 'JPG, PNG, WebP, GIF', maxSizeMB: 50, multiple: false, icon: Info, phase: 2, engine: 'Canvas + File API (browser)' }),
  T({ id: 'ico-converter', name: 'ICO Converter', description: 'Create multi-size .ico favicons from any image.', category: 'image', accept: '.png,.jpg,.jpeg', acceptLabel: 'PNG, JPG', maxSizeMB: 20, multiple: false, icon: RefreshCw, phase: 2, engine: 'Canvas + ICO encoder (browser)' }),
  T({ id: 'image-ocr', name: 'Image to Text (OCR)', description: 'Extract text from photos and screenshots with on-device OCR in 13 languages, as plain text or a searchable PDF.', category: 'image', accept: '.jpg,.jpeg,.png,.webp', acceptLabel: 'JPG, PNG, WebP', maxSizeMB: 50, multiple: false, icon: Eye, phase: 4, engine: 'Tesseract.js OCR (browser)' }),
  // ── Word (Phase 3) ─────────────────────────────────────────────
  T({ id: 'docx-to-pdf', name: 'DOCX to PDF', description: 'Convert Word documents to PDF with layout preserved.', category: 'word', accept: '.docx,.doc', acceptLabel: 'DOC / DOCX', maxSizeMB: 50, multiple: false, icon: FileText, popular: true, phase: 3, engine: 'Browser text-flow (LibreOffice server optional)' }),
  T({ id: 'pdf-to-docx', name: 'PDF to DOCX', description: 'Convert PDFs back to editable Word documents.', category: 'word', accept: '.pdf', acceptLabel: 'PDF', maxSizeMB: 100, multiple: false, icon: FileType2, phase: 4, engine: 'Browser text-flow (LibreOffice server optional)' }),
  T({ id: 'remove-word-pages', name: 'Remove Word Pages', description: 'Remove specific pages or sections from Word documents. Safely deletes pages with page breaks, sections, or paragraphs.', category: 'word', accept: '.docx', acceptLabel: 'DOCX', maxSizeMB: 50, multiple: false, icon: Scissors, phase: 3, engine: 'DOCX page surgery (browser)' }),
  T({ id: 'docx-page-remover', name: 'DOCX Page Remover', description: 'Delete unwanted pages from Word DOCX files. Select pages visually with page break detection and instant preview.', category: 'word', accept: '.docx', acceptLabel: 'DOCX', maxSizeMB: 50, multiple: false, icon: Scissors, popular: true, phase: 3, engine: 'DOCX page surgery (browser)' }),
  T({ id: 'merge-word', name: 'Merge Word', description: 'Combine several DOCX files into one document.', category: 'word', accept: '.docx', acceptLabel: 'DOCX', maxSizeMB: 50, multiple: true, icon: Merge, phase: 3, engine: 'docx structured merge' }),
  T({ id: 'split-word', name: 'Split Word', description: 'Split a DOCX by sections or heading ranges.', category: 'word', accept: '.docx', acceptLabel: 'DOCX', maxSizeMB: 50, multiple: false, icon: Scissors, phase: 3, engine: 'docx structured split' }),
  T({ id: 'compress-docx', name: 'Compress DOCX', description: 'Recompress embedded media and prune unused parts.', category: 'word', accept: '.docx', acceptLabel: 'DOCX', maxSizeMB: 50, multiple: false, icon: FileArchive, phase: 3, engine: 'ZIP re-pack + media optimize' }),
  T({ id: 'edit-word', name: 'Edit Word', description: 'Edit document text in the browser and re-download.', category: 'word', accept: '.docx', acceptLabel: 'DOCX', maxSizeMB: 50, multiple: false, icon: PenLine, phase: 3, engine: 'docx XML editor' }),
  T({ id: 'word-to-txt', name: 'Word to TXT', description: 'Extract clean plain text from DOCX files.', category: 'word', accept: '.docx,.doc', acceptLabel: 'DOC / DOCX', maxSizeMB: 50, multiple: false, icon: FileText, phase: 3, engine: 'mammoth extract' }),
  T({ id: 'word-to-html', name: 'Word to HTML', description: 'Convert DOCX to clean, semantic HTML.', category: 'word', accept: '.docx', acceptLabel: 'DOCX', maxSizeMB: 50, multiple: false, icon: FileCode2, phase: 3, engine: 'mammoth' }),
  T({ id: 'extract-word-text', name: 'Extract Word Text', description: 'Pull raw text with headings and lists preserved.', category: 'word', accept: '.docx,.doc', acceptLabel: 'DOC / DOCX', maxSizeMB: 50, multiple: false, icon: Eye, phase: 3, engine: 'mammoth extract' }),
  // ── PowerPoint (Phase 3) ───────────────────────────────────────
  T({ id: 'pptx-to-pdf', name: 'PPTX to PDF', description: 'Convert presentations to PDF, one slide per page.', category: 'powerpoint', accept: '.pptx,.ppt', acceptLabel: 'PPT / PPTX', maxSizeMB: 100, multiple: false, icon: FileText, popular: true, phase: 3, engine: 'Browser text-flow (LibreOffice server optional)' }),
  T({ id: 'pdf-to-pptx', name: 'PDF to PPTX', description: 'Turn PDF pages into presentation slides.', category: 'powerpoint', accept: '.pdf', acceptLabel: 'PDF', maxSizeMB: 100, multiple: false, icon: Presentation, phase: 4, engine: 'Browser text-flow (LibreOffice server optional)' }),
  T({ id: 'compress-powerpoint', name: 'Compress PowerPoint', description: 'Shrink decks by optimizing embedded media.', category: 'powerpoint', accept: '.pptx', acceptLabel: 'PPTX', maxSizeMB: 100, multiple: false, icon: FileArchive, phase: 3, engine: 'ZIP re-pack + media optimize' }),
  T({ id: 'merge-presentations', name: 'Merge Presentations', description: 'Combine slides from multiple decks into one.', category: 'powerpoint', accept: '.pptx', acceptLabel: 'PPTX', maxSizeMB: 100, multiple: true, icon: Merge, phase: 3, engine: 'PptxGenJS / OOXML' }),
  T({ id: 'split-presentations', name: 'Split Presentation', description: 'Split a deck into one file per slide or range.', category: 'powerpoint', accept: '.pptx', acceptLabel: 'PPTX', maxSizeMB: 100, multiple: false, icon: Scissors, phase: 3, engine: 'OOXML slide split' }),
  T({ id: 'remove-slides', name: 'Remove Slides', description: 'Select slides visually and remove them from the deck.', category: 'powerpoint', accept: '.pptx', acceptLabel: 'PPTX', maxSizeMB: 100, multiple: false, icon: Layers, phase: 3, engine: 'OOXML + thumbnails' }),
  T({ id: 'extract-slides', name: 'Extract Slides', description: 'Export selected slides as a new presentation.', category: 'powerpoint', accept: '.pptx', acceptLabel: 'PPTX', maxSizeMB: 100, multiple: false, icon: Scissors, phase: 3, engine: 'OOXML + thumbnails' }),
  T({ id: 'reorder-slides', name: 'Reorder Slides', description: 'Drag slides into a new order and download.', category: 'powerpoint', accept: '.pptx', acceptLabel: 'PPTX', maxSizeMB: 100, multiple: false, icon: Layers, phase: 3, engine: 'OOXML + thumbnails' }),
  T({ id: 'slides-to-images', name: 'Slides to Images', description: 'Export every slide as JPG or PNG.', category: 'powerpoint', accept: '.pptx,.ppt', acceptLabel: 'PPT / PPTX', maxSizeMB: 100, multiple: false, icon: FileImage, phase: 3, engine: 'LibreOffice + render' }),
  // ── Excel (Phase 3) ────────────────────────────────────────────
  T({ id: 'xlsx-to-pdf', name: 'XLSX to PDF', description: 'Convert workbooks to print-ready PDF.', category: 'excel', accept: '.xlsx,.xls', acceptLabel: 'XLS / XLSX', maxSizeMB: 50, multiple: false, icon: FileText, phase: 3, engine: 'Browser text-flow (LibreOffice server optional)' }),
  T({ id: 'xls-to-xlsx', name: 'XLS to XLSX', description: 'Upgrade legacy .xls workbooks to modern .xlsx.', category: 'excel', accept: '.xls', acceptLabel: 'XLS', maxSizeMB: 50, multiple: false, icon: RefreshCw, phase: 3, engine: 'SheetJS' }),
  T({ id: 'csv-to-excel', name: 'CSV to Excel', description: 'Convert CSV data into a formatted XLSX workbook.', category: 'excel', accept: '.csv', acceptLabel: 'CSV', maxSizeMB: 20, multiple: false, icon: FileSpreadsheet, phase: 3, engine: 'SheetJS' }),
  T({ id: 'excel-to-csv', name: 'Excel to CSV', description: 'Export worksheets to CSV, one file per sheet.', category: 'excel', accept: '.xlsx,.xls', acceptLabel: 'XLS / XLSX', maxSizeMB: 50, multiple: false, icon: FileSpreadsheet, phase: 3, engine: 'SheetJS' }),
  T({ id: 'merge-excel', name: 'Merge Excel', description: 'Combine workbooks while keeping sheet names.', category: 'excel', accept: '.xlsx', acceptLabel: 'XLSX', maxSizeMB: 50, multiple: true, icon: Merge, phase: 3, engine: 'SheetJS' }),
  T({ id: 'split-worksheets', name: 'Split Worksheets', description: 'Export each worksheet as its own workbook.', category: 'excel', accept: '.xlsx', acceptLabel: 'XLSX', maxSizeMB: 50, multiple: false, icon: Scissors, phase: 3, engine: 'SheetJS' }),
  T({ id: 'remove-worksheets', name: 'Remove Worksheets', description: 'Delete selected sheets from a workbook.', category: 'excel', accept: '.xlsx', acceptLabel: 'XLSX', maxSizeMB: 50, multiple: false, icon: Layers, phase: 3, engine: 'SheetJS' }),
  T({ id: 'compress-excel', name: 'Compress Excel', description: 'Reduce workbook size without touching formulas.', category: 'excel', accept: '.xlsx', acceptLabel: 'XLSX', maxSizeMB: 50, multiple: false, icon: FileArchive, phase: 3, engine: 'ZIP re-pack' }),
  T({ id: 'excel-to-html', name: 'Excel to HTML', description: 'Publish worksheets as clean HTML tables.', category: 'excel', accept: '.xlsx,.xls', acceptLabel: 'XLS / XLSX', maxSizeMB: 50, multiple: false, icon: FileCode2, phase: 3, engine: 'SheetJS' }),
  T({ id: 'excel-to-pdf', name: 'Excel to PDF', description: 'Convert spreadsheets to PDF with print settings.', category: 'excel', accept: '.xlsx,.xls', acceptLabel: 'XLS / XLSX', maxSizeMB: 50, multiple: false, icon: FileText, phase: 3, engine: 'Browser text-flow (LibreOffice server optional)' }),
  // ── Other (Phase 3–4) ──────────────────────────────────────────
  T({ id: 'zip-files', name: 'Create ZIP', description: 'Bundle multiple files into a single ZIP archive.', category: 'other', accept: '*', acceptLabel: 'Any file', maxSizeMB: 200, multiple: true, icon: FileArchive, phase: 3, engine: 'JSZip / Archiver' }),
  T({ id: 'extract-zip', name: 'Extract ZIP', description: 'Safely unpack ZIP archives — path traversal blocked.', category: 'other', accept: '.zip', acceptLabel: 'ZIP', maxSizeMB: 200, multiple: false, icon: Archive, phase: 3, engine: 'JSZip (safe extract)' }),
  T({ id: 'txt-converter', name: 'TXT Converter', description: 'Convert between TXT, HTML and Markdown.', category: 'other', accept: '.txt,.md,.html', acceptLabel: 'TXT, MD, HTML', maxSizeMB: 10, multiple: false, icon: ArrowLeftRight, phase: 3, engine: 'Text transforms' }),
  T({ id: 'html-to-txt', name: 'HTML to TXT', description: 'Strip markup and keep readable plain text.', category: 'other', accept: '.html,.htm', acceptLabel: 'HTML', maxSizeMB: 10, multiple: false, icon: FileText, phase: 3, engine: 'DOM parse (browser)' }),
  T({ id: 'markdown-converter', name: 'Markdown Converter', description: 'Convert Markdown to HTML or plain text.', category: 'other', accept: '.md,.markdown,.txt', acceptLabel: 'Markdown', maxSizeMB: 10, multiple: false, icon: FileCode2, phase: 3, engine: 'marked (browser)' }),
  T({ id: 'json-formatter', name: 'JSON Formatter', description: 'Format, validate and minify JSON instantly.', category: 'other', accept: '.json', acceptLabel: 'JSON', maxSizeMB: 10, multiple: false, icon: Braces, phase: 3, engine: 'Native JSON (browser)' }),
  T({ id: 'json-to-xml', name: 'JSON to XML', description: 'Convert JSON documents to well-formed XML.', category: 'other', accept: '.json', acceptLabel: 'JSON', maxSizeMB: 10, multiple: false, icon: FileJson2, phase: 3, engine: 'XML builder' }),
  T({ id: 'xml-formatter', name: 'XML Formatter', description: 'Pretty-print and validate XML documents.', category: 'other', accept: '.xml', acceptLabel: 'XML', maxSizeMB: 10, multiple: false, icon: FileCode2, phase: 3, engine: 'DOMParser (browser)' }),
  T({ id: 'csv-tools', name: 'CSV Tools', description: 'Clean, dedupe and re-delimit CSV files.', category: 'other', accept: '.csv', acceptLabel: 'CSV', maxSizeMB: 20, multiple: false, icon: Table2, phase: 3, engine: 'PapaParse / SheetJS' }),
  T({ id: 'epub-to-pdf', name: 'EPUB to PDF', description: 'Convert ebooks to PDF where the source allows it.', category: 'other', accept: '.epub', acceptLabel: 'EPUB', maxSizeMB: 50, multiple: false, icon: FileText, phase: 4, engine: 'LibreOffice / Calibre' }),
  T({ id: 'file-metadata', name: 'File Metadata Viewer', description: 'See size, type, hash and document properties.', category: 'other', accept: '*', acceptLabel: 'Any file', maxSizeMB: 200, multiple: false, icon: Info, phase: 3, engine: 'Browser File API + hash' }),
]

/** Tools with a real, tested processing engine wired up (Phase 2). Everything else stays honestly disabled. */
export const IMPLEMENTED_IDS = new Set([
  'compress-image', 'resize-image', 'crop-image', 'jpg-to-png', 'png-to-jpg', 'webp-converter',
  'jpg-to-webp', 'png-to-webp', 'rotate-image', 'flip-image', 'image-to-pdf', 'pdf-to-image',
  'image-watermark', 'image-metadata', 'ico-converter',
  'compress-pdf', 'merge-pdf', 'split-pdf', 'remove-pdf-pages', 'extract-pdf-pages',
  'organize-pdf', 'rotate-pdf', 'pdf-to-jpg', 'pdf-to-png', 'pdf-page-numbers', 'pdf-watermark',
  // Phase 3 — Word / PowerPoint / Excel / other, browser engines.
  // Deliberately NOT live (need a LibreOffice-class renderer, unavailable in-browser):
  // docx-to-pdf, pdf-to-docx, remove-word-pages, pptx-to-pdf, pdf-to-pptx, slides-to-images, epub-to-pdf.
  'word-to-txt', 'word-to-html', 'extract-word-text', 'compress-docx', 'merge-word', 'split-word', 'edit-word',
  'compress-powerpoint', 'merge-presentations', 'split-presentations', 'remove-slides', 'extract-slides', 'reorder-slides',
  'xls-to-xlsx', 'csv-to-excel', 'excel-to-csv', 'merge-excel', 'split-worksheets', 'remove-worksheets',
  'compress-excel', 'excel-to-html', 'xlsx-to-pdf', 'excel-to-pdf',
  'zip-files', 'extract-zip', 'txt-converter', 'html-to-txt', 'markdown-converter',
  'json-formatter', 'json-to-xml', 'xml-formatter', 'csv-tools', 'file-metadata',
  // Phase 4 — advanced, browser engines with disclosed simplifications.
  'edit-pdf', 'sign-pdf', 'repair-pdf', 'pdf-to-word', 'pdf-to-docx', 'pdf-to-excel',
  // Phase 5 — AES-256 encryption (@cantoo/pdf-lib) + safe Word content removal.
  // Server-gated only: pptx-to-pdf + slides-to-images (LibreOffice service).
  'protect-pdf', 'unlock-pdf', 'remove-word-pages', 'docx-page-remover',
  'pdf-to-powerpoint', 'pdf-to-pptx', 'word-to-pdf', 'docx-to-pdf', 'epub-to-pdf',
  'ocr-pdf', 'image-ocr', 'compare-pdf',
])
export const isImplemented = (t: Tool) => IMPLEMENTED_IDS.has(t.id)

/** Tools served by the optional LibreOffice conversion service (server/). */
export const SERVER_TOOL_IDS: Record<string, string> = {
  'pptx-to-pdf': 'pptx-to-pdf',
  'slides-to-images': 'slides-to-images',
}
export const isServerTool = (t: Tool) => t.id in SERVER_TOOL_IDS

/** Browser-live tools that gain a full-fidelity LibreOffice server option when the service is connected. */
export const SERVER_UPGRADE_IDS: Record<string, string> = {
  'docx-to-pdf': 'docx-to-pdf',
  'word-to-pdf': 'docx-to-pdf',
  'xlsx-to-pdf': 'xlsx-to-pdf',
  'excel-to-pdf': 'xlsx-to-pdf',
}
export const serverEndpointFor = (t: Tool): string | undefined => SERVER_TOOL_IDS[t.id] ?? SERVER_UPGRADE_IDS[t.id]

export const categoryById = (id: CategoryId) => CATEGORIES.find((c) => c.id === id)!
export const toolById = (id: string) => TOOLS.find((t) => t.id === id)
export const toolsByCategory = (id: CategoryId) => TOOLS.filter((t) => t.category === id)
export const popularTools = TOOLS.filter((t) => t.popular)
export const formatSize = (bytes: number) =>
  bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(2)} MB`
