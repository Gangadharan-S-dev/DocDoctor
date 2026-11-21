# DocDoctor Design System Rules (Figma MCP Integration)

This document defines DocDoctor's visual tokens, component architecture, styling conventions, asset strategy, and Figma-to-code mapping rules.

---

## 1. Token Definitions

All design tokens live in [src/index.css](src/index.css) using **Tailwind CSS v4 `@theme`** and runtime CSS custom properties. No external token transformer is required; Tailwind utilities and custom CSS consume tokens directly.

### Core Brand, Typography & Elevation (`@theme`)
```css
@theme {
  --color-ink-950: #090e1a;
  --color-ink-900: #111827;
  --color-ink-800: #1b253b;
  --color-ink-700: #293652;
  --color-paper: #f7f8fc;
  --color-accent: #2563eb;
  --color-accent-dark: #1d4ed8;
  --color-accent-soft: #eff6ff;
  --color-violet2: #7c3aed;
  --color-teal2: #0d9488;
  --color-coral: #f43f5e;
  --color-amber2: #f59e0b;

  --font-display: "Sora", system-ui, sans-serif;
  --font-sans: "Manrope", system-ui, sans-serif;
  --font-mono: "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;

  /* Semantic surfaces & foregrounds (switch automatically on .dark) */
  --color-surface-0: var(--surface-0);
  --color-surface-1: var(--surface-1);
  --color-surface-2: var(--surface-2);
  --color-surface-3: var(--surface-3);
  --color-fg-primary: var(--fg-primary);
  --color-fg-secondary: var(--fg-secondary);
  --color-fg-muted: var(--fg-muted);

  --shadow-card: 0 1px 2px rgba(9, 14, 26, .04), 0 8px 24px -10px rgba(9, 14, 26, .08);
  --shadow-lift: 0 4px 12px rgba(9, 14, 26, .06), 0 20px 44px -14px rgba(9, 14, 26, .16);
  --shadow-bento: 0 1px 1px rgba(9, 14, 26, .03), 0 12px 32px -12px rgba(9, 14, 26, .10);
  --radius-4xl: 2rem;
}
```

### Multi-Mode Variables (Figma Variable Collections)

1. **Theme Mode (`Light` / `Dark` via `html.dark`)**
   - Light: `--surface-0: #f7f8fc`, `--surface-1: #ffffff`, `--surface-2: #f1f5f9`, `--surface-3: #e2e8f0`, `--fg-primary: #090e1a`, `--fg-secondary: #334155`, `--fg-muted: #64748b`.
   - Dark: `--surface-0: #060913`, `--surface-1: #0d1425`, `--surface-2: #131d33`, `--surface-3: #1b2844`, `--fg-primary: #f8fafc`, `--fg-secondary: #cbd5e1`, `--fg-muted: #94a3b8`.
   - Browser `<meta name="theme-color">` syncs automatically via `syncThemeColor()` in [src/lib/viewTransition.ts](src/lib/viewTransition.ts).

2. **Studio Accent Mode (`html[data-accent="cobalt|coral|emerald|violet"]`)**
   - Overrides `--color-accent`, `--color-accent-dark`, `--color-accent-soft`, `--accent-grad`, `--accent-glow`, and `--beam-secondary`.

3. **Category-Adaptive Mode (`[data-category="pdf|image|word|powerpoint|excel|other"]`)**
   - WCAG AA (>= 4.5:1) foreground/tint pairs in both light and dark modes (`--cat-*-fg`, `--cat-*-bg`) scoped via `--ws-cat`, `--ws-cat-fg`, `--ws-cat-bg`, `--ws-cat-glow`.
   - Use `.cat-pill`, `.cat-text`, `.cat-icon-soft`, and `.workspace-dropzone` instead of raw inline hex-alpha styles so contrast stays WCAG AA compliant in every mode.

