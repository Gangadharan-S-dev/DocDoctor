import type { JSX } from 'react'
import type {
  ImageExtraToolId,
  ImageExtraSettings,
} from '../../processing/imageExtraTypes'
import PassportPhotoPanel from './PassportPhotoPanel'
import BlurRedactPanel from './BlurRedactPanel'
import {
  HeicConverterPanel,
  ImageConverterPanel,
  ImageToBase64Panel,
} from './HeicAndConvertPanels'
import {
  ImageCollagePanel,
  GifMakerPanel,
} from './CreativePanels'

export interface ImageExtraPanelProps {
  toolId: ImageExtraToolId
  files: File[]
  value: ImageExtraSettings
  onChange: (v: ImageExtraSettings) => void
}

export default function ImageExtraPanel({
  toolId,
  files,
  value,
  onChange,
}: ImageExtraPanelProps): JSX.Element {
  switch (toolId) {
    case 'passport-photo':
      return (
        <PassportPhotoPanel
          file={files[0]}
          value={value.passport}
          onChange={(passport) => onChange({ ...value, passport })}
        />
      )

    case 'heic-to-jpg':
      return (
        <HeicConverterPanel
          files={files}
          value={value.heic}
          onChange={(heic) => onChange({ ...value, heic })}
        />
      )

    case 'blur-image':
      return (
        <BlurRedactPanel
          files={files}
          value={value.blur}
          onChange={(blur) => onChange({ ...value, blur })}
        />
      )

    case 'image-converter':
      return (
        <ImageConverterPanel
          files={files}
          value={value.converter}
          onChange={(converter) => onChange({ ...value, converter })}
        />
      )

    case 'image-to-base64':
      return (
        <ImageToBase64Panel
          files={files}
          value={value.base64}
          onChange={(base64) => onChange({ ...value, base64 })}
        />
      )

    case 'image-collage':
      return (
        <ImageCollagePanel
          files={files}
          value={value.collage}
          onChange={(collage) => onChange({ ...value, collage })}
        />
      )

    case 'gif-maker':
      return (
        <GifMakerPanel
          files={files}
          value={value.gif}
          onChange={(gif) => onChange({ ...value, gif })}
        />
      )
  }
}
