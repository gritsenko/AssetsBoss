import { contentUrl } from '../api/client'
import type { Asset } from '../api/types'

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} КБ`
  return `${(bytes / 1024 / 1024).toFixed(1)} МБ`
}

interface Props {
  asset: Asset
  onClose: () => void
}

export function DetailPanel({ asset, onClose }: Props) {
  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-zinc-800 bg-zinc-900">
      <div className="flex items-center justify-between border-b border-zinc-800 px-3 py-2">
        <h2 className="truncate text-sm font-medium text-zinc-100" title={asset.name}>
          {asset.name}
        </h2>
        <button onClick={onClose} className="ml-2 text-zinc-500 hover:text-zinc-200">
          ✕
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        <div className="flex items-center justify-center border-b border-zinc-800 bg-zinc-950/60 p-3">
          {asset.kind === 'image' && (
            <img
              src={contentUrl(asset)}
              alt={asset.name}
              className="max-h-72 max-w-full object-contain"
              style={{ imageRendering: 'pixelated' }}
            />
          )}
          {asset.kind === 'audio' && (
            <audio controls src={contentUrl(asset)} className="w-full" preload="metadata" />
          )}
          {asset.kind === 'model' && (
            <div className="py-10 text-center text-zinc-500">
              <span className="text-5xl">🧊</span>
              <p className="mt-2 text-xs">3D-просмотр появится позже</p>
            </div>
          )}
          {asset.kind === 'other' && <span className="py-10 text-5xl">📄</span>}
        </div>

        <dl className="space-y-2 p-3 text-sm">
          <Row label="Путь" value={asset.relPath} mono />
          <Row label="Тип" value={`${asset.kind} (${asset.ext})`} />
          <Row label="Размер" value={formatSize(asset.size)} />
          {asset.width != null && asset.height != null && (
            <Row label="Разрешение" value={`${asset.width} × ${asset.height}`} />
          )}
          <Row label="Изменён" value={new Date(asset.mtime * 1000).toLocaleString('ru-RU')} />
        </dl>
      </div>
    </aside>
  )
}

function Row({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs text-zinc-500">{label}</dt>
      <dd className={`break-all text-zinc-200 ${mono ? 'font-mono text-xs' : ''}`}>{value}</dd>
    </div>
  )
}
