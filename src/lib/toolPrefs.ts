import type { ImgFormat } from '../processing/image'

export interface ToolPreset {
  quality?: number
  format?: 'keep' | ImgFormat
  level?: 'less' | 'recommended' | 'extreme'
  scale?: number
  pageSize?: 'fit' | 'a4' | 'letter'
  ocrLang?: string
}

const KEY = 'docdoctor:tool-prefs:v1'

function readAll(): Record<string, ToolPreset> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const parsed = JSON.parse(raw)
    return parsed && typeof parsed === 'object' ? (parsed as Record<string, ToolPreset>) : {}
  } catch {
    return {}
  }
}

function writeAll(map: Record<string, ToolPreset>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(map))
  } catch {
    /* ignore quota/private mode */
  }
}

export function loadToolPreset(toolId: string): ToolPreset {
  return readAll()[toolId] ?? {}
}

export function saveToolPreset(toolId: string, patch: ToolPreset) {
  const all = readAll()
  all[toolId] = { ...(all[toolId] ?? {}), ...patch }
  writeAll(all)
}

export function clearToolPreset(toolId: string) {
  const all = readAll()
  if (!(toolId in all)) return
  delete all[toolId]
  writeAll(all)
}
