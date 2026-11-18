import { describe, it, expect } from 'vitest'
import {
  IMAGE_EXTRA_TOOLS,
  PASSPORT_PRESETS,
  defaultImageExtraSettings,
  type ImageExtraToolId,
} from '../../src/processing/imageExtraTypes'
import {
  mmToPx,
  mmToPt,
  resolvePassportDimensions,
  computePassportCropPixels,
  computeSheetLayout,
  patchJpegJfifDpi,
  readJpegJfifDpi,
  normalizeRedactRegion,
  boxBlurRgba,
  pixelateRgba,
  blackoutRgba,
  featherAlphaMask,
  computeCollageLayout,
  computeCoverContainRect,
  parseSvgDimensions,
  uint8ToBase64,
  formatBase64Snippet,
} from '../../src/processing/imageExtraMath'
import { BG_REMOVE_CSP_ORIGINS } from '../../src/processing/bgRemove'
import { resolveGifDimensions } from '../../src/processing/gif'

describe('imageExtraTypes & registry metadata', () => {
  it('defines all 8 required ImageExtraToolId entries with valid metadata', () => {
    const expectedIds: ImageExtraToolId[] = [
      'passport-photo',
      'heic-to-jpg',
      'blur-image',
      'image-converter',
      'image-to-base64',
      'remove-background',
      'image-collage',
      'gif-maker',
    ]
    expect(IMAGE_EXTRA_TOOLS.map((t) => t.id)).toEqual(expectedIds)
    for (const tool of IMAGE_EXTRA_TOOLS) {
      expect(tool.name.length).toBeGreaterThan(3)
      expect(tool.description.length).toBeGreaterThan(15)
      expect(tool.accept).toMatch(/^\./)
      expect(tool.maxSizeMB).toBeGreaterThanOrEqual(20)
      expect(tool.engine.length).toBeGreaterThan(3)
    }
  })

  it('provides sensible default settings for all 8 tools', () => {
    expect(defaultImageExtraSettings.passport.dpi).toBe(300)
    expect(defaultImageExtraSettings.heic.outputFormat).toBe('image/jpeg')
    expect(defaultImageExtraSettings.blur.regions.length).toBeGreaterThan(0)
    expect(defaultImageExtraSettings.bgRemove.modelId).toBe('Xenova/modnet')
    expect(PASSPORT_PRESETS.length).toBeGreaterThanOrEqual(8)
  })
})

