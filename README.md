# DocDoctor

Free online file utility platform — compress, convert, edit and manage PDF, image, Word, PowerPoint, Excel and data files. No registration, no subscriptions, real processing only.

## Run

```bash
npm install
npm run dev      # http://127.0.0.1:5173
npm run build    # production build (tsc + vite)
npm run preview  # preview production build
npm test         # engine tests (node) + unit tests (vitest)
npm run lint     # eslint + tsc
```

Stack: React 19, React Router 8, Vite 8 (Rolldown), Tailwind CSS 4, TypeScript 5.9.
Processing runs in the browser; image compression batches run in a Web Worker
with a main-thread fallback, and OCR (Tesseract.js) runs in its own worker.

## Live tools (76 in browser + 2 via the LibreOffice service = all 78 covered)

- **Image (15):** Compress, Resize, Crop, JPG↔PNG, WebP Converter, JPG/PNG→WebP, Rotate, Flip, Image→PDF, PDF→Image, Watermark, Metadata Viewer, ICO Converter
- **PDF (13):** Compress, Merge, Split, Compare PDFs, Remove/Extract/Organize pages (visual drag-and-drop grid), Rotate, PDF→JPG/PNG, Page Numbers, Watermark
- **Word (7):** Word→TXT, Word→HTML, Extract Text, Compress DOCX, Merge Word, Split Word (by heading/paragraphs), Edit Word (text editor → rebuilt DOCX)
- **PowerPoint (6):** Compress, Merge, Split, Remove/Extract/Reorder slides (visual pickers)
- **Excel (10):** XLS→XLSX, CSV→Excel, Excel→CSV, Merge, Split Worksheets, Remove Worksheets, Compress, Excel→HTML, XLSX/Excel→PDF (values-only)
- **Other (10):** Create/Extract ZIP (traversal-safe), TXT Converter, HTML→TXT, Markdown Converter, JSON Formatter, JSON→XML, XML Formatter, CSV Tools, File Metadata (SHA-256)

Phase 4 added: Edit PDF (click-to-place text), Sign PDF (drawn signature),
Repair PDF (rebuild recovery), PDF→Word / PDF→Excel (text-based),
PDF→PowerPoint/PPTX (page-image slides), Word→PDF (text-flow) and EPUB→PDF —
each labeled in the UI with exactly what it simplifies.

Upgrade release (v0.2.0) added: **OCR PDF to Text** and **Image to Text (OCR)**
(on-device Tesseract.js, English), real rasterizing **Extreme** PDF compression,
progress + cancel for long jobs, favorites/recent tools (local only), dark mode,
EN/ES/HI interface language for the app chrome, PWA offline shell, and per-tool
SEO metadata. Tool names and content stay in English in every language.

P0 upgrade added: OCR in **13 languages** with **searchable PDF** output
(page image + invisible text layer, verified extractable), prerendered
SEO HTML for every route (87 static shells generated at build time),
an initial-bundle budget gate (`npm run bundle:check` — the entry no
longer preloads the PptxGenJS engine), and optional server-side
**Compress PDF** via Ghostscript/qpdf (text-preserving; see the
conversion service below).

Also live: **Protect PDF** (real AES-256 encryption, verified to refuse
opening without the password) and **Unlock PDF** (correct password required —
never bypassed), via the `@cantoo/pdf-lib` fork, plus **Remove Word Sections**:
DOCX has no fixed pages, so instead of faking page removal it removes selected
sections/paragraphs/tables by content. PPTX→PDF and Slides→Images run through
the optional LibreOffice service below and stay clearly marked unavailable
until it is connected. Files never leave the device for all browser tools.

Recent upgrades added: **Compare PDFs** (visual side-by-side split view & diff report),
**Clipboard Paste (`Ctrl+V`)** across all upload dropzones, **drag-and-drop page reordering**
in Organize PDF, **free visual signature placement** with live page preview & zoom controls,
**DOCX export from OCR**, non-blocking PDF rasterization, and offline asset caching.

