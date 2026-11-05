import { Suspense, lazy, useEffect } from 'react'
import { Routes, Route, useLocation } from 'react-router-dom'
import Layout from './components/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import { toolById, categoryById } from './data/tools'

const Home = lazy(() => import('./pages/Home'))
const ToolsPage = lazy(() => import('./pages/Listing').then((m) => ({ default: m.ToolsPage })))
const CategoryPage = lazy(() => import('./pages/Listing').then((m) => ({ default: m.CategoryPage })))
const ToolPage = lazy(() => import('./pages/ToolPage'))
const AboutPage = lazy(() => import('./pages/Static').then((m) => ({ default: m.AboutPage })))
const PrivacyPage = lazy(() => import('./pages/Static').then((m) => ({ default: m.PrivacyPage })))
const NotFoundPage = lazy(() => import('./pages/Static').then((m) => ({ default: m.NotFoundPage })))

function TitleManager() {
  const { pathname } = useLocation()
  useEffect(() => {
    let title = 'DocDoctor — Every file. Every tool. One place.'
    if (pathname.startsWith('/tool/')) {
      const t = toolById(pathname.split('/')[2] ?? '')
      if (t) title = `${t.name} — Free Online | DocDoctor`
    } else if (pathname.startsWith('/category/')) {
      const c = categoryById(pathname.split('/')[2] as never)
      if (c) title = `${c.name} — Free Online Tools | DocDoctor`
    } else if (pathname === '/tools') title = 'All Tools | DocDoctor'
    else if (pathname === '/about') title = 'About | DocDoctor'
    else if (pathname === '/privacy') title = 'Privacy Notice | DocDoctor'
    document.title = title
    window.scrollTo({ top: 0 })
  }, [pathname])
  return null
}

const Fallback = () => (
  <div className="mx-auto max-w-3xl px-4 py-24 text-center text-sm font-semibold text-slate-500" role="status">Loading…</div>
)

export default function App() {
  return (
    <Layout>
      <TitleManager />
      <ErrorBoundary>
      <Suspense fallback={<Fallback />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/tools" element={<ToolsPage />} />
          <Route path="/category/:id" element={<CategoryPage />} />
          <Route path="/tool/:id" element={<ToolPage />} />
          <Route path="/about" element={<AboutPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="*" element={<NotFoundPage />} />
        </Routes>
      </Suspense>
      </ErrorBoundary>
    </Layout>
  )
}
