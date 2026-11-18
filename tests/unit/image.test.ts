import { describe, expect, it } from 'vitest'
import {
  applySauvolaThreshold,
   applyScanEnhancement,
  detectQuadFromRgba,
  encodePngQuantized,
  formatOutputName,
  parseImageContainerMetadata,
  parseJpegContainerMeta,
  parsePngContainerMeta,
  parseWebpContainerMeta,
  searchQualityForTarget,
  stripJpegMetadataBytes,
  stripPngMetadataBytes,
  stripWebpMetadataBytes,
} from '../../src/processing/image'
import { qualityToPngColors } from '../../src/processing/codecs'
import { IMPLEMENTED_IDS, toolById } from '../../src/data/tools'

/** Build a synthetic little-endian TIFF/EXIF payload with Make, Orientation, and X/Y Resolution. */
function makeLittleEndianTiff(opts?: { make?: string; orientation?: number; dpi?: number }): Uint8Array {
  const makeStr = (opts?.make ?? 'DocCam') + '\0'
  const makeBytes = new TextEncoder().encode(makeStr)
  const makePaddedLen = Math.max(8, Math.ceil(makeBytes.length / 2) * 2)

  // Header (8) + numEntries (2) + 4 entries * 12 (48) + nextIFD (4) = 62 bytes
  // Data area starts at offset 64:
  // [64..64+makePaddedLen]: make ASCII
  // [64+makePaddedLen..+8]: XResolution rational (dpi/1)
  // [64+makePaddedLen+8..+8]: YResolution rational (dpi/1)
  const dataStart = 64
  const xResOff = dataStart + makePaddedLen
  const yResOff = xResOff + 8
  const totalLen = yResOff + 8
  const buf = new ArrayBuffer(totalLen)
  const view = new DataView(buf)
  const bytes = new Uint8Array(buf)

  // 'II' + 0x002A + IFD0 offset (8)
  view.setUint16(0, 0x4949, false)
  view.setUint16(2, 0x002a, true)
  view.setUint32(4, 8, true)

  const entries = [
    // Make (0x010F), ASCII (2), count, offset
    { tag: 0x010f, type: 2, count: makeBytes.length, val: dataStart },
    // Orientation (0x0112), SHORT (3), 1, value
    { tag: 0x0112, type: 3, count: 1, val: opts?.orientation ?? 6 },
    // XResolution (0x011A), RATIONAL (5), 1, offset
    { tag: 0x011a, type: 5, count: 1, val: xResOff },
    // YResolution (0x011B), RATIONAL (5), 1, offset
    { tag: 0x011b, type: 5, count: 1, val: yResOff },
  ]

  view.setUint16(8, entries.length, true)
  entries.forEach((e, idx) => {
    const p = 10 + idx * 12
    view.setUint16(p, e.tag, true)
    view.setUint16(p + 2, e.type, true)
    view.setUint32(p + 4, e.count, true)
    if (e.type === 3 && e.count === 1) {
      view.setUint16(p + 8, e.val, true)
    } else {
      view.setUint32(p + 8, e.val, true)
    }
  })

  bytes.set(makeBytes, dataStart)
  const dpi = opts?.dpi ?? 300
  view.setUint32(xResOff, dpi, true)
  view.setUint32(xResOff + 4, 1, true)
  view.setUint32(yResOff, dpi, true)
  view.setUint32(yResOff + 4, 1, true)

  return bytes
}

