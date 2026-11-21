import { flushSync } from 'react-dom'

/**
 * Helpers for butter-smooth, 60/120fps circular View Transitions on light/dark
 * theme switches and dynamic `<meta name="theme-color">` synchronization.
 *
 * Why this is lag-free:
 * 1. Suppresses per-element CSS transitions, pauses ambient animations, and
 *    disables expensive `backdrop-filter` readbacks while the transition runs
 *    (`html.theme-transitioning`), preventing 300+ simultaneous DOM repaints.
 * 2. Uses React `flushSync` inside `document.startViewTransition` so the new
 *    theme commits synchronously in a single frame before snapshot capture.
 * 3. Drives the `clip-path` circle reveal via Web Animations API with literal
 *    pixel keyframes on `::view-transition-new(root)` for compositor playback.
 */

export const THEME_COLOR_LIGHT = '#f7f8fc'
export const THEME_COLOR_DARK = '#060913'

export function syncThemeColor(dark: boolean): void {
  if (typeof document === 'undefined') return
  const meta =
    document.getElementById('dd-theme-color') ??
    document.querySelector('meta[name="theme-color"]')
  if (meta) {
    meta.setAttribute('content', dark ? THEME_COLOR_DARK : THEME_COLOR_LIGHT)
  }
}

interface ViewTransitionLike {
  ready: Promise<void>
  finished: Promise<void>
}

type DocumentWithVT = Document & {
  startViewTransition?: (cb: () => void) => ViewTransitionLike
}

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

/**
 * Runs a light/dark theme toggle with a smooth circular reveal from the
 * clicked toggle button, without transition-storm or backdrop-filter lag.
 */
export function runThemeTransition(
  update: () => void,
  origin?: { x: number; y: number },
): void {
  if (typeof document === 'undefined') {
    update()
    return
  }

  const root = document.documentElement
  const doc = document as DocumentWithVT

  if (prefersReducedMotion() || typeof doc.startViewTransition !== 'function') {
    root.classList.add('theme-transitioning')
    update()
    void window.getComputedStyle(root).color
    window.requestAnimationFrame(() => {
      root.classList.remove('theme-transitioning')
    })
    return
  }

  const x = Math.round(origin?.x ?? window.innerWidth / 2)
  const y = Math.round(origin?.y ?? 36)
  const endRadius = Math.ceil(
    Math.hypot(
      Math.max(x, window.innerWidth - x),
      Math.max(y, window.innerHeight - y),
    ),
  )

  root.classList.add('theme-transitioning')

  try {
    const vt = doc.startViewTransition(() => {
      flushSync(() => {
        update()
      })
    })

    vt.ready
      .then(() => {
        document.documentElement.animate(
          {
            clipPath: [
              `circle(0px at ${x}px ${y}px)`,
              `circle(${endRadius}px at ${x}px ${y}px)`,
            ],
          },
          {
            duration: 380,
            easing: 'cubic-bezier(0.22, 1, 0.36, 1)',
            pseudoElement: '::view-transition-new(root)',
          },
        )
      })
      .catch(() => {
        /* ignore aborted transition */
      })

    vt.finished.finally(() => {
      root.classList.remove('theme-transitioning')
    })
  } catch {
    root.classList.remove('theme-transitioning')
    update()
  }
}
