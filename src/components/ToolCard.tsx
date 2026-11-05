import { Link } from 'react-router-dom'
import { ArrowRight, Star } from 'lucide-react'
import type { Tool } from '../data/tools'
import { categoryById, isImplemented } from '../data/tools'

export default function ToolCard({ tool }: { tool: Tool }) {
  const cat = categoryById(tool.category)
  const Icon = tool.icon
  return (
    <Link to={`/tool/${tool.id}`} className="card group flex flex-col p-5 transition hover:-translate-y-0.5 hover:shadow-lift">
      <span className="mb-4 flex h-11 w-11 items-center justify-center rounded-xl" style={{ background: cat.soft, color: cat.color }}>
        <Icon className="h-5 w-5" aria-hidden />
      </span>
      <span className="flex items-center gap-2">
        <span className="font-display text-[15px] font-bold text-ink-950">{tool.name}</span>
        {tool.popular && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-amber-700"><Star className="h-3 w-3 fill-amber-500 text-amber-500" /> Popular</span>}
      </span>
      <span className="mt-1.5 line-clamp-2 flex-1 text-sm leading-relaxed text-slate-500">{tool.description}</span>
      <span className="mt-4 flex items-center justify-between">
        <span className="flex items-center gap-2 text-[11px] font-bold uppercase tracking-wide text-slate-400">
          {tool.acceptLabel} · ≤{tool.maxSizeMB} MB
          {isImplemented(tool) && <span className="inline-flex items-center gap-1 rounded-full bg-teal-50 px-2 py-0.5 text-[10px] font-extrabold normal-case tracking-normal text-teal-700 ring-1 ring-teal-200"><span className="h-1.5 w-1.5 rounded-full bg-teal-500" /> Live</span>}
        </span>
        <span className="inline-flex items-center gap-1 text-sm font-bold text-accent">Open <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" /></span>
      </span>
    </Link>
  )
}