/** Build a minimal synthetic ICC v2 profile with a 'desc' tag. */
function makeMinimalIccProfile(description: string): Uint8Array {
  const ascii = new TextEncoder().encode(description + '\0')
  const descTagSize = 12 + ascii.length
  const total = 132 + 12 + descTagSize
  const buf = new ArrayBuffer(total)
  const view = new DataView(buf)
  const bytes = new Uint8Array(buf)

  view.setUint32(0, total, false)
  view.setUint32(36, 0x61637370, false) // 'acsp'
  view.setUint32(128, 1, false) // 1 tag
  // Tag record: 'desc', offset 144, size descTagSize
  view.setUint32(132, 0x64657363, false)
  view.setUint32(136, 144, false)
  view.setUint32(140, descTagSize, false)
  // 'desc' type header at 144
  view.setUint32(144, 0x64657363, false)
  view.setUint32(148, 0, false)
  view.setUint32(152, ascii.length, false)
  bytes.set(ascii, 156)
  return bytes
}

describe('binary search target size planner (searchQualityForTarget)', () => {
  it('finds the highest quality under maxBytes in <= 7 iterations', async () => {
    let calls = 0
    // Monotonic size curve: size(q) = 10_000 + q * 90_000
    const res = await searchQualityForTarget(
      async (q) => {
        calls++
        const size = Math.round(10_000 + q * 90_000)
        return { item: `blob@${q.toFixed(3)}`, size }
      },
      { maxBytes: 50_000 },
    )
    expect(calls).toBeLessThanOrEqual(7)
    expect(res.size).toBeLessThanOrEqual(50_000)
    expect(res.size).toBeGreaterThan(44_000)
    expect(res.fits).toBe(true)
  })

  it('raises quality when result falls below minBytes in range mode (e.g. 20–50 KB)', async () => {
    // Curve: q=0.1 -> 12KB, q=0.5 -> 35KB, q=0.9 -> 68KB
    const res = await searchQualityForTarget(
      async (q) => {
        const size = Math.round(4_000 + q * 70_000)
        return { item: q, size }
      },
      { minBytes: 20 * 1024, maxBytes: 50 * 1024 },
    )
    expect(res.size).toBeGreaterThanOrEqual(20 * 1024)
    expect(res.size).toBeLessThanOrEqual(50 * 1024)
    expect(res.fits).toBe(true)
  })
})

