import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router'
import { ArrowUpRight, Star } from 'lucide-react'
import type { Tool } from '../data/tools'
import { categoryById } from '../data/tools'
import { isFavorite, onPrefsChange, toggleFavorite } from '../lib/prefs'
import { showToast } from '../lib/toast'

export default function ToolCard({ tool }: { tool: Tool }) {
  const cat = categoryById(tool.category)
  const Icon = tool.icon
  const cardRef = useRef<HTMLAnchorElement>(null)
  const rafRef = useRef<number>(0)
  const [fav, setFav] = useState(() => isFavorite(tool.id))

  useEffect(() => onPrefsChange(() => setFav(isFavorite(tool.id))), [tool.id])
  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])

  const primaryFormat = tool.acceptLabel.split(',')[0].trim()

  const handleMove = (e: React.PointerEvent<HTMLAnchorElement>) => {
    if (e.pointerType === 'touch') return
    const el = cardRef.current
    if (!el) return
    const clientX = e.clientX
    const clientY = e.clientY
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const x = clientX - rect.left
      const y = clientY - rect.top
      const nx = (x / rect.width - 0.5) * 2
      const ny = (y / rect.height - 0.5) * 2
      el.dataset.tilting = 'true'
      el.style.setProperty('--mx', `${x.toFixed(1)}px`)
      el.style.setProperty('--my', `${y.toFixed(1)}px`)
      el.style.setProperty('--spot-o', '1')
      el.style.setProperty('--rx', `${(-ny * 4.5).toFixed(2)}deg`)
      el.style.setProperty('--ry', `${(nx * 4.5).toFixed(2)}deg`)
      el.style.setProperty('--ty', '-4px')
    })
  }

  const handleLeave = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    const el = cardRef.current
    if (!el) return
    delete el.dataset.tilting
    el.style.setProperty('--spot-o', '0')
    el.style.setProperty('--rx', '0deg')
    el.style.setProperty('--ry', '0deg')
    el.style.setProperty('--ty', '0px')
  }

  return (
    <Link
      ref={cardRef}
      to={`/tool/${tool.id}`}
      data-category={tool.category}
      onPointerMove={handleMove}
      onPointerLeave={handleLeave}
      className="bento-card tilt-card group flex flex-col p-5 hover:border-slate-300/90 hover:shadow-lift dark:hover:border-slate-700"
    >
      {/* Dynamic cursor-tracking specular glass glare */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 transition-opacity duration-300"
        style={{
          opacity: 'var(--spot-o, 0)',
          background: 'radial-gradient(240px circle at var(--mx, 50%) var(--my, 50%), rgba(255,255,255,0.28), transparent 60%)',
        }}
      />
      {/* Subtle vibrant corner glow on hover (zero-blur radial gradient) */}
      <span
        aria-hidden
        className="pointer-events-none absolute -right-12 -top-12 h-36 w-36 rounded-full opacity-0 transition-opacity duration-300 group-hover:opacity-25 dark:group-hover:opacity-30"
        style={{ background: `radial-gradient(circle, ${cat.color} 0%, transparent 70%)` }}
      />
      {/* Crisp category color bar at top */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-x-6 top-0 h-[3px] rounded-b-full opacity-0 transition duration-200 group-hover:opacity-100"
        style={{ backgroundColor: cat.color }}
      />

      <span className="relative mb-4 flex items-start justify-between">
        <span
          className="icon-3d flex h-12 w-12 items-center justify-center rounded-2xl text-white transition duration-200 group-hover:-translate-y-0.5 group-hover:scale-105"
          style={{ background: `linear-gradient(145deg, ${cat.color}, ${cat.color}dd)` }}
        >
          <Icon className="h-5 w-5" aria-hidden />
        </span>

        <button
          type="button"
          aria-label={fav ? `Remove ${tool.name} from favorites` : `Add ${tool.name} to favorites`}
          aria-pressed={fav}
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            const next = !fav
            toggleFavorite(tool.id)
            showToast(next ? `Added ${tool.name} to favorites` : `Removed ${tool.name} from favorites`, next ? 'success' : 'info')
          }}
          className={`rounded-xl p-1.5 transition hover:bg-amber-50 dark:hover:bg-amber-500/15 ${
            fav ? 'text-amber-500' : 'text-slate-300 hover:text-amber-500 dark:text-slate-600'
          }`}
        >
          <Star className={`h-4.5 w-4.5 ${fav ? 'fill-amber-400 text-amber-500' : ''}`} />
        </button>
      </span>

      <span className="relative flex items-center gap-2">
        <span className="font-display text-[15px] font-bold tracking-tight text-ink-950 dark:text-white">
          {tool.name}
        </span>
        {tool.popular && (
          <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-500/12 px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wide text-amber-600 dark:text-amber-300">
            Hot
          </span>
        )}
      </span>

      <span className="relative mt-1.5 line-clamp-2 flex-1 text-sm leading-relaxed text-slate-500 dark:text-slate-400">
        {tool.description}
      </span>

      <span className="relative mt-5 flex items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800/80">
        <span className="flex items-center gap-1.5">
          <span className="cat-pill rounded-lg px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wide">
            {primaryFormat}
          </span>
          <span className="font-mono text-[11px] font-semibold tabular-nums text-slate-400 dark:text-slate-500">
            ≤{tool.maxSizeMB} MB
          </span>
        </span>
        <span className="cat-text inline-flex items-center gap-0.5 text-xs font-extrabold transition duration-200 group-hover:translate-x-0.5">
          Open <ArrowUpRight className="h-3.5 w-3.5" />
        </span>
      </span>
    </Link>
  )
}
