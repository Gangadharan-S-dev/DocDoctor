import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router'
import App from './App'
import I18nProvider from './components/I18nProvider'
import '@fontsource/manrope/latin-400.css'
import '@fontsource/manrope/latin-500.css'
import '@fontsource/manrope/latin-600.css'
import '@fontsource/manrope/latin-700.css'
import '@fontsource/manrope/latin-800.css'
import '@fontsource/sora/latin-600.css'
import '@fontsource/sora/latin-700.css'
import '@fontsource/sora/latin-800.css'
import '@fontsource/jetbrains-mono/latin-500.css'
import '@fontsource/jetbrains-mono/latin-700.css'
import './index.css'
import { syncThemeColor } from './lib/viewTransition'

// Apply saved theme and studio accent before first paint to avoid a flash.
try {
  const saved = localStorage.getItem('docdoctor:theme')
  const isDark = saved === 'dark' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)
  if (isDark) {
    document.documentElement.classList.add('dark')
  }
  syncThemeColor(isDark)
  const savedAccent = localStorage.getItem('docdoctor:accent')
  if (savedAccent === 'cobalt' || savedAccent === 'coral' || savedAccent === 'emerald' || savedAccent === 'violet') {
    document.documentElement.dataset.accent = savedAccent
  }
} catch { /* private mode */ }

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <I18nProvider>
        <App />
      </I18nProvider>
    </BrowserRouter>
  </React.StrictMode>,
)

// Offline support: cache the app shell and hashed assets (see public/sw.js).
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register(`${import.meta.env.BASE_URL}sw.js`).catch(() => { /* offline is best-effort */ })
  })
}
