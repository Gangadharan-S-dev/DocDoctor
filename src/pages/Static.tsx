import { Link } from 'react-router-dom'
import { ShieldCheck } from 'lucide-react'
import { TOOLS } from '../data/tools'

export function AboutPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <h1 className="font-display text-3xl font-extrabold text-ink-950 sm:text-4xl">About DocDoctor</h1>
      <div className="mt-5 space-y-4 leading-relaxed text-slate-600">
        <p>DocDoctor is a free online file utility platform: compress, convert, edit, organize and manage PDF, image, Word, PowerPoint, Excel and data files directly from your browser.</p>
        <p>No registration, no subscriptions, no AI features — just real file processing with clear progress, honest errors, and downloads that are validated before success is reported.</p>
        <p>The platform is built in phases. Phase 1 (current) delivers the design system, homepage, navigation, the {TOOLS.length}-tool registry and the reusable upload workflow. Processing engines then ship per category: images and core PDF first, Office tools next, advanced conversions after.</p>
      </div>
      <Link to="/tools" className="btn-accent mt-8">Explore the tools</Link>
    </div>
  )
}

export function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">
      <p className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-widest text-teal2"><ShieldCheck className="h-4 w-4" /> Privacy notice</p>
      <h1 className="mt-3 font-display text-3xl font-extrabold text-ink-950 sm:text-4xl">Your files stay yours</h1>
      <div className="mt-5 space-y-4 leading-relaxed text-slate-600">
        <p><strong className="text-ink-950">Temporary processing only.</strong> Uploaded files are placed in isolated, per-job temporary folders solely to run the tool you requested.</p>
        <p><strong className="text-ink-950">Automatic deletion.</strong> Files are deleted after processing completes, and a hard maximum retention of 30–60 minutes is enforced — including after failures.</p>
        <p><strong className="text-ink-950">No accounts, no tracking of content.</strong> DocDoctor needs no registration and never reads, sells or permanently stores your documents. Server logs record job metadata only, never file content.</p>
        <p><strong className="text-ink-950">Browser-first where practical.</strong> Tools that can run entirely in your browser do so — your file never leaves your device.</p>
        <p><strong className="text-ink-950">Safety checks.</strong> Uploads are validated by file signature and MIME type, size-limited, rate-limited, and processed with timeouts. Macros and scripts inside documents are never executed.</p>
      </div>
    </div>
  )
}

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-3xl px-4 py-20 text-center">
      <p className="font-display text-6xl font-extrabold text-slate-200">404</p>
      <h1 className="mt-3 font-display text-2xl font-extrabold text-ink-950">Page not found</h1>
      <p className="mt-2 text-slate-600">The page you&apos;re looking for doesn&apos;t exist.</p>
      <Link to="/" className="btn-accent mt-6">Back to homepage</Link>
    </div>
  )
}
