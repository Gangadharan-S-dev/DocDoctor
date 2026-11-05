export interface OutputFile { name: string; blob: Blob }

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 4000)
}

export async function downloadZip(files: OutputFile[], zipName: string) {
  const { default: JSZip } = await import('jszip')
  const zip = new JSZip()
  for (const f of files) zip.file(f.name, f.blob)
  const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE' })
  downloadBlob(blob, zipName)
}

export const stem = (name: string) => name.replace(/\.[^.]+$/, '')
export const extOf = (name: string) => (name.split('.').pop() ?? '').toLowerCase()
