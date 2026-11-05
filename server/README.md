# DocDoctor Conversion Service

LibreOffice-backed rendering for tools a browser cannot do faithfully:
**PPTX → PDF**, **Slides → Images**, and full-fidelity **DOCX → PDF** /
**XLSX → PDF** (the browser versions of the latter two are simplified —
their pages offer a "Convert with LibreOffice" upgrade whenever this
service is connected). Everything else in DocDoctor runs 100% in the
browser and does not need this service.

The web app talks to it at `/api` (proxied in dev/preview — see
`../vite.config.ts`). Each tool page probes `GET /api/health`; its convert
button only enables when LibreOffice actually answers. Without LibreOffice
the endpoints return `503` with an explanation — never a fake file.

## Windows setup

1. Install LibreOffice (free, ~390 MB — install it yourself; DocDoctor never
   forces or bundles it):
   - Download from https://www.libreoffice.org/download/ and run the installer, or
   - `winget install --id TheDocumentFoundation.LibreOffice` if you use winget.
2. Verify: `"C:\Program Files\LibreOffice\program\soffice.exe" --version`
3. Install + start the service:

   ```powershell
   npm --prefix server install
   npm --prefix server start
   # DocDoctor conversion service on http://127.0.0.1:8080 (LibreOffice: found)
   ```

   The service auto-detects standard Windows install locations and
   `soffice` on PATH. If LibreOffice lives somewhere custom, set
   `LIBREOFFICE_PATH` first (the legacy `SOFFICE_PATH` name also works;
   `LIBREOFFICE_PATH=off` disables detection entirely):
   `$env:LIBREOFFICE_PATH = "D:\Apps\LibreOffice\program\soffice.exe"`.

4. Run the web app (`npm run dev` at the repo root) and open PPTX to PDF —
   the page detects the service automatically. For a production build served
   from another origin, build with `VITE_API_URL=https://your-api-host`.

Verify any time with: `npm run test:server` (expects `503` until LibreOffice
is installed, `tools: ["pptx-to-pdf", "slides-to-images"]` in `/api/health`
afterwards).

## Behavior & safety

- Every conversion runs in an isolated temp folder (UUID), deleted in a
  `finally` after the response; a sweeper removes anything older than 30 min.
- Upload cap 50 MB, 120 s converter timeout, 30 conversions / 10 min / IP.
- LibreOffice is spawned with an argv array (no shell) and sanitized
  filenames, so uploaded names cannot inject commands.
- Errors return a short message only — no server paths or stack traces.
- The service binds `127.0.0.1` by default and has no auth: put it behind
  your platform's auth/rate limiting before exposing it publicly.

## API

| Endpoint | Body | Success | Notes |
|---|---|---|---|
| `GET /api/health` | — | `{ ok, libreOffice, version, tools, installHint? }` | Used by the web UI probe; version string verified to be real LibreOffice |
| `POST /api/convert/docx-to-pdf` | multipart `file` (.doc/.docx) | PDF download (verified `%PDF` magic) | 503 without LibreOffice, 422 on bad input |
| `POST /api/convert/pptx-to-pdf` | multipart `file` (.ppt/.pptx) | PDF download (verified `%PDF` magic) | 503 without LibreOffice, 422 on bad input |
| `POST /api/convert/xlsx-to-pdf` | multipart `file` (.xls/.xlsx) | PDF download (verified `%PDF` magic) | 503 without LibreOffice, 422 on bad input |
| `POST /api/convert/slides-to-images` | multipart `file`, `format` = jpg\|png | ZIP of slide images (200% scale) | Rendered via PDF.js + canvas server-side |
