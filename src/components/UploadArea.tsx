import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { CloudUpload, FileUp, X, FileWarning, Trash2, Clipboard, ArrowUp, ArrowDown, GripVertical, FileText } from 'lucide-react'
import type { Tool } from '../data/tools'
import { formatSize } from '../data/tools'
import { validateFiles, type PickedFile } from '../lib/files'

export type { PickedFile }

export default function UploadArea({ tool, files, onChange }: {
  tool: Tool
  files: PickedFile[]
  onChange: (f: PickedFile[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [drag, setDrag] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  const add = useCallback((list: FileList | File[]) => {
    const arr = Array.from(list)
    if (!arr.length) return
    const { ok, errors: errs } = validateFiles(arr, tool, files.length)
    setErrors(errs)
    if (ok.length) onChange([...files, ...ok.map((file) => ({ file, id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}` }))])
  }, [tool, files, onChange])

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) {
        return
      }
      const clipboard = e.clipboardData
      if (!clipboard) return

      const pastedFiles: File[] = []
      if (clipboard.files && clipboard.files.length > 0) {
        for (let i = 0; i < clipboard.files.length; i++) {
          pastedFiles.push(clipboard.files[i])
        }
      } else if (clipboard.items && clipboard.items.length > 0) {
        for (let i = 0; i < clipboard.items.length; i++) {
          const item = clipboard.items[i]
          if (item.kind === 'file') {
            const f = item.getAsFile()
            if (f) {
              const ext = f.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
              const named = f.name && f.name !== 'image.png' ? f : new File([f], `pasted-${Date.now()}.${ext}`, { type: f.type || 'image/png' })
              pastedFiles.push(named)
            }
          }
        }
      }

      if (pastedFiles.length > 0) {
        e.preventDefault()
        add(pastedFiles)
      }
    }

    window.addEventListener('paste', handlePaste)
    return () => window.removeEventListener('paste', handlePaste)
  }, [add])

  // Generate thumbnail URLs for images
  const thumbUrls = useMemo(() => {
    const map = new Map<string, string>()
    for (const f of files) {
      if (f.file.type.startsWith('image/')) {
        map.set(f.id, URL.createObjectURL(f.file))
      }
    }
    return map
  }, [files])

  useEffect(() => {
    return () => {
      thumbUrls.forEach((url) => URL.revokeObjectURL(url))
    }
  }, [thumbUrls])

  const moveFile = (from: number, to: number) => {
    if (to < 0 || to >= files.length || from === to) return
    const next = [...files]
    const [item] = next.splice(from, 1)
    next.splice(to, 0, item)
    onChange(next)
  }

  const handleDragStart = (idx: number) => {
    setDraggedIdx(idx)
  }

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    if (dragOverIdx !== idx) setDragOverIdx(idx)
  }

  const handleDrop = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault()
    if (draggedIdx !== null && draggedIdx !== targetIdx) {
      moveFile(draggedIdx, targetIdx)
    }
    setDraggedIdx(null)
    setDragOverIdx(null)
  }

  return (
    <div>
      <div
        role="button" tabIndex={0} aria-label={`Upload ${tool.acceptLabel} files`}
        onClick={() => inputRef.current?.click()}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click() } }}
        onDragOver={(e) => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files) }}
        className={`cursor-pointer rounded-2xl border-2 border-dashed px-6 py-10 text-center transition sm:py-14 ${drag ? 'border-accent bg-accent-soft' : 'border-slate-300 bg-slate-50/60 hover:border-accent/60 hover:bg-accent-soft/50'}`}
      >
        <span className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-ink-950 text-white">
          <CloudUpload className="h-7 w-7" aria-hidden />
        </span>
        <p className="font-display text-lg font-bold text-ink-950">Drag &amp; drop your {tool.acceptLabel} file{tool.multiple ? 's' : ''} here</p>
        <p className="mt-1 text-sm text-slate-500">
          or browse from your device · paste with <kbd className="rounded bg-slate-200/80 px-1.5 py-0.5 text-xs font-semibold text-slate-700">Ctrl+V</kbd> · Max {tool.maxSizeMB} MB{tool.multiple ? ' · Multiple files supported' : ''}
        </p>
        <div className="mt-5 flex flex-wrap items-center justify-center gap-3">
          <span className="btn-accent"><FileUp className="h-4 w-4" /> Browse files</span>
          <span className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white px-3 py-2 text-xs font-bold text-slate-600 shadow-sm">
            <Clipboard className="h-3.5 w-3.5 text-accent" /> Paste supported
          </span>
        </div>
        <input ref={inputRef} type="file" className="hidden" accept={tool.accept === '*' ? undefined : tool.accept} multiple={tool.multiple} onChange={(e) => { if (e.target.files) add(e.target.files); e.target.value = '' }} />
      </div>

      {errors.length > 0 && (
        <div role="alert" className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {errors.map((e, i) => <p key={i} className="flex items-start gap-2"><FileWarning className="mt-0.5 h-4 w-4 shrink-0" />{e}</p>)}
        </div>
      )}

      {files.length > 0 && (
        <div className="mt-5">
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <p className="text-sm font-bold text-ink-950">{files.length} file{files.length > 1 ? 's' : ''} ready</p>
              {tool.multiple && files.length > 1 && (
                <span className="text-xs text-slate-500 font-medium">· Drag or use arrows to reorder merge sequence</span>
              )}
            </div>
            <button type="button" onClick={() => { onChange([]); setErrors([]) }} className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:underline"><Trash2 className="h-3.5 w-3.5" /> Clear all</button>
          </div>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
            {files.map(({ file, id }, idx) => {
              const imgThumb = thumbUrls.get(id)
              const ext = (file.name.split('.').pop() ?? 'file').toLowerCase()
              const isPdf = ext === 'pdf'
              const isDragging = draggedIdx === idx
              const isOver = dragOverIdx === idx && draggedIdx !== idx

              return (
                <li
                  key={id}
                  draggable={tool.multiple && files.length > 1}
                  onDragStart={() => handleDragStart(idx)}
                  onDragOver={(e) => handleDragOver(e, idx)}
                  onDragLeave={() => setDragOverIdx(null)}
                  onDrop={(e) => handleDrop(e, idx)}
                  onDragEnd={() => { setDraggedIdx(null); setDragOverIdx(null) }}
                  className={`flex items-center gap-3 px-4 py-2.5 transition ${isDragging ? 'opacity-30 bg-slate-100' : ''} ${isOver ? 'bg-accent/10 border-t-2 border-accent' : 'hover:bg-slate-50/70'}`}
                >
                  {tool.multiple && files.length > 1 && (
                    <div className="flex items-center gap-1 text-slate-400">
                      <GripVertical className="h-4 w-4 cursor-grab active:cursor-grabbing text-slate-400 hover:text-slate-600" />
                      <span className="w-5 text-center text-xs font-extrabold text-slate-400">{idx + 1}</span>
                    </div>
                  )}

                  {imgThumb ? (
                    <img src={imgThumb} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-slate-200" />
                  ) : isPdf ? (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-red-50 text-red-600 ring-1 ring-red-200">
                      <FileText className="h-5 w-5" />
                    </span>
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-extrabold uppercase text-slate-500">
                      {ext.slice(0, 4)}
                    </span>
                  )}

                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-bold text-ink-950" title={file.name}>{file.name}</span>
                    <span className="text-xs text-slate-500">{formatSize(file.size)}</span>
                  </span>

                  {tool.multiple && files.length > 1 && (
                    <div className="flex items-center gap-0.5">
                      <button
                        type="button"
                        aria-label={`Move ${file.name} up`}
                        disabled={idx === 0}
                        onClick={() => moveFile(idx, idx - 1)}
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-20"
                      >
                        <ArrowUp className="h-3.5 w-3.5" />
                      </button>
                      <button
                        type="button"
                        aria-label={`Move ${file.name} down`}
                        disabled={idx === files.length - 1}
                        onClick={() => moveFile(idx, idx + 1)}
                        className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-20"
                      >
                        <ArrowDown className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  )}

                  <button
                    type="button"
                    aria-label={`Remove ${file.name}`}
                    onClick={() => onChange(files.filter((f) => f.id !== id))}
                    className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