| Category | Brand Token | Light FG (`>=4.5:1`) | Dark FG (`>=4.5:1`) |
| --- | --- | --- | --- |
| `pdf` | `#e5484d` | `#b91c1c` | `#fda4af` |
| `image` | `#0ea5a0` | `#0f766e` | `#5eead4` |
| `word` | `#1d6ff2` | `#1d4ed8` | `#93c5fd` |
| `powerpoint` | `#e86a2c` | `#c2410c` | `#fdba74` |
| `excel` | `#1f9d55` | `#15803d` | `#86efac` |
| `other` | `#6d5df6` | `#5b21b6` | `#c4b5fd` |

---

## 2. Component Library

All UI primitives are custom TypeScript React components in `src/components/`:

- **Shell & Navigation**: [Layout.tsx](src/components/Layout.tsx), [QuickDock.tsx](src/components/QuickDock.tsx), [CommandPalette.tsx](src/components/CommandPalette.tsx), [GlobalDropPortal.tsx](src/components/GlobalDropPortal.tsx)
- **Unified Overlays & Notifications**:
  - [StudioDialog.tsx](src/components/StudioDialog.tsx) — Accessible modal / mobile bottom-sheet / fullscreen lightbox primitive with portal rendering, scroll lock, Escape dismiss, Tab focus trap, safe backdrop press handling, and optional `BorderBeam`.
  - [Toaster.tsx](src/components/Toaster.tsx) + [src/lib/toast.ts](src/lib/toast.ts) — Unified notification stack (`info`, `success`, `accent`, `error`) rendered at `z-[110]` above dialogs.
- **Studio Controls**: [StudioControls.tsx](src/components/StudioControls.tsx) — `CategoryPill`, `StudioPanel`, `PipelineBreadcrumb`, `StudioSlider`, `StudioSkeleton`, `WorkspaceStepper`, `SavingsGauge`, `ImageLightbox`.
- **Futuristic Primitives**: [FuturisticPrimitives.tsx](src/components/FuturisticPrimitives.tsx) — `GridBeamCanvas`, `BorderBeam`, `MagneticWrap`, `TelemetryStrip`, `ScrollProgressBar`.
- **Bento & Motion**: [BentoVisuals.tsx](src/components/BentoVisuals.tsx) — `SpotlightCard`, `Reveal`, `FormatMarquee`, `Hero3DFileStack`, `LivePlayground`.
- **Workspace Primitives**: [ToolCard.tsx](src/components/ToolCard.tsx), [UploadArea.tsx](src/components/UploadArea.tsx), [BeforeAfterSlider.tsx](src/components/BeforeAfterSlider.tsx), [DeveloperContact.tsx](src/components/DeveloperContact.tsx).
- **Domain Editors**: `src/components/image/*`, `src/components/tool/ToolResultsSection.tsx`, `VisualCrop.tsx`, `PdfPageGrid.tsx`, `PdfStudio.tsx`, `OfficePickers.tsx`.

---

## 3. Frameworks & Libraries

- **UI**: React 19.3 + TypeScript 5.9 + React Router 8.5
- **Styling**: Tailwind CSS 4.3 (`@tailwindcss/vite`)
- **Fonts**: Self-hosted `@fontsource/sora` (`600, 700, 800`), `@fontsource/manrope` (`400–800`), `@fontsource/jetbrains-mono` (`500, 700`) imported in [src/main.tsx](src/main.tsx)
- **Build & Budgets**: Vite 8.3 (Rolldown chunk groups in [vite.config.ts](vite.config.ts)), enforced by `npm run bundle:check` (`<=120 KB` initial JS gzip, `<=40 KB` initial CSS gzip, lazy-only engine chunks)
- **Testing**: Vitest 5.1 + Testing Library + Node engine tests

---

## 4. Asset Management

