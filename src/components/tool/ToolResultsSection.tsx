import { Suspense, lazy } from 'react'
import { useNavigate } from 'react-router'
import {
  ArrowRight, Check, Copy, Download, Eye, FileCheck2, FolderDown,
  RotateCcw, Share2, SplitSquareVertical, Workflow, ZoomIn,
} from 'lucide-react'
import { categoryById, formatSize, toolById, type Tool } from '../../data/tools'
import { downloadBlob, downloadZip, type OutputFile } from '../../processing/download'
import { SavingsGauge, StudioSkeleton } from '../StudioControls'
import { BorderBeam } from '../FuturisticPrimitives'
import { showToast } from '../../lib/toast'

const BeforeAfterSlider = lazy(() => import('../BeforeAfterSlider'))

export interface ToolResultsSectionProps {
  tool: Tool
  results: OutputFile[]
  displayedResults: OutputFile[]
  totalIn: number
  totalOut: number
  savings: number | null
  compareInUrl: string | null
  compareInFile: File | undefined
  outUrls: (string | null)[]
  outPdfUrls: (string | null)[]
  safeCompareIdx: number
  setCompareIdx: (idx: number) => void
  imgCompareMode: 'slider' | 'side'
  setImgCompareMode: (mode: 'slider' | 'side') => void
  previewText: string
  htmlLivePreview: boolean
  setHtmlLivePreview: (v: boolean) => void
  zipSearch: string
  setZipSearch: (v: string) => void
  batchNamePattern: string
  setBatchNamePattern: (v: string | ((prev: string) => string)) => void
  resolveOutputName: (r: OutputFile, idx: number) => string
  setCustomNames: React.Dispatch<React.SetStateAction<Record<number, string>>>
  setLightboxIdx: (idx: number) => void
  copyImage: (blob: Blob, idx: number) => void
  copiedIdx: number | null
  setPdfPreviewUrl: (url: string | null) => void
  onResetFiles: () => void
  pipelineHistory: string[]
}

const canNativeShare =
  typeof navigator !== 'undefined' &&
  typeof navigator.share === 'function' &&
  typeof navigator.canShare === 'function'

