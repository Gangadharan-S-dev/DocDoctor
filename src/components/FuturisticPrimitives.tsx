import { useEffect, useRef } from 'react'

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

function readThemePalette() {
  const style = getComputedStyle(document.documentElement)
  const isDark = document.documentElement.classList.contains('dark')
  const accent = style.getPropertyValue('--color-accent').trim() || '#2563eb'
  const secondary = style.getPropertyValue('--beam-secondary').trim() || '#14b8a6'
  return { isDark, accent, secondary }
}

interface Beam {
  horizontal: boolean
  lineIndex: number
  pos: number
  speed: number
  length: number
  useSecondary: boolean
  alpha: number
}

/**
 * Ultra-lightweight Canvas 2D specular beam layer paired with a static CSS grid.
 * - Static architectural grid is painted once by CSS (.hero-grid-lines), not Canvas
 * - Runs at 1x resolution and ~30fps with only 6 beams & zero gradient allocations
 * - Auto-pauses while scrolling, when offscreen, or when tab is hidden
 * - Respects prefers-reduced-motion (renders static CSS grid only, 0 JS frames)
 */
export function GridBeamCanvas({ className = '' }: { className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || prefersReducedMotion()) return
    const ctx = canvas.getContext('2d', { alpha: true })
    if (!ctx) return

    const cell = 48
    let width = 0
    let height = 0
    let rafId = 0
    let scrollTimer = 0
    let scrolling = false
    let visible = true
    let palette = readThemePalette()

    const spawnBeam = (cols: number, rows: number, randomPos = false): Beam => {
      const horizontal = Math.random() > 0.45
      const maxLine = Math.max(1, horizontal ? rows : cols)
      const span = horizontal ? width : height
      const length = 84 + Math.random() * 110
      return {
        horizontal,
        lineIndex: Math.floor(Math.random() * maxLine),
        pos: randomPos ? Math.random() * (span + length) - length : -length,
        speed: 62 + Math.random() * 72,
        length,
        useSecondary: Math.random() > 0.6,
        alpha: 0.32 + Math.random() * 0.36,
      }
    }

    let beams: Beam[] = []

    const resize = () => {
      const rect = canvas.getBoundingClientRect()
      width = Math.max(1, Math.floor(rect.width))
      height = Math.max(1, Math.floor(rect.height))
      canvas.width = width
      canvas.height = height
      const cols = Math.ceil(width / cell)
      const rows = Math.ceil(height / cell)
      if (beams.length === 0) {
        beams = Array.from({ length: 6 }, () => spawnBeam(cols, rows, true))
      }
    }

    const drawFrame = (dt: number) => {
      ctx.clearRect(0, 0, width, height)
      const cols = Math.ceil(width / cell)
      const rows = Math.ceil(height / cell)
      const baseMul = palette.isDark ? 1 : 0.72

      ctx.lineCap = 'round'

      for (let i = 0; i < beams.length; i++) {
        const b = beams[i]
        b.pos += b.speed * dt

        const span = b.horizontal ? width : height
        if (b.pos - b.length > span + 32) {
          beams[i] = spawnBeam(cols, rows, false)
          continue
        }

        // Smooth edge fade in pure math (avoids costly CSS mask-image compositing)
        const progress = Math.max(0, Math.min(1, b.pos / Math.max(1, span)))
        const edgeFade = Math.sin(progress * Math.PI)
        const a = b.alpha * baseMul * edgeFade
        if (a < 0.02) continue

        const color = b.useSecondary ? palette.secondary : palette.accent
        const coord = b.lineIndex * cell + 0.5
        const tail = b.pos - b.length
        const mid = b.pos - b.length * 0.35

        // Soft trailing segment
        ctx.strokeStyle = color
        ctx.globalAlpha = a * 0.38
        ctx.lineWidth = 1.5
        ctx.beginPath()
        if (b.horizontal) {
          ctx.moveTo(tail, coord)
          ctx.lineTo(mid, coord)
        } else {
          ctx.moveTo(coord, tail)
          ctx.lineTo(coord, mid)
        }
        ctx.stroke()

        // Bright leading segment
        ctx.globalAlpha = a * 0.85
        ctx.beginPath()
        if (b.horizontal) {
          ctx.moveTo(mid, coord)
          ctx.lineTo(b.pos, coord)
        } else {
          ctx.moveTo(coord, mid)
          ctx.lineTo(coord, b.pos)
        }
        ctx.stroke()

        // Crisp leading spark dot
        ctx.fillStyle = palette.isDark ? '#ffffff' : color
        ctx.globalAlpha = a
        ctx.beginPath()
        ctx.arc(b.horizontal ? b.pos : coord, b.horizontal ? coord : b.pos, 1.8, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1
    }

    let lastTs = performance.now()
    const loop = (ts: number) => {
      if (!visible || document.hidden || scrolling) {
        rafId = 0
        return
      }
      const elapsed = ts - lastTs
      if (elapsed >= 32) {
        lastTs = ts
        drawFrame(Math.min(0.06, elapsed / 1000))
      }
      rafId = requestAnimationFrame(loop)
    }

    const start = () => {
      if (rafId || !visible || document.hidden || scrolling) return
      lastTs = performance.now()
      rafId = requestAnimationFrame(loop)
    }

    const stop = () => {
      if (rafId) {
        cancelAnimationFrame(rafId)
        rafId = 0
      }
    }

    resize()
    start()

    const ro = new ResizeObserver(resize)
    ro.observe(canvas)

    const io = new IntersectionObserver(
      (entries) => {
        visible = entries.some((e) => e.isIntersecting)
        if (visible) start()
        else stop()
      },
      { threshold: 0.01 },
    )
    io.observe(canvas)

    const mo = new MutationObserver(() => {
      palette = readThemePalette()
    })
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'data-accent'],
    })

    const onVisibility = () => {
      if (document.hidden) stop()
      else start()
    }
    document.addEventListener('visibilitychange', onVisibility)

    // Pause ambient hero canvas while user is actively scrolling for locked 60/120fps scroll
    const onScroll = () => {
      scrolling = true
      stop()
      if (scrollTimer) window.clearTimeout(scrollTimer)
      scrollTimer = window.setTimeout(() => {
        scrolling = false
        start()
      }, 160)
    }
    window.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      stop()
      if (scrollTimer) window.clearTimeout(scrollTimer)
      ro.disconnect()
      io.disconnect()
      mo.disconnect()
      document.removeEventListener('visibilitychange', onVisibility)
      window.removeEventListener('scroll', onScroll)
    }
  }, [])

  return (
    <>
      <span
        aria-hidden="true"
        className="hero-grid-lines pointer-events-none absolute inset-0"
      />
      <canvas
        ref={canvasRef}
        aria-hidden="true"
        className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}
      />
    </>
  )
}

