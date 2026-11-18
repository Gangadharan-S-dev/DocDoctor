declare module 'gifenc' {
  export type PaletteFormat = 'rgb565' | 'rgb444' | 'rgba4444'

  export interface QuantizeOptions {
    format?: PaletteFormat
    clearAlpha?: boolean
    clearAlphaColor?: number
    clearAlphaThreshold?: number
    oneBitAlpha?: boolean | number
    useSqrt?: boolean
  }

  export interface WriteFrameOptions {
    transparent?: boolean
    transparentIndex?: number
    delay?: number
    palette?: number[][] | null
    repeat?: number
    colorDepth?: number
    dispose?: number
    first?: boolean
  }

  export interface GIFEncoderInstance {
    reset(): void
    finish(): void
    bytes(): Uint8Array
    bytesView(): Uint8Array
    writeHeader(): void
    writeFrame(
      index: Uint8Array,
      width: number,
      height: number,
      opts?: WriteFrameOptions,
    ): void
  }

  export function GIFEncoder(opt?: { initialCapacity?: number; auto?: boolean }): GIFEncoderInstance
  export function quantize(
    rgba: Uint8Array | Uint8ClampedArray,
    maxColors: number,
    opts?: QuantizeOptions,
  ): number[][]
  export function applyPalette(
    rgba: Uint8Array | Uint8ClampedArray,
    palette: number[][],
    format?: PaletteFormat,
  ): Uint8Array
}
