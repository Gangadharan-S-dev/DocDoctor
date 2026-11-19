import { Link } from 'react-router'
import { ShieldCheck, Cpu, Lock, Timer, FileCheck2, Sparkles, ArrowRight, Compass, Home as HomeIcon } from 'lucide-react'
import { TOOLS } from '../data/tools'
import { SpotlightCard } from '../components/BentoVisuals'

export function AboutPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <div className="bento-card bento-hero-mesh bento-dots p-7 sm:p-10">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-blue-500/10 px-3.5 py-1 text-xs font-extrabold text-accent dark:bg-blue-500/15 dark:text-blue-300">
          <Sparkles className="h-3.5 w-3.5" /> Built for speed &amp; privacy
        </span>
        <h1 className="mt-4 font-display text-3xl font-extrabold tracking-tight text-ink-950 dark:text-white sm:text-5xl">
          About <span className="brand-text-grad">DocDoctor</span>
        </h1>
        <p className="mt-4 max-w-2xl text-base leading-relaxed text-slate-600 dark:text-slate-300 sm:text-lg">
          DocDoctor is a free browser-first file utility studio — compress, convert, edit, organize and manage PDF, image, Word, PowerPoint, Excel and data files with zero sign-up and zero paywalls.
        </p>

        <dl className="mt-7 grid gap-3 sm:grid-cols-3">
          {[
            { v: `${TOOLS.length}`, l: 'Real processing tools', color: '#2563eb' },
            { v: '100%', l: 'Free, no subscriptions', color: '#0d9488' },
            { v: '0 MB', l: 'Stored permanently', color: '#7c3aed' },
          ].map((s) => (
            <div key={s.l} className="rounded-2xl border border-slate-200/80 bg-white/90 p-4 dark:border-slate-800 dark:bg-[#0e1525]">
              <dt className="sr-only">{s.l}</dt>
              <dd className="font-display text-2xl font-extrabold" style={{ color: s.color }}>{s.v}</dd>
              <dd className="mt-0.5 text-xs font-bold text-slate-500 dark:text-slate-400">{s.l}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="mt-6 grid gap-5 md:grid-cols-3">
        {[
          { icon: Cpu, color: '#2563eb', title: 'On-device WASM engines', body: 'Heavy image codecs (MozJPEG, WebP, AVIF, OxiPNG), PDF manipulation, OCR in 13 languages, and destructive blur/redaction run locally in your browser.' },
          { icon: FileCheck2, color: '#0d9488', title: 'Honest, verified results', body: 'No fake progress bars or simulated conversions. Every tool validates its output before unlocking download and clearly states what it simplifies.' },
          { icon: ShieldCheck, color: '#e11d48', title: 'Zero-account workflow', body: 'Open a tool, drop or paste your file, and download. Favorites and recents stay strictly in your own browser storage.' },
        ].map((item) => (
          <SpotlightCard key={item.title} glowColor={`${item.color}1e`} className="bento-card p-6">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-xs" style={{ backgroundColor: item.color }}>
              <item.icon className="h-5 w-5" />
            </span>
            <h2 className="mt-4 font-display text-lg font-extrabold text-ink-950 dark:text-white">{item.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{item.body}</p>
          </SpotlightCard>
        ))}
      </div>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link to="/tools" className="btn-accent">Explore all {TOOLS.length} tools <ArrowRight className="h-4 w-4" /></Link>
        <Link to="/privacy" className="btn-ghost">Read privacy guarantees</Link>
      </div>
    </div>
  )
}

export function PrivacyPage() {
  return (
    <div className="mx-auto max-w-5xl px-4 py-12 sm:px-6">
      <SpotlightCard
        glowColor="rgba(20, 184, 166, 0.22)"
        className="relative overflow-hidden rounded-[2rem] border border-slate-800 bg-[#090e1a] p-7 text-white shadow-lift sm:p-10"
      >
        <span aria-hidden className="pointer-events-none absolute -right-16 -top-16 h-64 w-64 rounded-full bg-teal-500/20 blur-3xl" />
        <p className="inline-flex items-center gap-2 rounded-full border border-teal-400/30 bg-teal-400/10 px-3.5 py-1 text-xs font-extrabold uppercase tracking-wider text-teal-300">
          <ShieldCheck className="h-3.5 w-3.5" /> Privacy notice
        </p>
        <h1 className="mt-4 font-display text-3xl font-extrabold sm:text-5xl">Your files stay yours</h1>
        <p className="mt-3 max-w-2xl text-base leading-relaxed text-slate-300">
          DocDoctor is engineered so your private documents never need to be trusted to a third-party cloud. Nearly every tool runs 100% locally in your browser.
        </p>
      </SpotlightCard>

      <div className="mt-6 grid gap-4 md:grid-cols-2">
        {[
          { icon: Cpu, color: '#0d9488', title: 'Browser-first execution', body: 'All browser tools process files entirely in local memory using WebAssembly and Web Workers — your bytes never leave your device.' },
          { icon: Timer, color: '#2563eb', title: 'Automatic deletion', body: 'For optional LibreOffice server conversions, uploaded files live in isolated per-job temp folders and are deleted immediately after processing (hard cap 30–60 minutes).' },
          { icon: Lock, color: '#7c3aed', title: 'No accounts, no content tracking', body: 'No registration required. We never read, index, train on, sell, or permanently store your documents.' },
          { icon: FileCheck2, color: '#e11d48', title: 'Strict safety checks', body: 'Uploads are validated by file signature and MIME type, size-limited, rate-limited, and run with timeouts. Embedded macros and scripts are never executed.' },
        ].map((item) => (
          <SpotlightCard key={item.title} glowColor={`${item.color}1e`} className="bento-card p-6">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl text-white shadow-xs" style={{ backgroundColor: item.color }}>
              <item.icon className="h-5 w-5" />
            </span>
            <h2 className="mt-4 font-display text-lg font-extrabold text-ink-950 dark:text-white">{item.title}</h2>
            <p className="mt-1.5 text-sm leading-relaxed text-slate-600 dark:text-slate-400">{item.body}</p>
          </SpotlightCard>
        ))}
      </div>

      <div className="mt-8">
        <Link to="/tools" className="btn-accent">Start using tools privately <ArrowRight className="h-4 w-4" /></Link>
      </div>
    </div>
  )
}

export function NotFoundPage() {
  return (
    <div className="mx-auto max-w-2xl px-4 py-20 sm:px-6">
      <div className="bento-card bento-hero-mesh bento-dots p-10 text-center sm:p-14">
        <p className="brand-text-grad font-display text-7xl font-extrabold tracking-tight sm:text-8xl">404</p>
        <h1 className="mt-3 font-display text-2xl font-extrabold text-ink-950 dark:text-white sm:text-3xl">
          Page not found
        </h1>
        <p className="mx-auto mt-2 max-w-md text-sm text-slate-600 dark:text-slate-400 sm:text-base">
          That route doesn&apos;t exist in DocDoctor. Jump back home or browse all {TOOLS.length} live file tools.
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link to="/" className="btn-accent"><HomeIcon className="h-4 w-4" /> Back to homepage</Link>
          <Link to="/tools" className="btn-ghost"><Compass className="h-4 w-4" /> Browse all tools</Link>
        </div>
      </div>
    </div>
  )
}