/**
 * 100% GPU-composited top-edge specular Border Beam (zero software paint).
 * Place inside a `relative overflow-hidden rounded-*` container.
 */
export function BorderBeam({
  className = '',
  durationSec = 7,
  color,
}: {
  className?: string
  durationSec?: number
  color?: string
}) {
  return (
    <span
      aria-hidden="true"
      className={`border-beam pointer-events-none absolute ${className}`}
      style={
        {
          '--beam-duration': `${durationSec}s`,
          ...(color ? { '--beam-primary': color } : {}),
        } as React.CSSProperties
      }
    />
  )
}

/**
 * Zero-re-render magnetic micro-pull wrapper for high-priority CTA actions.
 * Disabled automatically on touch devices and prefers-reduced-motion.
 */
export function MagneticWrap({
  children,
  className = '',
  strength = 6,
}: {
  children: React.ReactNode
  className?: string
  strength?: number
}) {
  const ref = useRef<HTMLDivElement>(null)
  const rafRef = useRef<number>(0)

  useEffect(() => () => { if (rafRef.current) cancelAnimationFrame(rafRef.current) }, [])

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerType === 'touch' || prefersReducedMotion()) return
    const el = ref.current
    if (!el) return
    const cx = e.clientX
    const cy = e.clientY
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect()
      if (!rect.width || !rect.height) return
      const nx = ((cx - rect.left) / rect.width - 0.5) * 2
      const ny = ((cy - rect.top) / rect.height - 0.5) * 2
      el.style.transform = `translate3d(${(nx * strength).toFixed(2)}px, ${(ny * strength).toFixed(2)}px, 0)`
    })
  }

  const onLeave = () => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    const el = ref.current
    if (el) el.style.transform = 'translate3d(0px, 0px, 0)'
  }

  return (
    <div
      ref={ref}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      className={`inline-flex transition-transform duration-200 ease-out will-change-transform ${className}`}
    >
      {children}
    </div>
  )
}

/**
 * Live local-engine telemetry strip showing real browser compute capabilities.
 */
export function TelemetryStrip({ toolCount }: { toolCount: number }) {
  const wasmReady = typeof WebAssembly === 'object'
  const threads =
    typeof navigator !== 'undefined' && navigator.hardwareConcurrency
      ? navigator.hardwareConcurrency
      : null

  return (
    <div
      className="mt-5 inline-flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border border-slate-200/90 bg-white/95 px-3.5 py-2 font-mono text-[11px] font-bold tracking-wide text-slate-600 shadow-2xs dark:border-slate-700/80 dark:bg-[#0d1527]/95 dark:text-slate-300"
      aria-label="Local engine status"
    >
      <span className="inline-flex items-center gap-1.5 text-teal-700 dark:text-teal-300">
        <span className="relative flex h-2 w-2" aria-hidden="true">
          <span className="telemetry-ping absolute inline-flex h-full w-full rounded-full bg-teal-400 opacity-75" />
          <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-500" />
        </span>
        {wasmReady ? 'WASM · LOCAL READY' : 'LOCAL ENGINE'}
      </span>
      <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">|</span>
      <span>{toolCount} LIVE TOOLS</span>
      {threads && (
        <>
          <span aria-hidden="true" className="hidden text-slate-300 dark:text-slate-600 sm:inline">|</span>
          <span className="hidden sm:inline">{threads}-CORE WORKER POOL</span>
        </>
      )}
      <span aria-hidden="true" className="text-slate-300 dark:text-slate-600">|</span>
      <span className="text-accent dark:text-blue-300">0 MB CLOUD</span>
    </div>
  )
}

/**
 * GPU-composited hairline scroll progress bar pinned to the header bottom edge.
 * Zero React re-renders: directly sets transform scaleX inside requestAnimationFrame.
 */
export function ScrollProgressBar() {
  const barRef = useRef<HTMLSpanElement>(null)

  useEffect(() => {
    const el = barRef.current
    if (!el) return
    let raf = 0

    const update = () => {
      raf = 0
      const doc = document.documentElement
      const max = doc.scrollHeight - window.innerHeight
      const ratio = max > 16 ? Math.max(0, Math.min(1, window.scrollY / max)) : 0
      el.style.transform = `scaleX(${ratio.toFixed(4)})`
      el.style.opacity = ratio > 0.01 ? '1' : '0'
    }

    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(update)
    }

    update()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll, { passive: true })
    return () => {
      if (raf) cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [])

  return (
    <span
      ref={barRef}
      aria-hidden="true"
      className="brand-grad pointer-events-none absolute inset-x-0 bottom-0 h-[2px] origin-left opacity-0 transition-opacity duration-200 will-change-transform"
      style={{ transform: 'scaleX(0)' }}
    />
  )
}
