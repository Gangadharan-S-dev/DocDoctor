export type ImageExtraToolId =
  | 'passport-photo'
  | 'heic-to-jpg'
  | 'blur-image'
  | 'image-converter'
  | 'image-to-base64'
  | 'image-collage'
  | 'gif-maker'

export type PassportPresetId =
  | 'in-passport'
  | 'us-passport'
  | 'uk-eu-schengen'
  | 'canada-passport'
  | 'china-visa'
  | 'in-visa'
  | 'in-pan'
  | 'in-ssc-upsc'
  | 'custom'

export interface PassportPreset {
  id: PassportPresetId
  label: string
  country: string
  widthMm: number
  heightMm: number
  description: string
}

export const PASSPORT_PRESETS: PassportPreset[] = [
  {
    id: 'in-passport',
    label: 'India Passport (35 × 45 mm)',
    country: 'IN',
    widthMm: 35,
    heightMm: 45,
    description: 'Standard ICAO Indian Passport & OCI size (3.5 × 4.5 cm)',
  },
  {
    id: 'us-passport',
    label: 'US Passport / Visa (2 × 2 in / 51 × 51 mm)',
    country: 'US',
    widthMm: 50.8,
    heightMm: 50.8,
    description: 'US Passport, Green Card & DS-160 Visa square 2×2 inch (600×600 px @ 300 DPI)',
  },
  {
    id: 'uk-eu-schengen',
    label: 'UK / EU / Schengen (35 × 45 mm)',
    country: 'EU',
    widthMm: 35,
    heightMm: 45,
    description: 'UK HMPO, Schengen Visa, Australia & Singapore standard biometric size',
  },
  {
    id: 'canada-passport',
    label: 'Canada Passport (50 × 70 mm)',
    country: 'CA',
    widthMm: 50,
    heightMm: 70,
    description: 'Canadian Passport frame size (5 × 7 cm)',
  },
  {
    id: 'china-visa',
    label: 'China Passport / Visa (33 × 48 mm)',
    country: 'CN',
    widthMm: 33,
    heightMm: 48,
    description: 'Chinese Passport and Visa application photo (3.3 × 4.8 cm)',
  },
  {
    id: 'in-visa',
    label: 'Indian e-Visa / OCI Upload (51 × 51 mm)',
    country: 'IN',
    widthMm: 50.8,
    heightMm: 50.8,
    description: 'Square 2×2 inch format required for Indian e-Visa portals',
  },
  {
    id: 'in-pan',
    label: 'India PAN Card (25 × 35 mm)',
    country: 'IN',
    widthMm: 25,
    heightMm: 35,
    description: 'NSDL / UTIITSL PAN Card application photo (2.5 × 3.5 cm)',
  },
  {
    id: 'in-ssc-upsc',
    label: 'SSC / UPSC / IBPS Exam (35 × 45 mm)',
    country: 'IN',
    widthMm: 35,
    heightMm: 45,
    description: 'Indian government exam portal photo (3.5 × 4.5 cm, often 20–50 KB limit)',
  },
  {
    id: 'custom',
    label: 'Custom Dimensions (mm)',
    country: 'CUSTOM',
    widthMm: 35,
    heightMm: 45,
    description: 'Specify custom width and height in millimeters',
  },
]

export type PassportSheetPreset = 'a4' | '4x6' | '5x7'
export type PassportOutputMode = 'single' | 'sheet-pdf' | 'sheet-jpg' | 'both'

export interface PassportSettings {
  presetId: PassportPresetId
  customWidthMm: number
  customHeightMm: number
  dpi: number
  /** Zoom factor >= 1 (1 = fit largest aspect-locked box inside source) */
  zoom: number
  /** Horizontal pan offset in [-100, 100] (0 = centered) */
  panX: number
  /** Vertical pan offset in [-100, 100] (0 = centered) */
  panY: number
  /** Background fill color for transparent inputs / padding */
  bgColor: string
  /** Inner white padding in mm around the portrait */
  paddingMm: number
  /** Thin border stroke around each photo (in px at 300 DPI) */
  borderPx: number
  borderColor: string
  /** Output selection: single JPG, printable sheet PDF, printable sheet JPG, or single + sheet */
  outputMode: PassportOutputMode
  sheetPreset: PassportSheetPreset
  copies: number
  gapMm: number
  marginMm: number
  cutMarks: boolean
  /** Optional portal max file size in KB for the single photo (0 = no limit) */
  targetSizeKB: number
  quality: number
}

