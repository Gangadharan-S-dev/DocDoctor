import { useEffect, useState } from 'react'
import { CheckCircle2, Sparkles, Info, X } from 'lucide-react'
import { subscribeToasts, type ToastItem } from '../lib/toast'

export default function Toaster() {
  const [items, setItems] = useState<ToastItem[]>([])

  useEffect(() => {
    const timers = new Map<string, number>()
    const unsub = subscribeToasts((toast) => {
      setItems((prev) => [...prev.slice(-2), toast])
      const t = window.setTimeout(() => {
        setItems((prev) => prev.filter((x) => x.id !== toast.id))
        timers.delete(toast.id)
      }, 2800)
      timers.set(toast.id, t)
    })
    return () => {
      unsub()
      timers.forEach((t) => window.clearTimeout(t))
    }
  }, [])

  if (items.length === 0) return null

  return (
    <div
      aria-live="polite"
      aria-atomic="false"
      className="pointer-events-none fixed bottom-5 right-5 z-50 flex flex-col items-end gap-2"
    >
      {items.map((toast) => (
        <div
          key={toast.id}
          className="animate-toast-in pointer-events-auto flex items-center gap-2.5 rounded-2xl border border-slate-200/80 bg-white/95 px-4 py-2.5 text-sm font-bold text-ink-950 shadow-lift backdrop-blur-xl dark:border-slate-700/80 dark:bg-[#0e1525]/95 dark:text-white"
        >
          {toast.tone === 'success' ? (
            <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-500" />
          ) : toast.tone === 'accent' ? (
            <Sparkles className="h-4 w-4 shrink-0 text-accent" />
          ) : (
            <Info className="h-4 w-4 shrink-0 text-blue-500" />
          )}
          <span>{toast.message}</span>
          <button
            type="button"
            onClick={() => setItems((prev) => prev.filter((x) => x.id !== toast.id))}
            aria-label="Dismiss notification"
            className="ml-1 rounded-lg p-0.5 text-slate-400 hover:bg-slate-100 hover:text-ink-950 dark:hover:bg-slate-800 dark:hover:text-white"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ))}
    </div>
  )
}
