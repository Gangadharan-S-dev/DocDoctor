import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: process.env.BASE_PATH || '/',
  plugins: [react(), tailwindcss()],
  server: { port: 5173, host: '127.0.0.1', proxy: { '/api': 'http://127.0.0.1:8080' } },
  preview: { port: 4173, host: '127.0.0.1', proxy: { '/api': 'http://127.0.0.1:8080' } },
  build: {
    chunkSizeWarningLimit: 600,
    // Vite's preload helper gets its own tiny chunk below (advancedChunks
    // 'preload-helper' group). Without that, Rolldown hoisted the helper
    // into the pptx-gen chunk and the entry statically imported — and
    // preloaded — all of PptxGenJS on first paint.
    rollupOptions: {
      output: {
        // Native Rolldown grouping. jszip gets its own chunk: it is shared
        // by pptxgenjs/docx/office code, and if it lands inside the pptx-gen
        // chunk every jszip consumer statically imports (and the entry
        // preloads) all of PptxGenJS on first paint.
        advancedChunks: {
          groups: [
            { name: 'preload-helper', test: /preload-helper/, priority: 100 },
            { name: 'zip', test: /node_modules[\\/]jszip[\\/]/ },
            { name: 'pdfjs', test: /node_modules[\\/]pdfjs-dist[\\/]/ },
            { name: 'pdf-crypto', test: /node_modules[\\/]@cantoo[\\/]pdf-lib[\\/]/ },
            { name: 'pdf-lib', test: /node_modules[\\/]pdf-lib[\\/]/ },
            { name: 'sheetjs', test: /node_modules[\\/]xlsx[\\/]/ },
            { name: 'docx-gen', test: /node_modules[\\/]docx[\\/]/ },
            { name: 'pptx-gen', test: /node_modules[\\/]pptxgenjs[\\/]/ },
          ],
        },
      },
    },
  },
})
