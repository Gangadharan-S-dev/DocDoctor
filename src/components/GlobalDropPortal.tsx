import { useEffect, useMemo, useRef, useState } from 'react'
import { useLocation, useNavigate } from 'react-router'
import { CloudUpload, File as FileIcon, Files, X, ArrowRight, Sparkles } from 'lucide-react'
import { categoryById, formatSize } from '../data/tools'
import { suggestToolsForFiles } from '../lib/smartSuggest'

export default function GlobalDropPortal() {
  const { pathname } = useLocation()
  const navigate = useNavigate()
  const [dragging, setDragging] = useState(false)
  const [droppedFiles, setDroppedFiles] = useState<File[]>([])
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
      const list = Array.from(e.dataTransfer?.files ?? [])
      if (list.length) setDroppedFiles(list)
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
    if (droppedFiles.length === 0) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDroppedFiles([])
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [droppedFiles.length])

  const { tools: suggestions, batchLabel } = useMemo(
    () => suggestToolsForFiles(droppedFiles),
    [droppedFiles],
  )

  const totalSize = useMemo(
    () => droppedFiles.reduce((acc, f) => acc + f.size, 0),
    [droppedFiles],
  )

  if (disabled) return null

  return (
    <>
      {/* Full-screen frosted drop portal while dragging files */}
      {dragging && (
        <div
          aria-hidden
          className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center bg-slate-950/55 p-6 backdrop-blur-md"
        >
          <div className="animate-bento-pop flex max-w-md flex-col items-center rounded-[2rem] border-2 border-dashed border-blue-400 bg-white/95 px-10 py-12 text-center shadow-2xl dark:bg-[#0d1425]/95">
            <span className="brand-grad flex h-16 w-16 items-center justify-center rounded-2xl text-white shadow-lg">
              <CloudUpload className="h-8 w-8" />
            </span>
            <p className="mt-4 font-display text-2xl font-extrabold text-ink-950 dark:text-white">
              Drop 1 or more files to launch
            </p>
            <p className="mt-1.5 text-sm text-slate-500 dark:text-slate-400">
              DocDoctor inspects your files locally and detects single or batch workflows automatically.
            </p>
          </div>
        </div>
      )}

      {/* Action modal after dropping files */}
      {droppedFiles.length > 0 && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Choose a tool for your dropped files"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-md"
          onClick={() => setDroppedFiles([])}
        >
          <div
            className="animate-bento-pop w-full max-w-xl overflow-hidden rounded-3xl border border-slate-200/80 bg-white/95 p-6 shadow-2xl dark:border-slate-700/80 dark:bg-[#0d1425]/95"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-3">
                <span className="brand-grad flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-white shadow-sm">
                  {droppedFiles.length > 1 ? <Files className="h-5 w-5" /> : <FileIcon className="h-5 w-5" />}
                </span>
                <div className="min-w-0">
                  <span className="inline-flex items-center gap-1 font-mono text-[10px] font-extrabold uppercase tracking-wider text-accent">
                    <Sparkles className="h-3 w-3" /> {batchLabel || 'Ready in memory'}
                  </span>
                  <p className="truncate font-display text-base font-extrabold text-ink-950 dark:text-white">
                    {droppedFiles.length === 1
                      ? droppedFiles[0].name
                      : `${droppedFiles[0].name} + ${droppedFiles.length - 1} more`}
                  </p>
                  <p className="text-xs font-semibold text-slate-500 dark:text-slate-400">
                    {formatSize(totalSize)} · Pick a tool to open pre-loaded
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDroppedFiles([])}
                aria-label="Close"
                className="rounded-xl p-1.5 text-slate-400 hover:bg-slate-100 hover:text-ink-950 dark:hover:bg-slate-800 dark:hover:text-white"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="mt-5 grid gap-2.5 sm:grid-cols-2">
              {suggestions.map((tool) => {
                const c = categoryById(tool.category)
                const filesToPass = tool.multiple ? droppedFiles : droppedFiles.slice(0, 1)
                return (
                  <button
                    key={tool.id}
                    type="button"
                    onClick={() => {
                      setDroppedFiles([])
                      navigate(`/tool/${tool.id}`, { state: { chainedFiles: filesToPass } })
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
                        {filesToPass.length > 1 ? `Open with ${filesToPass.length} files` : c.name}
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
