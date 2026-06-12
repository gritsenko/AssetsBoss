import { useState } from 'react'
import { thumbUrl } from '../api/client'
import type { Asset } from '../api/types'
import { displayKind, KIND_META } from '../lib/kind'

const NON_THUMBABLE = new Set(['.svg', '.psd'])

function isThumbable(asset: Asset): boolean {
  return asset.kind === 'image' && !NON_THUMBABLE.has(asset.ext.toLowerCase())
}

interface Props {
  asset: Asset
  /** Requested thumbnail size; the backend serves 128 / 256 / 512. */
  size: 128 | 256 | 512
  iconSize?: number
}

/**
 * Image assets render a real cached thumbnail (with an icon fallback on decode
 * failure); every other kind shows its display-kind icon centred on the well.
 */
export function AssetThumb({ asset, size, iconSize = 30 }: Props) {
  // failed привязан к id: при подмене ассета (hover-превью кадров) битый кадр
  // не должен навсегда заменять миниатюру иконкой
  const [failedId, setFailedId] = useState<number | null>(null)
  const [pixelated, setPixelated] = useState(false)
  const dk = displayKind(asset)
  const Icon = KIND_META[dk].Icon

  if (isThumbable(asset) && failedId !== asset.id) {
    return (
      <img
        src={thumbUrl(asset, size)}
        alt={asset.name}
        draggable={false}
        loading="lazy"
        onError={() => setFailedId(asset.id)}
        onLoad={(e) => {
          // картинка вписывается целиком (contain), без обрезки; мелкий пиксель-арт,
          // растянутый больше своего натурального размера, рисуем по соседнему пикселю — без размытия
          const img = e.currentTarget
          setPixelated(img.naturalWidth > 0 && img.naturalWidth < img.clientWidth)
        }}
        style={{
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          objectFit: 'contain',
          imageRendering: pixelated ? 'pixelated' : 'auto',
        }}
      />
    )
  }

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: 'var(--line3)',
      }}
    >
      <Icon size={iconSize} weight="bold" />
    </div>
  )
}
