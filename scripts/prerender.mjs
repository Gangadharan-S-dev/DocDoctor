// Prerendered SEO shells: run after `vite build` (npm run prerender).
// Writes one static HTML file per route (dist/tool/<id>/index.html, ...)
// with the route's real title, description, canonical, Open Graph tags,
// JSON-LD and crawlable body content. The React app replaces #root on
// load; crawlers and no-JS visitors get meaningful HTML immediately.
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs'
import path from 'node:path'

const base = (process.env.SITE_URL ?? 'https://docdoctor.app').replace(/\/$/, '')
const templatePath = path.join('dist', 'index.html')
if (!existsSync(templatePath)) {
  console.error('FAIL dist/index.html missing — run `vite build` first (or npm run build).')
  process.exit(1)
}
const template = readFileSync(templatePath, 'utf8')

mkdirSync('tests/.tmp', { recursive: true })
await build({
  entryPoints: ['src/data/tools.ts'], bundle: true, platform: 'node', format: 'cjs',
  outfile: 'tests/.tmp/registry.cjs', logLevel: 'silent',
})
const { TOOLS, CATEGORIES } = createRequire(import.meta.url)('../tests/.tmp/registry.cjs')
const catById = (id) => CATEGORIES.find((c) => c.id === id)

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const linkList = (tools) =>
  `<ul>${tools.map((t) => `<li><a href="/tool/${t.id}">${esc(t.name)}</a> — ${esc(t.description)}</li>`).join('')}</ul>`