describe('passport photo math & sheet tiling layout', () => {
  it('converts mm to pixels at 300 DPI and points at 72 DPI accurately', () => {
    // 35 x 45 mm @ 300 DPI => 413 x 531 px
    expect(mmToPx(35, 300)).toBe(413)
    expect(mmToPx(45, 300)).toBe(531)
    // US 2x2 inch (50.8 mm) @ 300 DPI => 600 x 600 px
    expect(mmToPx(50.8, 300)).toBe(600)
    // 25.4 mm = 1 inch = 72 pt
    expect(mmToPt(25.4)).toBeCloseTo(72, 5)
  })

  it('resolves preset and custom passport dimensions', () => {
    const india = resolvePassportDimensions('in-passport', 30, 40, 300)
    expect(india.widthPx).toBe(413)
    expect(india.heightPx).toBe(531)

    const us = resolvePassportDimensions('us-passport', 30, 40, 300)
    expect(us.widthPx).toBe(600)
    expect(us.heightPx).toBe(600)

    const custom = resolvePassportDimensions('custom', 40, 50, 300)
    expect(custom.widthMm).toBe(40)
    expect(custom.heightMm).toBe(50)
    expect(custom.widthPx).toBe(mmToPx(40, 300))
    expect(custom.heightPx).toBe(mmToPx(50, 300))
  })

  it('locks source crop rectangle to target aspect ratio and respects zoom & pan', () => {
    const targetAspect = 35 / 45
    const base = computePassportCropPixels(1200, 1600, targetAspect, {
      zoom: 1,
      panX: 0,
      panY: 0,
    })
    expect(base.sw / base.sh).toBeCloseTo(targetAspect, 2)
    expect(base.sx).toBeGreaterThanOrEqual(0)
    expect(base.sy).toBeGreaterThanOrEqual(0)

    const zoomed = computePassportCropPixels(1200, 1600, targetAspect, {
      zoom: 2,
      panX: -100,
      panY: 100,
    })
    expect(Math.abs(zoomed.sw - base.sw / 2)).toBeLessThanOrEqual(1)
    expect(Math.abs(zoomed.sh - base.sh / 2)).toBeLessThanOrEqual(1)
    expect(zoomed.sx).toBe(0)
    expect(zoomed.sy + zoomed.sh).toBeLessThanOrEqual(1600)
  })

  it('computes printable sheet tiling for 4x6 inch and A4 pages', () => {
    // 35x45 mm on 4x6 landscape (152.4 x 101.6 mm) with 2mm gap and 3mm margin => 4 cols x 2 rows = 8 copies
    const sheet4x6 = computeSheetLayout({
      sheetPreset: '4x6',
      photoWidthMm: 35,
      photoHeightMm: 45,
      gapMm: 2,
      marginMm: 3,
      copies: 8,
      dpi: 300,
    })
    expect(sheet4x6.cols).toBe(4)
    expect(sheet4x6.rows).toBe(2)
    expect(sheet4x6.maxCapacity).toBe(8)
    expect(sheet4x6.cells.length).toBe(8)
    // First cell should have positive centered offsets and valid PDF coordinates
    expect(sheet4x6.cells[0].xMm).toBeGreaterThanOrEqual(3)
    expect(sheet4x6.cells[0].pdfYPt).toBeGreaterThan(0)

    // A4 portrait (210 x 297 mm) can fit 5 cols x 5 rows = 25 copies of 35x45 mm
    const sheetA4 = computeSheetLayout({
      sheetPreset: 'a4',
      photoWidthMm: 35,
      photoHeightMm: 45,
      gapMm: 3,
      marginMm: 8,
      copies: 12,
      dpi: 300,
    })
    expect(sheetA4.maxCapacity).toBeGreaterThanOrEqual(20)
    expect(sheetA4.cells.length).toBe(12)
  })
})

describe('JPEG JFIF APP0 DPI patcher', () => {
  it('patches an existing JFIF APP0 segment in-place to 300 DPI', () => {
    // Handcrafted JPEG with SOI + APP0 JFIF at 72 DPI + fake DQT/EOI
    const original = new Uint8Array([
      0xff, 0xd8, // SOI
      0xff, 0xe0, // APP0
      0x00, 0x10, // length 16
      0x4a, 0x46, 0x49, 0x46, 0x00, // "JFIF\0"
      0x01, 0x01, // v1.01
      0x00, // units = 0 (aspect only)
      0x00, 0x48, // Xdensity = 72
      0x00, 0x48, // Ydensity = 72
      0x00, 0x00, // thumb 0x0
      0xff, 0xdb, 0x00, 0x04, 0x11, 0x22, // body
      0xff, 0xd9, // EOI
    ])

    const patched = patchJpegJfifDpi(original, 300)
    expect(patched.length).toBe(original.length)
    const info = readJpegJfifDpi(patched)
    expect(info).toEqual({ units: 1, xDpi: 300, yDpi: 300 })
    // Trailing body bytes remain intact
    expect(patched[patched.length - 2]).toBe(0xff)
    expect(patched[patched.length - 1]).toBe(0xd9)
  })

  it('inserts a new 18-byte JFIF APP0 segment when none is present after SOI', () => {
    // Minimal JPEG without APP0 (starts with SOI + DQT)
    const bareJpeg = new Uint8Array([
      0xff, 0xd8,
      0xff, 0xdb, 0x00, 0x04, 0xaa, 0xbb,
      0xff, 0xd9,
    ])
    expect(readJpegJfifDpi(bareJpeg)).toBeNull()

    const patched = patchJpegJfifDpi(bareJpeg, 600)
    expect(patched.length).toBe(bareJpeg.length + 18)
    const info = readJpegJfifDpi(patched)
    expect(info).toEqual({ units: 1, xDpi: 600, yDpi: 600 })
    // Original DQT marker now starts at offset 20
    expect(patched[20]).toBe(0xff)
    expect(patched[21]).toBe(0xdb)
  })

  it('leaves non-JPEG buffers untouched', () => {
    const pngHeader = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    expect(patchJpegJfifDpi(pngHeader, 300)).toEqual(pngHeader)
  })
})

