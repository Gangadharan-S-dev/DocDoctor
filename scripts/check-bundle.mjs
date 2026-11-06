// Bundle budget gate: run after `vite build` (npm run bundle:check).
// Fails when the initial page load (entry JS/CSS referenced from
// dist/index.html) grows past budget, when a heavy engine chunk is
// preloaded on first paint, or when any single chunk balloons.
import { readFileSync, existsSync } from 'node:fs'
import { gzipSync } from 'node:zlib'
import path from 'node:path'

const DIST = 'dist'
const MAX_INITIAL_JS_GZIP = 120_000
const MAX_INITIAL_CSS_GZIP = 40_000
const MAX_CHUNK_GZIP = 260_000
// Engine chunks that must only load on demand, never on first paint.
const LAZY_ONLY = ['pptx-gen', 'sheetjs', 'pdf-crypto', 'pdfjs', 'docx-gen']

const htmlPath = path.join(DIST, 'index.html')
if (!existsSync(htmlPath)) {
  console.error('FAIL dist/index.html missing — run `npm run build` first.')
  process.exit(1)
}
const html = readFileSync(htmlPath, 'utf8')

const initial = new Set()
for (const m of html.matchAll(/(?:src|href)="(\/assets\/[^"]+\.(?:js|css))"/g)) initial.add(m[1])

// The entry chunk's own static imports also load on first paint (the vendor
// chunk arrives this way, without a modulepreload link). Follow one level.
for (const rel of [...initial].filter((r) => r.endsWith('.js'))) {
  const src = readFileSync(path.join(DIST, rel), 'utf8')
  for (const m of src.matchAll(/(?:from|import)\s*"\.\/([^"]+\.js)"/g)) initial.add(`/assets/${m[1]}`)
}

const gz = (rel) => gzipSync(readFileSync(path.join(DIST, rel))).length
let failures = 0
let initialJs = 0
let initialCss = 0

console.log('Initial assets (from dist/index.html):')
for (const rel of [...initial].sort()) {
  const size = gz(rel)
  if (rel.endsWith('.js')) initialJs += size
  else initialCss += size
  console.log(`  ${rel}  ${(size / 1024).toFixed(1)} KB gzip`)
  for (const marker of LAZY_ONLY) {
    if (rel.includes(marker)) {
      console.error(`FAIL ${rel} is preloaded initially but must stay lazy (${marker}).`)
      failures++
    }
  }
}
console.log(`Initial JS: ${(initialJs / 1024).toFixed(1)} KB gzip (budget ${(MAX_INITIAL_JS_GZIP / 1024).toFixed(0)} KB)`)
console.log(`Initial CSS: ${(initialCss / 1024).toFixed(1)} KB gzip (budget ${(MAX_INITIAL_CSS_GZIP / 1024).toFixed(0)} KB)`)
if (initialJs > MAX_INITIAL_JS_GZIP) { console.error('FAIL initial JS over budget.'); failures++ }
if (initialCss > MAX_INITIAL_CSS_GZIP) { console.error('FAIL initial CSS over budget.'); failures++ }

// Largest single chunk guard (catches an engine ballooning unnoticed).
import { readdirSync } from 'node:fs'
let largest = { file: '', size: 0 }
for (const f of readdirSync(path.join(DIST, 'assets'))) {
  if (!f.endsWith('.js')) continue
  const size = gz(path.join('assets', f))
  if (size > largest.size) largest = { file: f, size }
}
console.log(`Largest chunk: ${largest.file}  ${(largest.size / 1024).toFixed(1)} KB gzip (budget ${(MAX_CHUNK_GZIP / 1024).toFixed(0)} KB)`)
if (largest.size > MAX_CHUNK_GZIP) { console.error('FAIL largest chunk over budget.'); failures++ }

if (failures) { console.error(`Bundle check FAILED (${failures}).`); process.exit(1) }
console.log('Bundle check passed.')
