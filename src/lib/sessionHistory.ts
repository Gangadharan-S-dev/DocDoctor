export interface SessionHistoryItem {
  id: string
  toolId: string
  toolName: string
  fileName: string
  blob: Blob
  size: number
  createdAt: number
}

const MAX_ITEMS = 8
let items: SessionHistoryItem[] = []
const listeners = new Set<() => void>()

function emit() {
  listeners.forEach((fn) => fn())
}

export function getSessionHistory(): SessionHistoryItem[] {
  return items
}

export function pushSessionHistory(entry: Omit<SessionHistoryItem, 'id' | 'createdAt'>) {
  const next: SessionHistoryItem = {
    ...entry,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    createdAt: Date.now(),
  }
  items = [next, ...items].slice(0, MAX_ITEMS)
  emit()
}

export function clearSessionHistory() {
  if (!items.length) return
  items = []
  emit()
}

export function onSessionHistoryChange(fn: () => void): () => void {
  listeners.add(fn)
  return () => listeners.delete(fn)
}