describe('JPEG / PNG / WebP container metadata parse and lossless strip', () => {
  it('parses JPEG EXIF (Make, Orientation, DPI) + APP2 ICC profile, and losslessly strips APP1/APP13/COM while keeping APP2 ICC', () => {
    const tiff = makeLittleEndianTiff({ make: 'CanonTest', orientation: 6, dpi: 300 })
    const exifPayload = new Uint8Array(6 + tiff.length)
    exifPayload.set([0x45, 0x78, 0x69, 0x66, 0x00, 0x00], 0) // "Exif\0\0"
    exifPayload.set(tiff, 6)

    const icc = makeMinimalIccProfile('Display P3')
    const app2Payload = new Uint8Array(14 + icc.length)
    app2Payload.set(new TextEncoder().encode('ICC_PROFILE\0'), 0)
    app2Payload[12] = 1
    app2Payload[13] = 1
    app2Payload.set(icc, 14)

    const comPayload = new TextEncoder().encode('Secret comment')
    const scanData = new Uint8Array([0xff, 0xda, 0x00, 0x08, 0x01, 0x01, 0x00, 0x00, 0x3f, 0x00, 0xaa, 0xbb, 0xff, 0xd9])

    const makeSeg = (marker: number, payload: Uint8Array) => {
      const seg = new Uint8Array(4 + payload.length)
      seg[0] = 0xff
      seg[1] = marker
      const len = payload.length + 2
      seg[2] = (len >> 8) & 0xff
      seg[3] = len & 0xff
      seg.set(payload, 4)
      return seg
    }

    const segApp1 = makeSeg(0xe1, exifPayload)
    const segApp2 = makeSeg(0xe2, app2Payload)
    const segApp13 = makeSeg(0xed, new Uint8Array([1, 2, 3, 4]))
    const segCom = makeSeg(0xfe, comPayload)

    const total = 2 + segApp1.length + segApp2.length + segApp13.length + segCom.length + scanData.length
    const jpeg = new Uint8Array(total)
    jpeg[0] = 0xff
    jpeg[1] = 0xd8
    let off = 2
    for (const s of [segApp1, segApp2, segApp13, segCom, scanData]) {
      jpeg.set(s, off)
      off += s.length
    }

    const meta = parseJpegContainerMeta(jpeg.buffer)
    expect(meta.exif?.make).toBe('CanonTest')
    expect(meta.exif?.orientation).toBe(6)
    expect(meta.exif?.orientationLabel).toContain('Rotate 90° CW')
    expect(meta.dpiX).toBe(300)
    expect(meta.iccProfile).toBe('Display P3')

    const stripped = stripJpegMetadataBytes(jpeg.buffer)!
    expect(stripped).not.toBeNull()
    expect(stripped.byteLength).toBe(2 + segApp2.length + scanData.length)

    const afterMeta = parseJpegContainerMeta(stripped.buffer as ArrayBuffer)
    expect(afterMeta.exif).toBeNull()
    // ICC profile in APP2 is preserved!
    expect(afterMeta.iccProfile).toBe('Display P3')
  })

  it('parses PNG eXIf, iCCP profile name, and pHYs DPI, and strips eXIf/tEXt/iTXt/zTXt chunks byte-wise', () => {
    const pngSig = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])
    const makeChunk = (type: string, data: Uint8Array) => {
      const out = new Uint8Array(12 + data.length)
      const v = new DataView(out.buffer)
      v.setUint32(0, data.length, false)
      for (let i = 0; i < 4; i++) out[4 + i] = type.charCodeAt(i)
      out.set(data, 8)
      v.setUint32(8 + data.length, 0x12345678, false) // dummy CRC
      return out
    }

    const ihdr = makeChunk('IHDR', new Uint8Array(13))
    const iccpPayload = new Uint8Array(20)
    iccpPayload.set(new TextEncoder().encode('Adobe RGB (1998)\0'), 0)
    const iccp = makeChunk('iCCP', iccpPayload)

    // pHYs: 11811 pixels/meter = 300 DPI, unit = 1 (meter)
    const physData = new Uint8Array(9)
    const pv = new DataView(physData.buffer)
    pv.setUint32(0, 11811, false)
    pv.setUint32(4, 11811, false)
    physData[8] = 1
    const phys = makeChunk('pHYs', physData)

    const tiff = makeLittleEndianTiff({ make: 'SonyPNG', orientation: 3 })
    const exifChunk = makeChunk('eXIf', tiff)
    const textChunk = makeChunk('tEXt', new TextEncoder().encode('Author\0Alice'))
    const itxtChunk = makeChunk('iTXt', new TextEncoder().encode('XML:com.adobe.xmp\0\0\0\0\0<xmp/>'))
    const idatChunk = makeChunk('IDAT', new Uint8Array([1, 2, 3, 4]))
    const iendChunk = makeChunk('IEND', new Uint8Array(0))

    const parts = [pngSig, ihdr, iccp, phys, exifChunk, textChunk, itxtChunk, idatChunk, iendChunk]
    const total = parts.reduce((s, p) => s + p.length, 0)
    const png = new Uint8Array(total)
    let pos = 0
    for (const p of parts) {
      png.set(p, pos)
      pos += p.length
    }

    const meta = parsePngContainerMeta(png.buffer)
    expect(meta.exif?.make).toBe('SonyPNG')
    expect(meta.exif?.orientation).toBe(3)
    expect(meta.iccProfile).toBe('Adobe RGB (1998)')
    expect(meta.dpiX).toBe(300)

    const stripped = stripPngMetadataBytes(png.buffer)!
    expect(stripped).not.toBeNull()
    const after = parsePngContainerMeta(stripped.buffer as ArrayBuffer)
    expect(after.exif).toBeNull()
    expect(after.iccProfile).toBe('Adobe RGB (1998)')
    expect(after.dpiX).toBe(300)
  })

  it('parses WebP EXIF chunk and strips EXIF/XMP while updating RIFF size and VP8X flags', () => {
    const tiff = makeLittleEndianTiff({ make: 'WebPCam', orientation: 8 })
    const makeRiffChunk = (fourcc: string, payload: Uint8Array) => {
      const pad = payload.length & 1
      const out = new Uint8Array(8 + payload.length + pad)
      const v = new DataView(out.buffer)
      for (let i = 0; i < 4; i++) out[i] = fourcc.charCodeAt(i)
      v.setUint32(4, payload.length, true)
      out.set(payload, 8)
      return out
    }

    // VP8X flags byte at offset 0 of payload: set ICC(0x20) | EXIF(0x08) | XMP(0x04) = 0x2C
    const vp8xPayload = new Uint8Array(10)
    vp8xPayload[0] = 0x2c
    const vp8x = makeRiffChunk('VP8X', vp8xPayload)
    const vp8 = makeRiffChunk('VP8 ', new Uint8Array([0x10, 0x20, 0x30, 0x40]))
    const exif = makeRiffChunk('EXIF', tiff)
    const xmp = makeRiffChunk('XMP ', new TextEncoder().encode('<x:xmpmeta/>'))

    const bodyLen = 4 + vp8x.length + vp8.length + exif.length + xmp.length
    const webp = new Uint8Array(8 + bodyLen)
    const wv = new DataView(webp.buffer)
    wv.setUint32(0, 0x52494646, false) // 'RIFF'
    wv.setUint32(4, bodyLen, true)
    wv.setUint32(8, 0x57454250, false) // 'WEBP'
    let off = 12
    for (const c of [vp8x, vp8, exif, xmp]) {
      webp.set(c, off)
      off += c.length
    }

    const meta = parseWebpContainerMeta(webp.buffer)
    expect(meta.exif?.make).toBe('WebPCam')
    expect(meta.exif?.orientation).toBe(8)

    const stripped = stripWebpMetadataBytes(webp.buffer)!
    expect(stripped).not.toBeNull()
    const sv = new DataView(stripped.buffer)
    // RIFF size updated to 4 + vp8x.length + vp8.length
    expect(sv.getUint32(4, true)).toBe(4 + vp8x.length + vp8.length)
    // VP8X flags at byte 20 have EXIF (0x08) and XMP (0x04) cleared, keeping ICC (0x20)
    expect(stripped[20]).toBe(0x20)
    expect(parseImageContainerMetadata(stripped.buffer as ArrayBuffer).exif).toBeNull()
  })
})