describe('destructive redaction & alpha feathering on RGBA buffers', () => {
  it('normalizes negative or out-of-bounds redaction region coordinates', () => {
    const norm = normalizeRedactRegion({
      id: 'r1',
      x: 80,
      y: 90,
      w: -30,
      h: 40,
      style: 'blur',
    })
    expect(norm.x).toBe(50)
    expect(norm.w).toBe(30)
    expect(norm.y).toBe(90)
    expect(norm.h).toBe(10)
  })

  it('destructively blurs pixels inside the target box without altering outside pixels', () => {
    const W = 8
    const H = 8
    const data = new Uint8ClampedArray(W * H * 4)
    // Left half black (0), right half white (255)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = (y * W + x) * 4
        const v = x < 4 ? 0 : 255
        data[idx] = v
        data[idx + 1] = v
        data[idx + 2] = v
        data[idx + 3] = 255
      }
    }

    // Blur central 4x4 region (x: 2..6, y: 2..6)
    boxBlurRgba(data, W, H, 2, 2, 4, 4, 2, 3)

    // Top-left corner (0,0) outside region must still be 0
    expect(data[0]).toBe(0)
    // Bottom-right corner (7,7) outside region must still be 255
    expect(data[(7 * W + 7) * 4]).toBe(255)
    // Inside the blurred boundary (x=3, y=3) must now be blended intermediate value
    const midLeft = data[(3 * W + 3) * 4]
    expect(midLeft).toBeGreaterThan(30)
    expect(midLeft).toBeLessThan(225)
  })

  it('destructively pixelates blocks into uniform average colors', () => {
    const W = 4
    const H = 4
    const data = new Uint8ClampedArray(W * H * 4)
    // Fill with distinct values
    for (let i = 0; i < W * H; i++) {
      data[i * 4] = i * 10
      data[i * 4 + 1] = 100
      data[i * 4 + 2] = 200
      data[i * 4 + 3] = 255
    }
    pixelateRgba(data, W, H, 0, 0, 4, 4, 4)
    // All 16 pixels in the 4x4 block must now share the exact same red value
    const firstR = data[0]
    for (let i = 1; i < W * H; i++) {
      expect(data[i * 4]).toBe(firstR)
    }
  })

  it('destructively blacks out a region with the chosen hex color', () => {
    const W = 4
    const H = 4
    const data = new Uint8ClampedArray(W * H * 4).fill(255)
    blackoutRgba(data, W, H, 1, 1, 2, 2, '#1d6ff2')
    // (0,0) untouched
    expect(data[0]).toBe(255)
    // (1,1) replaced with #1d6ff2 -> (29, 111, 242, 255)
    const idx = (1 * W + 1) * 4
    expect(data[idx]).toBe(0x1d)
    expect(data[idx + 1]).toBe(0x6f)
    expect(data[idx + 2]).toBe(0xf2)
    expect(data[idx + 3]).toBe(255)
  })

  it('feathers a 1-channel binary alpha mask smoothly', () => {
    const W = 6
    const H = 6
    const mask = new Uint8ClampedArray(W * H)
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        mask[y * W + x] = x >= 3 ? 255 : 0
      }
    }
    const feathered = featherAlphaMask(mask, W, H, 1)
    const boundaryVal = feathered[2 * W + 2]
    expect(boundaryVal).toBeGreaterThan(20)
    expect(boundaryVal).toBeLessThan(235)
  })
})