> Windows sandbox note: if npm hits a cache `EPERM`, run with a project-local cache:
> `npm install --cache .npm-cache`

## Architecture (Phase 1 — current)

```
src/
  data/tools.ts        Central tool registry: 75 tools, 6 categories, accept rules,
                       size limits, engine + phase per tool. Pages are generated
                       from this registry — no per-tool page code.
  components/
    Layout.tsx         Navbar (search, category menu, mobile nav) + footer
    ToolCard.tsx       Registry-driven tool card used everywhere
    UploadArea.tsx     Reusable drag-and-drop upload: format/size validation,
                       file list, remove/clear. Shared by every tool page.
  pages/
    Home.tsx           Hero + live tool search, categories, popular tools,
                       how-it-works, privacy section
    Listing.tsx        /tools (search + category filter), /category/:id
    ToolPage.tsx       /tool/:id — breadcrumb, upload, honest engine status,
                       privacy guarantees, related tools
    Static.tsx         About, Privacy, 404
server/                Planned (Phase 2+): Express + TypeScript API with modular
                       processing engines (Sharp, pdf-lib, PDF.js, Ghostscript,
                       LibreOffice headless, JSZip/Archiver), isolated temp job
                       folders, rate limits, timeouts, auto-cleanup ≤60 min.
```

## Delivery phases

| Phase | Scope | Status |
|---|---|---|
| 1 | Architecture, design system, homepage, navigation, category pages, tool registry, reusable upload workflow | ✅ Done |
| 2 | Image tools + core PDF tools (real engines, tested end-to-end) | ✅ Done — 27 tools live, all browser-side |
| 3 | Word, PowerPoint, Excel, archive utilities | ✅ Done — 33 more tools live (browser engines) |
| 4 | Advanced conversions (PDF↔Office, edit/sign, repair, EPUB) + code-splitting | ✅ Done |
| 5 | Security/integration testing, production hardening | ✅ Done — audit + fixes, sitemap, headers, error boundary, deploy configs, LibreOffice service scaffold (activates where LibreOffice is installed) |

## Conversion server (optional, LibreOffice-backed)

Unlocks **PPTX→PDF** and **Slides→Images** with full rendering fidelity,
plus real **Compress PDF** when Ghostscript or qpdf is installed:

```bash
npm --prefix server install
npm --prefix server start   # http://127.0.0.1:8080 — requires LibreOffice installed
npm run test:server         # health/honesty checks (503 without LibreOffice)
```

Or with Docker (bundles LibreOffice): `docker build -t docdoctor-server server/`
then `docker run --rm -p 8080:8080 docdoctor-server`. Optional env: `HOST`
(bind address, default `127.0.0.1`), `ALLOWED_ORIGIN` (single CORS origin,
unset = same-origin only), `TRUST_PROXY` (behind a proxy, for rate limits).

The web app proxies `/api` to it in dev/preview (see `vite.config.ts`) and each
server tool page probes `/api/health` — the convert button only enables when
LibreOffice actually answers. Without the server those two tools show setup
instructions; nothing is faked. For other hosts set `VITE_API_URL` at build
time. Isolation, cleanup (≤30 min), rate limits and timeouts: see
[SECURITY.md](/C:/Users/ganga/projects/DocDoctor/SECURITY.md) and
[server/README.md](/C:/Users/ganga/projects/DocDoctor/server/README.md) for
Windows setup steps.

## Deploying the web app

`npm run build` outputs `dist/` (sitemap regenerated each build; set `SITE_URL`
to your domain first). Any static host works: `vercel.json` (rewrites + security
headers) and `public/_redirects` + `public/_headers` (Netlify-style) are included
so SPA deep links and headers behave. Point your host at `dist/` as the publish
directory; no environment variables are required for the 70 browser tools.

## Principles

- Real processing only — a tool's process button unlocks only when its engine is tested.
- Files are temporary: isolated job folders, deleted after processing, hard max retention 60 minutes.
- Browser-side processing preferred wherever practical.