export interface HeicSettings {
  outputFormat: 'image/jpeg' | 'image/png' | 'image/webp'
  quality: number
  bgColor: string
}

export type RedactStyle = 'blur' | 'pixelate' | 'blackout'

export interface RedactRegion {
  id: string
  /** Percentage 0..100 of image width */
  x: number
  /** Percentage 0..100 of image height */
  y: number
  /** Percentage 0..100 of image width */
  w: number
  /** Percentage 0..100 of image height */
  h: number
  style: RedactStyle
}

export interface BlurSettings {
  /** 'regions' draws destructive redaction boxes on the image; 'whole' blurs the entire image (supports batch) */
  scope: 'regions' | 'whole'
  defaultStyle: RedactStyle
  /** Intensity 1..100 (controls box-blur radius or pixelation block size) */
  intensity: number
  blackoutColor: string
  regions: RedactRegion[]
}

export type UniversalOutputFormat = 'image/jpeg' | 'image/png' | 'image/webp' | 'image/avif'

export interface ImageConverterSettings {
  outputFormat: UniversalOutputFormat
  quality: number
  bgColor: string
  /** For SVG inputs: rasterization width in pixels (0 = use SVG natural width * svgScale) */
  svgWidth: number
  svgScale: number
}

export type Base64FormatMode = 'data-uri' | 'raw' | 'css' | 'html' | 'markdown' | 'all'

export interface Base64Settings {
  mode: Base64FormatMode
  /** Optional max edge resize before encoding (0 = keep original file bytes when no format conversion needed) */
  maxEdge: number
  outputFormat: 'keep' | 'image/jpeg' | 'image/png' | 'image/webp'
  quality: number
}

export type CollageLayoutMode = 'grid' | 'horizontal' | 'vertical'

export interface CollageSettings {
  layout: CollageLayoutMode
  cols: number
  outputWidth: number
  /** Cell width/height aspect ratio (e.g. 1 for square, 4/3, 16/9, 3/4) */
  cellAspect: number
  fit: 'cover' | 'contain'
  gap: number
  padding: number
  cornerRadius: number
  bgColor: string
  outputFormat: 'image/jpeg' | 'image/png'
  quality: number
}

export interface GifMakerSettings {
  frameDelayMs: number
  /** 0 = loop forever, -1 = play once (no repeat), >0 = repeat N times */
  loopCount: number
  outputWidth: number
  aspectMode: 'first' | '1:1' | '4:3' | '16:9' | '9:16'
  fit: 'cover' | 'contain'
  bgColor: string
  paletteMode: 'per-frame' | 'global'
  maxColors: number
  pingPong: boolean
}

export interface ImageExtraSettings {
  passport: PassportSettings
  heic: HeicSettings
  blur: BlurSettings
  converter: ImageConverterSettings
  base64: Base64Settings
  collage: CollageSettings
  gif: GifMakerSettings
}

export const defaultImageExtraSettings: ImageExtraSettings = {
  passport: {
    presetId: 'in-passport',
    customWidthMm: 35,
    customHeightMm: 45,
    dpi: 300,
    zoom: 1,
    panX: 0,
    panY: 0,
    bgColor: '#ffffff',
    paddingMm: 0,
    borderPx: 0,
    borderColor: '#cbd5e1',
    outputMode: 'both',
    sheetPreset: '4x6',
    copies: 8,
    gapMm: 2,
    marginMm: 3,
    cutMarks: true,
    targetSizeKB: 0,
    quality: 92,
  },
  heic: {
    outputFormat: 'image/jpeg',
    quality: 92,
    bgColor: '#ffffff',
  },
  blur: {
    scope: 'regions',
    defaultStyle: 'blur',
    intensity: 55,
    blackoutColor: '#0f172a',
    regions: [
      { id: 'reg-1', x: 20, y: 25, w: 60, h: 25, style: 'blur' },
    ],
  },
  converter: {
    outputFormat: 'image/webp',
    quality: 90,
    bgColor: '#ffffff',
    svgWidth: 0,
    svgScale: 2,
  },
  base64: {
    mode: 'data-uri',
    maxEdge: 0,
    outputFormat: 'keep',
    quality: 88,
  },
  collage: {
    layout: 'grid',
    cols: 2,
    outputWidth: 1600,
    cellAspect: 1,
    fit: 'cover',
    gap: 16,
    padding: 24,
    cornerRadius: 16,
    bgColor: '#ffffff',
    outputFormat: 'image/jpeg',
    quality: 92,
  },
  gif: {
    frameDelayMs: 400,
    loopCount: 0,
    outputWidth: 640,
    aspectMode: 'first',
    fit: 'cover',
    bgColor: '#0f172a',
    paletteMode: 'per-frame',
    maxColors: 256,
    pingPong: false,
  },
}

