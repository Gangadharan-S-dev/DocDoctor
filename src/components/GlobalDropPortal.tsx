import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { CloudUpload, File as FileIcon, X, ArrowRight, Sparkles } from 'lucide-react'
import { categoryById, formatSize } from '../data/tools'
import { suggestToolsForFile } from '../lib/smartSuggest'

export default function GlobalDropPortal() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [dragging, setDragging] = useState(false)
  const [droppedFile, setDroppedFile] = useState<File | null>(null)
  const dragDepth = useRef(0)

  // Skip on tool pages so each tool's own UploadArea & drag-to-reorder stay untouched.
  const disabled = pathname.startsWith('/tool/')

  useEffect(() => {
    if (disabled) return

    const hasFiles = (e: DragEvent) =>
      Array.from(e.dataTransfer?.types ?? []).includes('Files')

    const onDragEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      dragDepth.current += 1
      setDragging(true)
    }
    const onDragOver = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
    }
    const onDragLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setDragging(false)
    }
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return
      e.preventDefault()
      dragDepth.current = 0
      setDragging(false)
      const file = e.dataTransfer?.files?.[0]
      if (file) setDroppedFile(file)
    }

    window.addEventListener('dragenter', onDragEnter)
    window.addEventListener('dragover', onDragOver)
    window.addEventListener('dragleave', onDragLeave)
    window.addEventListener('drop', onDrop)
    return () => {
      window.removeEventListener('dragenter', onDragEnter)
      window.removeEventListener('dragover', onDragOver)
      window.removeEventListener('dragleave', onDragLeave)
      window.removeEventListener('drop', onDrop)
    }
  }, [disabled])

  useEffect(() => {
    if (!droppedFile) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDroppedFile(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [droppedFile])

  const suggestions = useMemo(
    () => (droppedFile ? suggestToolsForFile(droppedFile) : []),
    [droppedFile],
  )

  if (disabled) return null

  return (
    <>
      {/* Full-screen frosted drop portal while dragging a file */}
      {dragging && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-6 backdrop-blur-md"
        >
          <div className="animate-bento-pop flex max-w-md flex-col items-center rounded-[2rem] border-2 border-dashed border-blue-400 bg-white/95 px-10 py-12 text-center shadow-2xl dark:bg-[#0e1525]/95">
            <span className="brand-grad flex h-16 w-16 items-center justify-center rounded-2xl text-white shadow-lg">
              <CloudUpload className="h-8 w-8" />
            </span>
            <p className="mt-4 font-display text-2xl font-extrabold text-ink-950 dark:text-white">
              Drop anywhere to launch
            </p>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              DocDoctor will inspect your file locally and suggest the best 1-click tools.
            </p>
          </div>
        </div>
      )}

      {/* Action modal after dropping a file */}
      {droppedFile && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Choose a tool for your dropped file"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-md"
          onClick={() => setDroppedFile(null)}
        >
          <div
            className="animate-bento-pop w-full max-w-xl overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-2xl backdrop-blur-xl dark:border-slate-700/80 dark:bg-[#0e1525]/95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="brand-grad flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm">
                  <FileIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <span className="inline-flex items-center gap-1 text-[11px] font-extrabold uppercase tracking-wider text-accent">
                    <Sparkles className="h-3 w-3" /> File ready in memory
                  </span>
                  <p className="truncate font-display text-base font-extrabold text-ink-950 dark:text-white">
                    {droppedFile.name}
                  </p>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {formatSize(droppedFile.size)} · Pick a tool to open pre-loaded
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDroppedFile(null)}
                aria-label="Close"
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-ink-950 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
              {suggestions.map((tool) => {
                const c = categoryById(tool.category)
                return (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => {
                      const f = droppedFile
                      setDroppedFile(null)
                      navigate(`/tool/${tool.id}`, { state: { chainedFiles: [f] } })
                    }}
                    className="group flex items-center gap-3 rounded-2xl border border-slate-200/80 bg-white p-3.5 text-left transition hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-card dark:border-slate-800 dark:bg-[#131d33] dark:hover:border-slate-600"
                  >
                    <span
                      className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl transition group-hover:scale-105"
                      style={{ backgroundColor: `${c.color}18`, color: c.color }}
                    >
                      <tool.icon className="h-5 w-5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-sm font-bold text-ink-950 dark:text-white">
                        {tool.name}
                      </span>
                      <span className="block truncate text-[11px] text-slate-500 dark:text-slate-400">
                        {c.name}
                      </span>
                    </span>
                    <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-accent" />
                  </button>
                )
              })}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
