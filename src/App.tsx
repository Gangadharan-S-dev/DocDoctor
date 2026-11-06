import { Suspense, lazy, useEffect } from 'react'
import { Routes, Route, useLocation } from 'react-router'
import Layout from './components/Layout'
import ErrorBoundary from './components/ErrorBoundary'
import { toolById, categoryById } from './data/tools'
import { setPageMeta, setJsonLd } from './lib/seo'

const Home = lazy(() => import('./pages/Home'))
const ToolsPage = lazy(() => import('./pages/Listing').then((m) => ({ default: m.ToolsPage })))
const CategoryPage = lazy(() => import('./pages/Listing').then((m) => ({ default: m.CategoryPage })))
const ToolPage = lazy(() => import('./pages/ToolPage'))
const AboutPage = lazy(() => import('./pages/Static').then((m) => ({ default: m.AboutPage })))
const PrivacyPage = lazy(() => import('./pages/Static').then((m) => ({ default: m.PrivacyPage })))
const NotFoundPage = lazy(() => import('./pages/Static').then((m) => ({ default: m.NotFoundPage })))

const BASE_DESC = 'DocDoctor — Compress, convert, edit and manage PDF, image, Word, PowerPoint and Excel files. Free, private, no sign-up.'

function TitleManager() {
  const { pathname } = useLocation()
  useEffect(() => {
    let title = 'DocDoctor — Every file. Every tool. One place.'
    let description = BASE_DESC
    let jsonLd: Record<string, unknown> | null = null
    if (pathname.startsWith('/tool/')) {
      const tool = toolById(pathname.split('/')[2] ?? '')
      if (tool) {
        title = `${tool.name} — Free Online | DocDoctor`
        description = `${tool.description} Free, no sign-up — runs in your browser with DocDoctor.`
        jsonLd = {
          '@context': 'https://schema.org', '@type': 'WebApplication', name: `DocDoctor ${tool.name}`,
          applicationCategory: 'UtilitiesApplication', operatingSystem: 'Web',
          offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, description,
        }
      }
    } else if (pathname.startsWith('/category/')) {
      const c = categoryById(pathname.split('/')[2] as never)
      if (c) { title = `${c.name} — Free Online Tools | DocDoctor`; description = c.blurb }
    } else if (pathname === '/tools') { title = 'All Tools | DocDoctor'; description = 'Browse every DocDoctor tool: PDF, image, Word, PowerPoint, Excel and data utilities.' }
    else if (pathname === '/about') title = 'About | DocDoctor'
    else if (pathname === '/privacy') title = 'Privacy Notice | DocDoctor'
    setPageMeta({ title, description, path: pathname })
    setJsonLd('dd-page-jsonld', jsonLd)
    window.scrollTo({ top: 0 })
  }, [pathname])
  return null
}

const Fallback = () => (
  <div className="mx-auto max-w-3xl px-4 py-24 text-center text-sm font-semibold text-slate-500" role="status">Loading…</div>
)

export default function App() {
  return (
    <ErrorBoundary>
    <Layout>
      <TitleManager />
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
    </Layout>
    </ErrorBoundary>
  )
}
