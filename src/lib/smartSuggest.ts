import { TOOLS, toolById, type Tool } from '../data/tools'

export function suggestToolsForFile(file: File): Tool[] {
  const ext = `.${file.name.split('.').pop()?.toLowerCase() ?? ''}`
  const isHeic = ext === '.heic' || ext === '.heif'
  const isImg =
    file.type.startsWith('image/') ||
    ['.jpg', '.jpeg', '.png', '.webp', '.gif', '.avif', '.bmp', '.svg'].includes(ext)

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

  const picked = preferredIds.map((id) => toolById(id)).filter((t): t is Tool => !!t)
  if (picked.length > 0) return picked.slice(0, 6)
  return TOOLS.filter((t) => t.accept === '*' || t.accept.split(',').includes(ext)).slice(0, 6)
}
