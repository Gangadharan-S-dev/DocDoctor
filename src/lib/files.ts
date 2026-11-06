import type { Tool } from '../data/tools'

export interface PickedFile { file: File; id: string }

function matchesAccept(file: File, accept: string): boolean {
  if (accept.trim() === '*') return true
  const ext = '.' + (file.name.split('.').pop() ?? '').toLowerCase()
  return accept.split(',').map((s) => s.trim().toLowerCase()).includes(ext)
}

export function validateFiles(incoming: File[], tool: Tool, existing: number): { ok: File[]; errors: string[] } {
  const errors: string[] = []
  const ok: File[] = []
  for (const f of incoming) {
    if (!matchesAccept(f, tool.accept)) { errors.push(`"${f.name}" is not a supported format (${tool.acceptLabel}).`); continue }
    if (f.size > tool.maxSizeMB * 1048576) { errors.push(`"${f.name}" exceeds the ${tool.maxSizeMB} MB limit.`); continue }
    if (f.size === 0) { errors.push(`"${f.name}" is empty.`); continue }
    ok.push(f)
  }
  if (!tool.multiple && existing + ok.length > 1) {
    errors.push('This tool accepts one file at a time — extra files were ignored.')
    return { ok: ok.slice(0, Math.max(0, 1 - existing)), errors }
  }
  return { ok, errors }
}