export default function ToolResultsSection({
  tool,
  results,
  displayedResults,
  totalIn,
  totalOut,
  savings,
  compareInUrl,
  compareInFile,
  outUrls,
  outPdfUrls,
  safeCompareIdx,
  setCompareIdx,
  imgCompareMode,
  setImgCompareMode,
  previewText,
  htmlLivePreview,
  setHtmlLivePreview,
  zipSearch,
  setZipSearch,
  batchNamePattern,
  setBatchNamePattern,
  resolveOutputName,
  setCustomNames,
  setLightboxIdx,
  copyImage,
  copiedIdx,
  setPdfPreviewUrl,
  onResetFiles,
  pipelineHistory,
}: ToolResultsSectionProps) {
  const navigate = useNavigate()

  const shareOutputFile = async (blob: Blob, name: string) => {
    try {
      const file = new File([blob], name, { type: blob.type || 'application/octet-stream' })
      if (!navigator.canShare?.({ files: [file] })) {
        showToast('Your browser does not support sharing this file type', 'info')
        return
      }
      await navigator.share({ files: [file], title: name })
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') {
        showToast('Share cancelled or unavailable', 'info')
      }
    }
  }

  return (
    <div
      className="animate-bento-pop relative mt-6 overflow-hidden rounded-3xl border border-teal-200/90 bg-gradient-to-br from-teal-50/80 via-white to-emerald-50/50 p-5 shadow-card dark:border-teal-500/35 dark:from-teal-500/12 dark:via-[#0d1425] dark:to-emerald-500/10 sm:p-6"
      role="status"
    >
      <BorderBeam color="#14b8a6" durationSec={8} />
      <div className="relative z-10 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-teal-600 text-white shadow-sm">
            <FileCheck2 className="h-5 w-5" />
          </span>
          <div>
            <p className="font-display text-base font-extrabold text-ink-950 dark:text-white">
              Done — {results.length} file{results.length > 1 ? 's' : ''} ready
            </p>
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300">
              {formatSize(totalIn)} → <strong className="text-ink-950 dark:text-white">{formatSize(totalOut)}</strong>
              {savings !== null && savings <= 0 && (
                <span className="ml-2 font-semibold text-slate-500 dark:text-slate-400">
                  {tool.id.startsWith('compress-')
                    ? '(Already at optimal compression — preserved at original size)'
                    : '(no size reduction for this file/settings)'}
                </span>
              )}
            </p>
          </div>
        </div>
        {savings !== null && savings > 0 && (
          <SavingsGauge savingsPct={savings} totalIn={totalIn} totalOut={totalOut} />
        )}
      </div>

      {/* Visual size-savings bar */}
      {savings !== null && savings > 0 && (
        <div className="mt-4">
          <div className="h-2.5 w-full overflow-hidden rounded-full bg-slate-200/80 dark:bg-slate-800">
            <div
              className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-400 transition-all duration-500"
              style={{ width: `${Math.max(4, Math.min(100, 100 - savings))}%` }}
            />
          </div>
          <div className="mt-1.5 flex items-center justify-between text-[11px] font-bold text-slate-500 dark:text-slate-400">
            <span>Output: {formatSize(totalOut)} ({Math.max(1, 100 - savings)}% of original)</span>
            <span className="text-teal-700 dark:text-teal-300">−{formatSize(Math.max(0, totalIn - totalOut))} smaller</span>
          </div>
        </div>
      )}

      {/* Interactive Before/After image comparison */}
      {compareInUrl && outUrls[safeCompareIdx] && (
        <div className="mt-4 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-500">Visual Quality Comparison</span>
              {results.length > 1 && outUrls.some(Boolean) && (
                <select
                  value={safeCompareIdx}
                  onChange={(e) => setCompareIdx(+e.target.value)}
                  aria-label="Select image to compare"
                  className="rounded-lg border border-slate-200 bg-white px-2 py-0.5 text-xs font-bold text-ink-950"
                >
                  {results.map((r, idx) => (
                    <option key={idx} value={idx}>
                      #{idx + 1} — {r.name}
                    </option>
                  ))}
                </select>
              )}
            </div>
            <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-bold shadow-sm dark:border-slate-700 dark:bg-[#111a2e]">
              <button
                type="button"
                onClick={() => setImgCompareMode('slider')}
                className={`flex items-center gap-1 rounded px-2.5 py-1 ${imgCompareMode === 'slider' ? 'bg-accent text-white shadow-sm' : 'text-slate-600 hover:text-ink-950 dark:text-slate-300'}`}
              >
                <SplitSquareVertical className="h-3.5 w-3.5" /> Slider
              </button>
              <button
                type="button"
                onClick={() => setImgCompareMode('side')}
                className={`flex items-center gap-1 rounded px-2.5 py-1 ${imgCompareMode === 'side' ? 'bg-accent text-white shadow-sm' : 'text-slate-600 hover:text-ink-950 dark:text-slate-300'}`}
              >
                Side by Side
              </button>
            </div>
          </div>

          {imgCompareMode === 'slider' ? (
            <Suspense fallback={<StudioSkeleton />}>
              <BeforeAfterSlider
                originalUrl={compareInUrl}
                processedUrl={outUrls[safeCompareIdx]!}
                originalLabel={`Original · ${formatSize(compareInFile?.size ?? totalIn)}`}
                processedLabel={`Processed · ${formatSize(results[safeCompareIdx]?.blob.size ?? totalOut)}`}
              />
            </Suspense>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <figure>
                <img src={compareInUrl} alt="Original" className="max-h-56 w-full rounded-xl bg-white object-contain ring-1 ring-slate-200 dark:bg-[#0d1425] dark:ring-slate-700" />
                <figcaption className="mt-1 text-center text-xs font-bold text-slate-500">Original · {formatSize(compareInFile?.size ?? totalIn)}</figcaption>
              </figure>
              <figure>
                <img src={outUrls[safeCompareIdx]!} alt="Processed" className="max-h-56 w-full rounded-xl bg-white object-contain ring-1 ring-slate-200 dark:bg-[#0d1425] dark:ring-slate-700" />
                <figcaption className="mt-1 text-center text-xs font-bold text-slate-500">Processed · {formatSize(results[safeCompareIdx]?.blob.size ?? totalOut)}</figcaption>
              </figure>
            </div>
          )}
        </div>
      )}

      {previewText && (
        <figure className="mt-4">
          <div className="mb-1.5 flex items-center justify-between">
            <figcaption className="text-xs font-extrabold uppercase tracking-wide text-slate-400">Preview — {results[0].name}</figcaption>
            {results[0]?.name.toLowerCase().endsWith('.html') && (
              <div className="flex items-center rounded-lg border border-slate-200 bg-white p-0.5 text-xs font-bold shadow-sm">
                <button
                  type="button"
                  onClick={() => setHtmlLivePreview(true)}
                  className={`rounded px-2.5 py-0.5 ${htmlLivePreview ? 'bg-accent text-white' : 'text-slate-600 hover:text-ink-950'}`}
                >
                  Rendered HTML
                </button>
                <button
                  type="button"
                  onClick={() => setHtmlLivePreview(false)}
                  className={`rounded px-2.5 py-0.5 ${!htmlLivePreview ? 'bg-accent text-white' : 'text-slate-600 hover:text-ink-950'}`}
                >
                  Source Code
                </button>
              </div>
            )}
          </div>
          {results[0]?.name.toLowerCase().endsWith('.html') && htmlLivePreview ? (
            <iframe
              srcDoc={previewText}
              sandbox=""
              title="Rendered HTML Preview"
              className="h-72 w-full rounded-xl border border-slate-200 bg-white shadow-inner"
            />
          ) : (
            <pre className="max-h-64 overflow-auto rounded-xl bg-ink-950 p-4 text-xs leading-relaxed text-slate-100">{previewText}</pre>
          )}
        </figure>
      )}

      {results.length > 5 && (
        <div className="mt-4">
          <input
            type="text"
            value={zipSearch}
            onChange={(e) => setZipSearch(e.target.value)}
            placeholder="Filter results by filename…"
            className="input !py-1.5 text-xs"
          />
        </div>
      )}

      {results.length > 1 && results.some((r) => r.blob.type.startsWith('image/')) && (
        <div className="mt-4 space-y-2 rounded-xl border border-teal-200 bg-white/80 p-3 dark:border-teal-500/30 dark:bg-[#0d1425]/80">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs font-extrabold uppercase tracking-wide text-slate-500">
              Batch Output Naming Pattern
            </span>
            <div className="flex flex-wrap items-center gap-1 text-[11px] font-semibold text-slate-500">
              <span>Tokens:</span>
              {['{name}', '{n}', '{w}', '{h}', '{ext}', '{date}'].map((tok) => (
                <button
                  key={tok}
                  type="button"
                  onClick={() => setBatchNamePattern((p) => (p ? `${p}-${tok}` : `{name}-${tok}`))}
                  className="rounded bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] font-bold text-ink-950 hover:bg-accent/10 hover:text-accent dark:bg-slate-800 dark:text-slate-200"
                >
                  {tok}
                </button>
              ))}
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <input
              type="text"
              value={batchNamePattern}
              onChange={(e) => setBatchNamePattern(e.target.value)}
              placeholder="e.g. {name}-{w}x{h}-{n}.{ext} or photo-{date}-{n}"
              aria-label="Batch output naming pattern"
              className="input flex-1 !py-1.5 font-mono text-xs"
            />
            {batchNamePattern && (
              <button
                type="button"
                onClick={() => setBatchNamePattern('')}
                className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-50 dark:border-slate-700 dark:bg-[#111a2e] dark:text-slate-300"
              >
                Reset
              </button>
            )}
          </div>
        </div>
      )}

      <ul className="mt-4 space-y-2">
        {displayedResults.map((r, i) => {
          const displayName = resolveOutputName(r, i)
          const isPdf = r.blob.type === 'application/pdf' || r.name.toLowerCase().endsWith('.pdf')
          const isImage = r.blob.type.startsWith('image/')
          return (
            <li key={r.name + i} className="flex flex-wrap items-center gap-3 rounded-2xl bg-white/95 px-4 py-3 shadow-xs ring-1 ring-slate-200/80 transition hover:ring-accent/35 dark:bg-[#0d1425]/95 dark:ring-slate-700/80">
              {outUrls[i] && (
                <button
                  type="button"
                  onClick={() => setLightboxIdx(i)}
                  title="Click to inspect fullscreen"
                  className="group relative h-11 w-11 shrink-0 overflow-hidden rounded-xl ring-1 ring-slate-200 dark:ring-slate-700"
                >
                  <img src={outUrls[i]!} alt="" className="h-full w-full object-cover transition group-hover:scale-105" />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/40 opacity-0 transition group-hover:opacity-100">
                    <ZoomIn className="h-4 w-4 text-white" />
                  </span>
                </button>
              )}
              <div className="min-w-0 flex-1">
                <input
                  type="text"
                  value={displayName}
                  onChange={(e) => setCustomNames((prev) => ({ ...prev, [i]: e.target.value }))}
                  title="Click to rename before download"
                  className="w-full truncate rounded-lg border border-transparent bg-transparent px-1.5 py-0.5 text-sm font-bold text-ink-950 transition hover:border-slate-300 focus:border-accent focus:bg-white dark:text-white dark:hover:border-slate-600 dark:focus:bg-[#131d33]"
                />
                <span className="block px-1.5 font-mono text-[11px] font-semibold text-slate-500 dark:text-slate-400">{formatSize(r.blob.size)}</span>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                {isImage && outUrls[i] && (
                  <button
                    type="button"
                    onClick={() => setLightboxIdx(i)}
                    title="Inspect image fullscreen with zoom"
                    className="btn-ghost !px-3 !py-2 text-xs"
                  >
                    <ZoomIn className="h-4 w-4" /> Inspect
                  </button>
                )}
                {isImage && (
                  <button
                    type="button"
                    onClick={() => copyImage(r.blob, i)}
                    title="Copy image to clipboard"
                    className="btn-ghost !px-3 !py-2 text-xs"
                  >
                    {copiedIdx === i ? <><Check className="h-4 w-4 text-emerald-600" /> Copied</> : <><Copy className="h-4 w-4" /> Copy</>}
                  </button>
                )}
                {isPdf && outPdfUrls[i] && (
                  <button
                    type="button"
                    onClick={() => setPdfPreviewUrl(outPdfUrls[i])}
                    title="Quick preview PDF in browser"
                    className="btn-ghost !px-3 !py-2 text-xs"
                  >
                    <Eye className="h-4 w-4" /> Preview
                  </button>
                )}
                {canNativeShare && (
                  <button
                    type="button"
                    onClick={() => shareOutputFile(r.blob, displayName)}
                    title="Share file via OS share sheet"
                    className="btn-ghost !px-3 !py-2 text-xs"
                  >
                    <Share2 className="h-4 w-4" /> Share
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => downloadBlob(r.blob, displayName)}
                  className="btn-accent btn-shimmer !rounded-xl !px-3.5 !py-2 text-xs"
                >
                  <Download className="h-4 w-4" /> Download
                </button>
              </div>
            </li>
          )
        })}
      </ul>

      <div className="mt-4 flex flex-wrap gap-2.5">
        {results.length > 1 && (
          <button
            type="button"
            onClick={() => {
              const renamed = results.map((r, i) => ({ ...r, name: resolveOutputName(r, i) }))
              downloadZip(renamed, `${tool.id}-results.zip`)
            }}
            className="btn-accent btn-shimmer !py-2.5"
          >
            <FolderDown className="h-4 w-4" /> Download all as ZIP
          </button>
        )}
        <button type="button" onClick={onResetFiles} className="btn-ghost !py-2.5">
          <RotateCcw className="h-4 w-4" /> Start another
        </button>
      </div>

      {(() => {
        const firstOut = results[0]
        if (!firstOut) return null
        const ext = (firstOut.name.match(/(\.[^.]+)$/)?.[1] ?? '').toLowerCase()
        const nextToolIds =
          ext === '.pdf'
            ? ['compress-pdf', 'protect-pdf', 'sign-pdf', 'pdf-watermark', 'pdf-page-numbers', 'pdf-to-word']
            : ext === '.jpg' || ext === '.jpeg' || ext === '.png' || ext === '.webp' || ext === '.avif'
              ? ['compress-image', 'compress-image-kb', 'resize-image', 'image-watermark', 'image-to-pdf', 'webp-converter']
              : ext === '.docx'
                ? ['word-to-pdf', 'compress-docx', 'edit-word', 'word-to-html']
                : ext === '.xlsx'
                  ? ['excel-to-pdf', 'excel-to-csv', 'compress-excel', 'remove-worksheets']
                  : ext === '.csv'
                    ? ['csv-tools', 'csv-to-excel', 'csv-to-json']
                    : ext === '.json'
                      ? ['json-formatter', 'json-to-csv', 'json-to-xml']
                      : []
        const nextTools = nextToolIds
          .filter((id) => id !== tool.id)
          .map((id) => toolById(id))
          .filter((nt): nt is Tool => Boolean(nt))
          .slice(0, 4)
        if (!nextTools.length) return null
        return (
          <div className="mt-5 border-t border-teal-200/80 pt-4 dark:border-teal-500/25">
            <span className="mb-2.5 flex items-center gap-1.5 font-mono text-[10px] font-extrabold uppercase tracking-widest text-teal-800 dark:text-teal-300">
              <Workflow className="h-3.5 w-3.5" /> Chain Output Directly Into Next Tool
            </span>
            <div className="grid gap-2 sm:grid-cols-2">
              {nextTools.map((nt) => {
                const nc = categoryById(nt.category)
                return (
                  <button
                    key={nt.id}
                    type="button"
                    onClick={() => {
                      const toPass = (nt.multiple ? results : results.slice(0, 1)).map(
                        (r, idx) => new File([r.blob], resolveOutputName(r, idx), { type: r.blob.type }),
                      )
                      navigate(`/tool/${nt.id}`, {
                        state: {
                          chainedFiles: toPass,
                          pipelineHistory: [...pipelineHistory, tool.name],
                        },
                      })
                    }}
                    className="group flex items-center gap-2.5 rounded-2xl border border-teal-200/80 bg-white/95 px-3 py-2.5 text-left text-xs font-bold text-ink-950 shadow-2xs transition hover:-translate-y-0.5 hover:border-accent hover:shadow-card dark:border-slate-700/80 dark:bg-[#111a2e] dark:text-white dark:hover:border-accent"
                  >
                    <span
                      className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl transition group-hover:scale-105"
                      style={{ backgroundColor: `${nc.color}18`, color: nc.color }}
                    >
                      <nt.icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-display text-xs font-extrabold">{nt.name}</span>
                      <span className="block truncate text-[10px] font-semibold text-slate-400">Pass output directly →</span>
                    </span>
                    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-slate-300 transition group-hover:translate-x-0.5 group-hover:text-accent" />
                  </button>
                )
              })}
            </div>
          </div>
        )
      })()}
    </div>
  )
}
