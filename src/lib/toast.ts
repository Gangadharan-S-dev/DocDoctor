export type ToastTone = 'info' | 'success' | 'accent' | 'error'

export interface ToastItem {
  id: string
  message: string
  tone: ToastTone
}

type Listener = (toast: ToastItem) => void
const listeners = new Set<Listener>()

export function showToast(message: string, tone: ToastTone = 'info'): void {
  const item: ToastItem = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    message,
    tone,
  }
  listeners.forEach((fn) => fn(item))
}

export function subscribeToasts(fn: Listener): () => void {
  listeners.add(fn)
  return () => { listeners.delete(fn) }
}