export const IMAGE_EXTRA_TOOLS: Array<{
  id: ImageExtraToolId
  name: string
  description: string
  accept: string
  acceptLabel: string
  maxSizeMB: number
  multiple: boolean
  engine: string
  popular?: boolean
}> = [
  {
    id: 'passport-photo',
    name: 'Passport Photo Maker',
    description:
      'Create official passport, visa, PAN & exam photos (India, US, UK, EU, Canada, China) at exact 300 DPI dimensions with biometric head guide and printable A4 / 4×6 sheets.',
    accept: '.jpg,.jpeg,.png,.webp',
    acceptLabel: 'JPG, PNG, WebP',
    maxSizeMB: 50,
    multiple: false,
    engine: 'Canvas 300 DPI + JFIF patcher + pdf-lib sheet (browser)',
    popular: true,
  },
  {
    id: 'heic-to-jpg',
    name: 'HEIC to JPG Converter',
    description:
      'Convert iPhone & iPad HEIC/HEIF photos to JPG, PNG or WebP in batches directly in your browser.',
    accept: '.heic,.heif',
    acceptLabel: 'HEIC, HEIF',
    maxSizeMB: 80,
    multiple: true,
    engine: 'Native ImageBitmap + libheif WASM fallback (browser)',
    popular: true,
  },
  {
    id: 'blur-image',
    name: 'Blur & Redact Image',
    description:
      'Destructively blur, pixelate, or black out sensitive text, faces, and license plates with multi-region boxes or whole-image blur.',
    accept: '.jpg,.jpeg,.png,.webp',
    acceptLabel: 'JPG, PNG, WebP',
    maxSizeMB: 50,
    multiple: true,
    engine: 'Multi-pass RGBA box blur & pixelate (browser)',
    popular: true,
  },
  {
    id: 'image-converter',
    name: 'Universal Image Converter',
    description:
      'Convert between JPG, PNG, WebP, AVIF, GIF, BMP, ICO and vector SVG with custom SVG raster scaling and background fill.',
    accept: '.jpg,.jpeg,.png,.webp,.avif,.gif,.bmp,.ico,.svg',
    acceptLabel: 'JPG, PNG, WebP, AVIF, GIF, BMP, ICO, SVG',
    maxSizeMB: 50,
    multiple: true,
    engine: 'Canvas + SVG rasterizer + AVIF WASM (browser)',
    popular: true,
  },
  {
    id: 'image-to-base64',
    name: 'Image to Base64',
    description:
      'Encode images into Base64 Data URIs, raw strings, CSS background snippets, or HTML <img> tags with instant copy and optional pre-resize.',
    accept: '.jpg,.jpeg,.png,.webp,.gif,.svg,.ico,.avif',
    acceptLabel: 'JPG, PNG, WebP, GIF, SVG, ICO, AVIF',
    maxSizeMB: 30,
    multiple: true,
    engine: 'FileReader + Canvas pre-scaler (browser)',
  },
  {
    id: 'image-collage',
    name: 'Image Collage Maker',
    description:
      'Combine 2 to 12 photos into customizable grid, horizontal, or vertical collages with adjustable spacing, rounded corners, and background color.',
    accept: '.jpg,.jpeg,.png,.webp',
    acceptLabel: 'JPG, PNG, WebP',
    maxSizeMB: 50,
    multiple: true,
    engine: 'Canvas layout compositor (browser)',
  },
  {
    id: 'gif-maker',
    name: 'Animated GIF Maker',
    description:
      'Turn a sequence of images into an animated GIF with adjustable frame delay, loop count, color quantization palette, and ping-pong playback.',
    accept: '.jpg,.jpeg,.png,.webp',
    acceptLabel: 'JPG, PNG, WebP',
    maxSizeMB: 50,
    multiple: true,
    engine: 'gifenc PNN quantizer + LZW encoder (browser)',
  },
]