function render({ routePath, title, description, jsonLd, body }) {
  const url = `${base}${routePath === '/' ? '/' : routePath}`
  let html = template
  html = html.replace(/<title>[\s\S]*?<\/title>/, `<title>${esc(title)}</title>`)
  html = html.replace(/(<meta name="description" content=")[^"]*(")/, `$1${esc(description)}$2`)
  html = html.replace(/(<meta property="og:title" content=")[^"]*(")/, `$1${esc(title)}$2`)
  html = html.replace(/(<meta property="og:description" content=")[^"]*(")/, `$1${esc(description)}$2`)
  html = html.replace(
    /<script type="application\/ld\+json">[\s\S]*?<\/script>/,
    `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`,
  )
  const headExtra =
    `<link rel="canonical" href="${url}" />` +
    `<meta property="og:url" content="${url}" />` +
    `<meta name="twitter:card" content="summary" />` +
    `<meta name="twitter:title" content="${esc(title)}" />` +
    `<meta name="twitter:description" content="${esc(description)}" />`
  html = html.replace('</head>', `${headExtra}</head>`)
  const shell =
    `<main style="font-family:system-ui,sans-serif;max-width:60rem;margin:0 auto;padding:2rem 1rem;line-height:1.6">` +
    `${body}<p><a href="/tools">Browse all ${TOOLS.length} free tools</a> · <a href="/">DocDoctor home</a></p></main>`
  html = html.replace('<div id="root"></div>', `<div id="root">${shell}</div>`)
  if (routePath === '/') {
    writeFileSync(templatePath, html)
    return
  }
  // Both forms: <route>/index.html for directory-index hosts and
  // <route>.html for clean-URL hosts (and vite preview), so /tool/x
  // resolves to this shell with and without a trailing slash.
  const rel = routePath.replace(/^\//, '')
  for (const outFile of [path.join('dist', rel, 'index.html'), path.join('dist', `${rel}.html`)]) {
    mkdirSync(path.dirname(outFile), { recursive: true })
    writeFileSync(outFile, html)
  }
}

const webApp = (name, description) => ({
  '@context': 'https://schema.org', '@type': 'WebApplication', name,
  applicationCategory: 'UtilitiesApplication', operatingSystem: 'Web',
  offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' }, description,
})

const routes = []
routes.push({
  routePath: '/', title: 'DocDoctor — Every file. Every tool. One place.',
  description: 'DocDoctor — Compress, convert, edit and manage PDF, image, Word, PowerPoint and Excel files. Free, private, no sign-up.',
  jsonLd: webApp('DocDoctor', 'Compress, convert, edit and manage PDF, image, Word, PowerPoint and Excel files. Free, private, no sign-up.'),
  body: `<h1>Every file. Every tool. One place.</h1><p>Compress, convert, edit and manage your files with powerful online tools. Simple, secure and free — no account, no installs. Most tools run entirely in your browser, so your files never leave your device.</p><h2>Browse by category</h2><ul>${CATEGORIES.map((c) => `<li><a href="/category/${c.id}">${esc(c.name)}</a> — ${esc(c.blurb)}</li>`).join('')}</ul><h2>Popular tools</h2>${linkList(TOOLS.filter((t) => t.popular))}`,
})
routes.push({
  routePath: '/tools', title: 'All Tools | DocDoctor',
  description: 'Browse every DocDoctor tool: PDF, image, Word, PowerPoint, Excel and data utilities. Free, no sign-up.',
  jsonLd: webApp('DocDoctor — All Tools', 'Browse every DocDoctor tool.'),
  body: `<h1>All tools</h1><p>${TOOLS.length} free file tools. No registration, no subscriptions — real processing only.</p>${linkList(TOOLS)}`,
})
routes.push({
  routePath: '/about', title: 'About | DocDoctor',
  description: 'DocDoctor is a free online file utility platform: compress, convert, edit, organize and manage PDF, image, Word, PowerPoint, Excel and data files from your browser.',
  jsonLd: webApp('About DocDoctor', 'Free online file utility platform.'),
  body: `<h1>About DocDoctor</h1><p>DocDoctor is a free online file utility platform: compress, convert, edit, organize and manage PDF, image, Word, PowerPoint, Excel and data files directly from your browser.</p><p>No registration, no subscriptions — just real file processing with clear progress, honest errors, and downloads that are validated before success is reported.</p>`,
})
routes.push({
  routePath: '/privacy', title: 'Privacy Notice | DocDoctor',
  description: 'DocDoctor privacy: temporary processing only, automatic deletion, no accounts, no permanent storage of your documents.',
  jsonLd: webApp('DocDoctor Privacy Notice', 'Temporary processing only. Automatic deletion. No accounts.'),
  body: `<h1>Your files stay yours</h1><p><strong>Temporary processing only.</strong> Uploaded files are placed in isolated, per-job temporary folders solely to run the tool you requested.</p><p><strong>Automatic deletion.</strong> Files are deleted after processing completes, with a hard maximum retention of 30–60 minutes — including after failures.</p><p><strong>No accounts, no tracking of content.</strong> DocDoctor needs no registration and never reads, sells or permanently stores your documents.</p><p><strong>Browser-first where practical.</strong> Tools that can run entirely in your browser do so — your file never leaves your device.</p>`,
})
for (const c of CATEGORIES) {
  const tools = TOOLS.filter((t) => t.category === c.id)
  routes.push({
    routePath: `/category/${c.id}`, title: `${c.name} — Free Online Tools | DocDoctor`,
    description: c.blurb,
    jsonLd: webApp(`DocDoctor ${c.name}`, c.blurb),
    body: `<h1>${esc(c.name)}</h1><p>${esc(c.blurb)}</p>${linkList(tools)}`,
  })
}
for (const t of TOOLS) {
  const c = catById(t.category)
  const related = TOOLS.filter((x) => x.category === t.category && x.id !== t.id).slice(0, 4)
  routes.push({
    routePath: `/tool/${t.id}`, title: `${t.name} — Free Online | DocDoctor`,
    description: `${t.description} Free, no sign-up — runs in your browser with DocDoctor.`,
    jsonLd: webApp(`DocDoctor ${t.name}`, `${t.description} Free, no sign-up — runs in your browser with DocDoctor.`),
    body:
      `<p><a href="/">Home</a> / <a href="/category/${c.id}">${esc(c.name)}</a> / ${esc(t.name)}</p>` +
      `<h1>${esc(t.name)}</h1><p>${esc(t.description)}</p>` +
      `<p>Accepts: ${esc(t.acceptLabel)} · Max ${t.maxSizeMB} MB${t.multiple ? ' · Batch supported' : ''} · Engine: ${esc(t.engine)}</p>` +
      `<h2>How it works</h2><ol><li>Upload your file — format and size are validated before anything runs.</li><li>Configure the options that matter, then run real processing.</li><li>Preview the result, check sizes, and download. Files are processed temporarily and auto-deleted.</li></ol>` +
      `<h2>Private by default</h2><p>Most DocDoctor tools run entirely in your browser — your file never leaves your device. Server-processed files are deleted after processing, with a maximum retention of 60 minutes.</p>` +
      `<h2>Related tools</h2>${linkList(related)}`,
  })
}

for (const r of routes) render(r)
console.log(`prerendered ${routes.length} routes into dist/ (base ${base})`)