- **Public assets** (`public/`): `icon.svg` (gradient Stethoscope brand mark), `manifest.webmanifest`, `sw.js`, `robots.txt`, `sitemap.xml`, `_headers`, `_redirects`.
- **Zero raster marketing assets**: Visual depth relies on CSS 3D transforms, SVG gradients, and `GridBeamCanvas` (Canvas 2D, auto-paused during scroll / offscreen / reduced-motion).
- **Code splitting**: Route-level lazy imports in [src/App.tsx](src/App.tsx) and editor-level lazy imports in [src/pages/ToolPage.tsx](src/pages/ToolPage.tsx).

---

## 5. Icon System

- **Library**: `lucide-react` (`^1.69.0`), referenced via `LucideIcon` in [src/data/tools.ts](src/data/tools.ts).
- **Sizes**: `h-3.5 w-3.5` (badges/chips), `h-4 w-4` / `h-4.5 w-4.5` (buttons/nav), `h-5 w-5` (cards/dropdowns), `h-7 w-7` (tool header/dropzone).
- **Brand marks**: Only platform marks missing from Lucide (GitHub, Discord in `DeveloperContact.tsx`) are inlined as accessible SVGs with `aria-hidden="true"`.

---

## 6. Styling Approach & Motion

- **Tailwind v4 utilities + `@layer components`** in [src/index.css](src/index.css): `.btn-primary`, `.btn-accent`, `.btn-ghost`, `.btn-shimmer`, `.bento-card`, `.glass-spatial`, `.glass-bar`, `.input`, `.chip`, `.cat-pill`, `.kbd-key`, `.studio-range`, `.segmented-track`, `.segmented-pill`, `.display-hero`, `.display-section`, `.display-card`.
- **60/120fps Circular Theme Reveal**: Theme toggles use `runThemeTransition()` ([src/lib/viewTransition.ts](src/lib/viewTransition.ts)) with `flushSync` + `html.theme-transitioning` (suppressing per-element transitions, ambient loops, and `backdrop-filter` readbacks during capture) and Web Animations API `clipPath` playback on `::view-transition-new(root)` from the clicked button origin, falling back cleanly under `prefers-reduced-motion: reduce`.
- **Accessibility**: Global `:focus-visible` outline (`2px solid var(--color-accent)`), `prefers-reduced-motion: reduce` kill switch, WCAG AA category pills, and keyboard focus trapping in `StudioDialog`.

---

## 7. Project Structure

```text
src/
├── main.tsx              # Pre-paint theme/accent/meta-theme-color init, Fontsource imports, SW
├── App.tsx               # Lazy routes + dynamic SEO/JSON-LD TitleManager
├── index.css             # @theme tokens, light/dark/accent/category modes, components, animations
├── data/tools.ts         # Single source of truth for categories & tool registry
├── components/           # Shell, StudioDialog, StudioControls, FuturisticPrimitives, editors
├── pages/                # Home, Listing, ToolPage, Static, tool/runEngine.ts
├── lib/                  # viewTransition, toast, prefs, toolPrefs, sessionHistory, smartSuggest, i18n, seo
├── processing/           # On-device PDF, image, office, OCR, crypto, archive engines
└── workers/              # Web Worker for off-main-thread image processing
```

---

## 8. Rules for Translating Figma Designs to DocDoctor Code

1. **Map Figma colors to semantic tokens first** (`bg-surface-0/1/2/3`, `text-fg-primary/secondary/muted`, `--color-accent`, `--accent-grad`) — never introduce raw hex colors for neutral surfaces or accents.
2. **Use `data-category` + `.cat-pill` / `.cat-text`** for any tool or category badge so contrast meets WCAG AA in both light and dark modes.
3. **Use Sora (`font-display`) for headings, Manrope (`font-sans`) for body, and JetBrains Mono (`font-mono tabular-nums`) for metrics, file sizes, percentages, and `<kbd className="kbd-key">`.**
4. **Wrap all modals, pickers, and fullscreen viewers in `StudioDialog`** and route all feedback banners through `showToast()`.
5. **Gate all motion** on GPU-composited properties (`transform`, `opacity`, `clip-path`) and respect `prefers-reduced-motion: reduce`.
