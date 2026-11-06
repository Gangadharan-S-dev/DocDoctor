import { useCallback, useRef, useState } from 'react'
import { CloudUpload, FileUp, X, FileWarning, Trash2 } from 'lucide-react'
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

  const add = useCallback((list: FileList | File[]) => {
    const arr = Array.from(list)
    if (!arr.length) return
    const { ok, errors: errs } = validateFiles(arr, tool, files.length)
    setErrors(errs)
    if (ok.length) onChange([...files, ...ok.map((file) => ({ file, id: `${file.name}-${file.size}-${Math.random().toString(36).slice(2, 8)}` }))])
  }, [tool, files, onChange])

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
        <p className="mt-1 text-sm text-slate-500">or browse from your device · Max {tool.maxSizeMB} MB{tool.multiple ? ' · Multiple files supported' : ''}</p>
        <span className="btn-accent mt-5"><FileUp className="h-4 w-4" /> Browse files</span>
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
            <p className="text-sm font-bold text-ink-950">{files.length} file{files.length > 1 ? 's' : ''} ready</p>
            <button type="button" onClick={() => { onChange([]); setErrors([]) }} className="inline-flex items-center gap-1 text-xs font-bold text-red-600 hover:underline"><Trash2 className="h-3.5 w-3.5" /> Clear all</button>
          </div>
          <ul className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white">
            {files.map(({ file, id }) => (
              <li key={id} className="flex items-center gap-3 px-4 py-3">
                <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-slate-100 text-[10px] font-extrabold uppercase text-slate-500">{(file.name.split('.').pop() ?? 'file').slice(0, 4)}</span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-bold text-ink-950">{file.name}</span>
                  <span className="text-xs text-slate-500">{formatSize(file.size)}</span>
                </span>
                <button type="button" aria-label={`Remove ${file.name}`} onClick={() => onChange(files.filter((f) => f.id !== id))} className="rounded-lg p-2 text-slate-400 hover:bg-red-50 hover:text-red-600"><X className="h-4 w-4" /></button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
