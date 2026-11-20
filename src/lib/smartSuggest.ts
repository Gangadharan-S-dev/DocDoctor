import { TOOLS, toolById, type Tool } from '../data/tools'

const IMG_EXTS = new Set(['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.bmp', '.svg'])

function extOf(file: File): string {
  return `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`
}

function isImageFile(file: File): boolean {
  const ext = extOf(file)
  return file.type.startsWith('image/') || IMG_EXTS.has(ext)
}

function resolveIds(ids: string[]): Tool[] {
  return ids.map((id) => toolById(id)).filter((t): t is Tool => !!t)
}

export interface SmartSuggestionResult {
  tools: Tool[]
  batchLabel: string
}

/**
 * Suggests the best tools for one OR multiple dropped/pasted files.
 * Detects multi-file batch intent (e.g. 2+ PDFs -> Merge/Compare, 2+ Images -> PDF/Collage/GIF, mixed -> ZIP).
 */
export function suggestToolsForFiles(files: File[]): SmartSuggestionResult {
  if (files.length === 0) return { tools: [], batchLabel: '' }

  if (files.length > 1) {
    const exts = files.map(extOf)
    const allPdf = exts.every((e) => e === '.pdf')
    const allHeic = exts.every((e) => e === '.heic' || e === '.heif')
    const allImg = files.every(isImageFile)
    const allDocx = exts.every((e) => e === '.docx' || e === '.doc')
    const allPptx = exts.every((e) => e === '.pptx' || e === '.ppt')
    const allXlsx = exts.every((e) => e === '.xlsx' || e === '.xls')

    if (allPdf) {
      const ids =
        files.length === 2
          ? ['merge-pdf', 'compare-pdf', 'compress-pdf', 'zip-files']
          : ['merge-pdf', 'compress-pdf', 'zip-files', 'pdf-page-numbers']
      return { tools: resolveIds(ids).slice(0, 6), batchLabel: `${files.length} PDFs · Batch merge & compare` }
    }
    if (allHeic) {
      return {
        tools: resolveIds(['heic-to-jpg', 'image-converter', 'image-to-pdf', 'zip-files']).slice(0, 6),
        batchLabel: `${files.length} HEIC photos · Batch convert`,
      }
    }
    if (allImg) {
      return {
        tools: resolveIds([
          'image-to-pdf',
          'image-collage',
          'gif-maker',
          'compress-image',
          'resize-image',
          'image-converter',
        ]).slice(0, 6),
        batchLabel: `${files.length} images · Batch studio`,
      }
    }
    if (allDocx) {
      return {
        tools: resolveIds(['merge-word', 'compress-docx', 'zip-files', 'docx-to-pdf']).slice(0, 6),
        batchLabel: `${files.length} Word docs · Batch merge`,
      }
    }
    if (allPptx) {
      return {
        tools: resolveIds(['merge-presentations', 'compress-powerpoint', 'zip-files']).slice(0, 6),
        batchLabel: `${files.length} decks · Batch merge`,
      }
    }
    if (allXlsx) {
      return {
        tools: resolveIds(['merge-excel', 'compress-excel', 'zip-files']).slice(0, 6),
        batchLabel: `${files.length} spreadsheets · Batch merge`,
      }
    }
    return {
      tools: resolveIds(['zip-files', 'file-metadata']).slice(0, 6),
      batchLabel: `${files.length} mixed files · Archive ready`,
    }
  }

  const file = files[0]
  const ext = extOf(file)
  const isHeic = ext === '.heic' || ext === '.heif'
  const isImg = isImageFile(file)

  let preferredIds: string[]
  if (ext === '.pdf') {
    preferredIds = ['compress-pdf', 'split-pdf', 'sign-pdf', 'ocr-pdf', 'pdf-to-word', 'protect-pdf']
  } else if (isHeic) {
    preferredIds = ['heic-to-jpg', 'image-converter', 'compress-image', 'image-to-pdf']
  } else if (isImg) {
    preferredIds = ['compress-image-kb', 'blur-image', 'resize-image', 'crop-image', 'passport-photo', 'image-to-pdf']
  } else if (ext === '.docx' || ext === '.doc') {
    preferredIds = ['docx-to-pdf', 'docx-page-remover', 'compress-docx', 'edit-word', 'word-to-txt']
  } else if (ext === '.pptx' || ext === '.ppt') {
    preferredIds = ['pptx-to-pdf', 'compress-powerpoint', 'split-presentations', 'remove-slides']
  } else if (ext === '.xlsx' || ext === '.xls') {
    preferredIds = ['excel-to-csv', 'excel-to-pdf', 'compress-excel', 'split-worksheets']
  } else if (ext === '.csv') {
    preferredIds = ['csv-to-excel', 'csv-tools']
  } else if (ext === '.zip') {
    preferredIds = ['extract-zip', 'file-metadata']
  } else if (ext === '.json') {
    preferredIds = ['json-formatter', 'json-to-xml']
  } else if (ext === '.md') {
    preferredIds = ['markdown-converter', 'file-metadata']
  } else {
    preferredIds = ['zip-files', 'file-metadata']
  }

  const picked = resolveIds(preferredIds)
  if (picked.length > 0) return { tools: picked.slice(0, 6), batchLabel: 'Ready in browser memory' }
  return {
    tools: TOOLS.filter((t) => t.accept === '*' || t.accept.split(',').includes(ext)).slice(0, 6),
    batchLabel: 'Ready in browser memory',
  }
}

export function suggestToolsForFile(file: File): Tool[] {
  return suggestToolsForFiles([file]).tools
}
