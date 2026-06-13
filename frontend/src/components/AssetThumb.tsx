import { useState } from 'react'
import { modelThumbUrl, thumbUrl } from '../api/client'
import type { Asset } from '../api/types'
import { canViewModel } from '../lib/three/modelFormats'
import { displayKind, isThumbable, KIND_META } from '../lib/kind'

interface Props {
  asset: Asset
  /** Requested thumbnail size; the backend serves 128 / 256 / 512. */
  size: 128 | 256 | 512
  iconSize?: number
}

/**
 * Image assets render a real cached thumbnail; 3D models render a WebGL-generated
 * preview (created on first sight, then cached server-side); every other kind shows
 * its display-kind icon. Decode/generate failures fall back to the icon.
 */
export function AssetThumb({ asset, size, iconSize = 30 }: Props) {
  const dk = displayKind(asset)
  const Icon = KIND_META[dk].Icon

  if (asset.kind === 'model' && canViewModel(asset.ext)) {
    // key по (id, mtime, size): карточки переиспользуются при скролле — так состояние сбрасывается
    return <ModelThumb key={`${asset.id}:${asset.mtime}:${size}`} asset={asset} size={size} iconSize={iconSize} />
  }

  if (isThumbable(asset)) {
    return <ImageThumb asset={asset} size={size} iconSize={iconSize} />
  }

  return <IconFill Icon={Icon} iconSize={iconSize} />
}

function ImageThumb({ asset, size, iconSize }: Required<Props>) {
  // failed привязан к id: при подмене ассета (hover-превью кадров) битый кадр
  // не должен навсегда заменять миниатюру иконкой
  const [failedId, setFailedId] = useState<number | null>(null)
  const [pixelated, setPixelated] = useState(false)
  const Icon = KIND_META[displayKind(asset)].Icon

  if (failedId === asset.id) return <IconFill Icon={Icon} iconSize={iconSize} />

  return (
    <img
      src={thumbUrl(asset, size)}
      alt={asset.name}
      draggable={false}
      loading="lazy"
      onError={() => setFailedId(asset.id)}
      onLoad={(e) => {
        // мелкий пиксель-арт, растянутый больше натурального размера, рисуем по соседнему пикселю
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

type ModelState = 'loading' | 'ready' | 'icon'

/**
 * Миниатюра 3D-модели. Сначала пытается загрузить кэш с бэка; при 404 один раз
 * рендерит превью в WebGL и заливает (см. thumbnailer), затем перезапрашивает.
 * Пока кэша нет — показывает иконку куба.
 */
function ModelThumb({ asset, size, iconSize }: Required<Props>) {
  const [state, setState] = useState<ModelState>('loading')
  const [gen, setGen] = useState(0)
  const Icon = KIND_META.model.Icon

  const src = modelThumbUrl(asset, size) + (gen > 0 ? `&g=${gen}` : '')

  return (
    <>
      {state !== 'icon' && (
        <img
          key={src}
          src={src}
          alt={asset.name}
          draggable={false}
          loading="lazy"
          onLoad={() => setState('ready')}
          onError={() => {
            if (gen === 0) {
              // нет кэша — рендерим мастер-превью в WebGL и пробуем ещё раз
              import('../lib/three/thumbnailer')
                .then((m) => m.ensureModelThumb(asset))
                .then((ok) => (ok ? setGen(1) : setState('icon')))
                .catch(() => setState('icon'))
            } else {
              setState('icon')
            }
          }}
          style={{
            position: 'absolute',
            inset: 0,
            width: '100%',
            height: '100%',
            objectFit: 'contain',
            opacity: state === 'ready' ? 1 : 0,
            transition: 'opacity 0.2s ease',
          }}
        />
      )}
      {state !== 'ready' && <IconFill Icon={Icon} iconSize={iconSize} />}
    </>
  )
}

function IconFill({ Icon, iconSize }: { Icon: typeof KIND_META.model.Icon; iconSize: number }) {
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
