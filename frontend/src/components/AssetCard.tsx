import { thumbUrl } from '../api/client'
import type { Asset } from '../api/types'

const KIND_ICONS: Record<string, string> = {
  audio: '🔊',
  model: '🧊',
  other: '📄',
}

interface Props {
  asset: Asset
  selected: boolean
  onSelect: (asset: Asset) => void
}

export function AssetCard({ asset, selected, onSelect }: Props) {
  const thumbable = asset.kind === 'image' && !['.svg', '.psd'].includes(asset.ext.toLowerCase())

  return (
    <button
      onClick={() => onSelect(asset)}
      className={`flex h-full w-full flex-col overflow-hidden rounded-lg border text-left ${
        selected
          ? 'border-blue-500 bg-blue-600/10'
          : 'border-zinc-800 bg-zinc-900 hover:border-zinc-600'
      }`}
      title={asset.relPath}
    >
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-hidden bg-zinc-950/60">
        {thumbable ? (
          <img
            src={thumbUrl(asset, 256)}
            alt={asset.name}
            loading="lazy"
            className="max-h-full max-w-full object-contain"
            style={{ imageRendering: 'pixelated' }}
            onError={(e) => {
              // битый/недекодируемый файл — заменяем иконкой
              const el = e.currentTarget
              el.style.display = 'none'
              el.parentElement!.insertAdjacentHTML('beforeend', '<span class="text-3xl">🖼️</span>')
            }}
          />
        ) : (
          <span className="text-3xl">{KIND_ICONS[asset.kind] ?? '📄'}</span>
        )}
      </div>
      <div className="shrink-0 px-2 py-1">
        <p className="truncate text-xs text-zinc-300">{asset.name}</p>
      </div>
    </button>
  )
}
