/**
 * Helpers for instant, zero-jank light/dark theme switches and dynamic browser
 * `<meta name="theme-color">` synchronization.
 *
 * Temporarily suppresses per-element CSS transitions during the single frame
 * `.dark` toggles so hundreds of glass/card/border elements don't repaint
 * simultaneously, keeping theme switches locked at 60/120fps.
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

let clearTimer = 0

/**
 * Applies a theme DOM/state change in a single paint without per-element
 * transition storms or full-viewport View Transition snapshot stalls.
 */
export function runThemeTransition(update: () => void): void {
  if (typeof document === 'undefined') {
    update()
    return
  }

  const root = document.documentElement
  if (clearTimer) {
    window.cancelAnimationFrame(clearTimer)
    clearTimer = 0
  }

  root.classList.add('theme-switching')
  update()
  // Flush the new theme styles while transitions are disabled.
  void window.getComputedStyle(root).color

  clearTimer = window.requestAnimationFrame(() => {
    clearTimer = window.requestAnimationFrame(() => {
      root.classList.remove('theme-switching')
      clearTimer = 0
    })
  })
}
