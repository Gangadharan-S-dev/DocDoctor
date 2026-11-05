// Generates public/sitemap.xml from the tool registry. Run: npm run sitemap
import { build } from 'esbuild'
import { createRequire } from 'node:module'
import { writeFileSync, mkdirSync } from 'node:fs'

const base = (process.env.SITE_URL ?? 'https://docdoctor.app').replace(/\/$/, '')
mkdirSync('tests/.tmp', { recursive: true })
await build({
  entryPoints: ['src/data/tools.ts'], bundle: true, platform: 'node', format: 'cjs',
  outfile: 'tests/.tmp/registry.cjs', logLevel: 'silent',
})
const { TOOLS, CATEGORIES } = createRequire(import.meta.url)('../tests/.tmp/registry.cjs')

const paths = ['/', '/tools', '/about', '/privacy',
  ...CATEGORIES.map((c) => `/category/${c.id}`),
  ...TOOLS.map((t) => `/tool/${t.id}`)]
const today = new Date().toISOString().slice(0, 10)
const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${paths.map((p) => `  <url><loc>${base}${p}</loc><lastmod>${today}</lastmod></url>`).join('\n')}\n</urlset>\n`
writeFileSync('public/sitemap.xml', xml)
console.log(`sitemap.xml written: ${paths.length} URLs (base ${base})`)