describe('UPNG palette quantization & Sauvola adaptive threshold & quad detection', () => {
  it('quantizes RGBA buffer into a valid PNG via UPNG.js', async () => {
    const w = 16
    const h = 16
    const data = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < w * h; i++) {
      data[i * 4] = (i * 17) & 0xff
      data[i * 4 + 1] = (i * 31) & 0xff
      data[i * 4 + 2] = (i * 47) & 0xff
      data[i * 4 + 3] = 255
    }
    expect(qualityToPngColors(0.8)).toBe(192)
    expect(qualityToPngColors(1)).toBe(0)
    const pngBuf = await encodePngQuantized({ data, width: w, height: h }, 0.75, false)
    const bytes = new Uint8Array(pngBuf)
    expect(bytes[0]).toBe(0x89)
    expect(bytes[1]).toBe(0x50)
    expect(bytes[2]).toBe(0x4e)
    expect(bytes[3]).toBe(0x47)
  })

  it('applies Sauvola adaptive threshold cleanly under an illumination gradient', () => {
    const w = 32
    const h = 32
    const data = new Uint8ClampedArray(w * h * 4)
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        // Uneven lighting: paper brightness ranges from 110 on left to 240 on right
        const paper = Math.round(110 + (x / w) * 130)
        // Dark ink line at y === 16
        const isInk = y === 16 && x >= 4 && x <= 27
        const v = isInk ? Math.round(paper * 0.25) : paper
        const p = (y * w + x) * 4
        data[p] = v
        data[p + 1] = v
        data[p + 2] = v
        data[p + 3] = 255
      }
    }
    applySauvolaThreshold({ data, width: w, height: h }, { windowSize: 9, k: 0.2 })

    // Ink pixel at (16, 16) becomes pure black (0), paper pixel at (16, 8) becomes pure white (255)
    const inkIdx = (16 * w + 16) * 4
    const paperIdx = (8 * w + 16) * 4
    expect(data[inkIdx]).toBe(0)
    expect(data[paperIdx]).toBe(255)
  })

  it('normalizes uneven background in magic-color scan enhancement', () => {
    const w = 24
    const h = 24
    const data = new Uint8ClampedArray(w * h * 4)
    for (let i = 0; i < w * h; i++) {
      const p = i * 4
      // Shadowed gray-ish paper (170, 170, 170)
      data[p] = 170
      data[p + 1] = 170
      data[p + 2] = 170
      data[p + 3] = 255
    }
    // Dark ink pixel in center
    const center = (12 * w + 12) * 4
    data[center] = 30
    data[center + 1] = 30
    data[center + 2] = 30

    applyScanEnhancement({ data, width: w, height: h }, 'magic-color')
    // Background paper should be pushed near white (> 240), while center ink stays dark (< 60)
    expect(data[0]).toBeGreaterThan(240)
    expect(data[center]).toBeLessThan(60)
  })

  it('detects document quadrilateral corners on a synthetic gradient image', () => {
    const w = 80
    const h = 80
    const data = new Uint8ClampedArray(w * h * 4)
    // Dark desk background (25, 25, 30) with bright white rectangle [x: 20..60, y: 16..64]
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const inside = x >= 20 && x <= 60 && y >= 16 && y <= 64
        const v = inside ? 245 : 25
        const p = (y * w + x) * 4
        data[p] = v
        data[p + 1] = v
        data[p + 2] = v
        data[p + 3] = 255
      }
    }
    const quad = detectQuadFromRgba(data, w, h)
    // Expected in percentage: x ~ 25%..75%, y ~ 20%..80%
    expect(quad.tl.x).toBeGreaterThanOrEqual(20)
    expect(quad.tl.x).toBeLessThanOrEqual(30)
    expect(quad.tl.y).toBeGreaterThanOrEqual(15)
    expect(quad.tl.y).toBeLessThanOrEqual(26)
    expect(quad.br.x).toBeGreaterThanOrEqual(70)
    expect(quad.br.x).toBeLessThanOrEqual(82)
    expect(quad.br.y).toBeGreaterThanOrEqual(75)
    expect(quad.br.y).toBeLessThanOrEqual(86)
  })
})

describe('batch output naming pattern formatter & new tool registration', () => {
  it('replaces {name} {n} {w} {h} {ext} {date} tokens and ensures extension', () => {
    expect(
      formatOutputName('{name}-{w}x{h}-{n}.{ext}', {
        name: 'passport',
        n: 2,
        w: 200,
        h: 230,
        ext: 'jpg',
        date: '2026-11-18',
      }),
    ).toBe('passport-200x230-2.jpg')

    // Automatically appends .ext when omitted from pattern
    expect(
      formatOutputName('scan-{date}-{n}', {
        name: 'doc',
        n: 1,
        ext: 'webp',
        date: '2026-11-18',
      }),
    ).toBe('scan-2026-11-18-1.webp')
  })

  it('registers compress-image-kb and enables .webp in image-watermark', () => {
    const kbTool = toolById('compress-image-kb')
    expect(kbTool).toBeDefined()
    expect(kbTool?.popular).toBe(true)
    expect(IMPLEMENTED_IDS.has('compress-image-kb')).toBe(true)

    const wmTool = toolById('image-watermark')
    expect(wmTool?.accept).toContain('.webp')
  })
})