describe('collage layout, SVG dimension parser, Base64 formatter & helpers', () => {
  it('computes grid, horizontal, and vertical collage cell coordinates', () => {
    const grid = computeCollageLayout({
      count: 4,
      layout: 'grid',
      cols: 2,
      outputWidth: 1000,
      cellAspect: 1,
      gap: 20,
      padding: 40,
    })
    expect(grid.cols).toBe(2)
    expect(grid.rows).toBe(2)
    expect(grid.cells.length).toBe(4)
    expect(grid.cells[0].x).toBe(40)
    expect(grid.cells[1].x).toBe(40 + grid.cells[0].w + 20)

    const horiz = computeCollageLayout({
      count: 3,
      layout: 'horizontal',
      cols: 2,
      outputWidth: 900,
      cellAspect: 4 / 3,
      gap: 10,
      padding: 20,
    })
    expect(horiz.cols).toBe(3)
    expect(horiz.rows).toBe(1)

    const cover = computeCoverContainRect(2000, 1000, 500, 500, 'cover')
    expect(cover.sw).toBe(1000)
    expect(cover.sh).toBe(1000)
    expect(cover.sx).toBe(500)

    const contain = computeCoverContainRect(2000, 1000, 500, 500, 'contain')
    expect(contain.dw).toBe(500)
    expect(contain.dh).toBe(250)
    expect(contain.dy).toBe(125)
  })

  it('parses SVG viewBox when width and height attributes are missing', () => {
    const rawSvg = '<svg viewBox="0 0 200 100"><circle cx="50" cy="50" r="40"/></svg>'
    const parsed = parseSvgDimensions(rawSvg, 0, 2)
    expect(parsed.width).toBe(400)
    expect(parsed.height).toBe(200)
    expect(parsed.patchedSvg).toContain('width="400"')
    expect(parsed.patchedSvg).toContain('height="200"')

    const withTargetW = parseSvgDimensions(rawSvg, 600, 1)
    expect(withTargetW.width).toBe(600)
    expect(withTargetW.height).toBe(300)
  })

  it('formats Base64 output as Data URI, raw, HTML, CSS, and Markdown', () => {
    const raw = uint8ToBase64(new Uint8Array([72, 105])) // "Hi" -> "SGk="
    expect(raw).toBe('SGk=')

    const dataUri = formatBase64Snippet({
      rawBase64: raw,
      mime: 'image/png',
      fileName: 'logo.png',
      width: 64,
      height: 32,
      mode: 'data-uri',
    })
    expect(dataUri).toBe('data:image/png;base64,SGk=')

    const html = formatBase64Snippet({
      rawBase64: raw,
      mime: 'image/png',
      fileName: 'logo.png',
      width: 64,
      height: 32,
      mode: 'html',
    })
    expect(html).toContain('<img src="data:image/png;base64,SGk="')
    expect(html).toContain('width="64" height="32"')

    const css = formatBase64Snippet({
      rawBase64: raw,
      mime: 'image/png',
      fileName: 'logo.png',
      mode: 'css',
    })
    expect(css).toContain('background-image: url("data:image/png;base64,SGk=");')
  })

  it('exports CSP origins for background removal and resolves GIF dimensions', () => {
    expect(BG_REMOVE_CSP_ORIGINS.connectSrc).toContain('https://huggingface.co')
    expect(BG_REMOVE_CSP_ORIGINS.connectSrc).toContain('https://cdn.jsdelivr.net')

    const gifDims = resolveGifDimensions(1600, 900, {
      ...defaultImageExtraSettings.gif,
      outputWidth: 640,
      aspectMode: 'first',
    })
    expect(gifDims.width).toBe(640)
    expect(gifDims.height).toBe(360)
  })
})
