/** Local-only user preferences: favorite tools, recently used tools, theme, language. Nothing leaves the browser. */

const FAV_KEY = 'docdoctor:favorites'
const RECENT_KEY = 'docdoctor:recent'
const MAX_RECENT = 8

function readList(key: string): string[] {
  try {
    const raw = localStorage.getItem(key)
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : []
  } catch {
    return []
  }
}

function writeList(key: string, list: string[]) {
  try { localStorage.setItem(key, JSON.stringify(list)) } catch { /* private mode */ }
  window.dispatchEvent(new CustomEvent('docdoctor:prefs'))
}

export const getFavorites = (): string[] => readList(FAV_KEY)
export const isFavorite = (id: string): boolean => getFavorites().includes(id)
export function toggleFavorite(id: string): string[] {
  const list = getFavorites()
  const next = list.includes(id) ? list.filter((x) => x !== id) : [id, ...list]
  writeList(FAV_KEY, next)
  return next
}

export const getRecent = (): string[] => readList(RECENT_KEY)
export function pushRecent(id: string): string[] {
  const next = [id, ...getRecent().filter((x) => x !== id)].slice(0, MAX_RECENT)
  writeList(RECENT_KEY, next)
  return next
}

/** Subscribe to preference changes (same-tab custom event + cross-tab storage event). */
export function onPrefsChange(fn: () => void): () => void {
  const handler = () => fn()
  window.addEventListener('docdoctor:prefs', handler)
  window.addEventListener('storage', handler)
  return () => {
    window.removeEventListener('docdoctor:prefs', handler)
    window.removeEventListener('storage', handler)
  }
}
