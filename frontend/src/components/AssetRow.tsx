import type { Asset } from '../api/types'
import { ACCENT } from '../theme'
import { useHover } from '../hooks/useHover'
import { displayName, formatDate, formatSize } from '../lib/format'
import { displayKind, KIND_META, kindColor } from '../lib/kind'
import { AssetThumb } from './AssetThumb'

interface Props {
  asset: Asset
  selected: boolean
  showExt: boolean
  dark: boolean
  onSelect: (e: React.MouseEvent) => void
  onOpen: (e: React.MouseEvent) => void
}

export function AssetRow({ asset, selected, showExt, dark, onSelect, onOpen }: Props) {
  const { hovered, bind } = useHover()
  const dk = displayKind(asset)

  return (
    <div
      onClick={onSelect}
      onDoubleClick={onOpen}
      title={asset.relPath}
      {...bind}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        background: 'var(--card)',
        border: '1px solid var(--line)',
        borderRadius: 10,
        padding: '8px 16px 8px 8px',
        cursor: 'pointer',
        outline: `2px solid ${selected ? ACCENT : 'transparent'}`,
        outlineOffset: -2,
        boxShadow: hovered ? '0 6px 18px var(--sh1)' : 'none',
      }}
    >
      <div
        style={{
          position: 'relative',
          width: 64,
          height: 48,
          flex: '0 0 auto',
          borderRadius: 6,
          overflow: 'hidden',
          background: 'var(--well)',
        }}
      >
        <AssetThumb asset={asset} size={128} iconSize={20} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div
          style={{
            fontSize: 13,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {displayName(asset.name, showExt)}
        </div>
        <div
          className="font-mono"
          style={{
            marginTop: 2,
            fontSize: 10.5,
            color: 'var(--muted)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {asset.parentDir || '—'}
        </div>
      </div>
      <div
        className="font-mono"
        style={{ width: 64, fontSize: 10.5, fontWeight: 500, color: kindColor(dk, dark), flex: '0 0 auto' }}
      >
        {KIND_META[dk].badge}
      </div>
      <div
        className="font-mono"
        style={{ width: 76, textAlign: 'right', fontSize: 10.5, color: 'var(--muted)', flex: '0 0 auto' }}
      >
        {formatSize(asset.size)}
      </div>
      <div
        className="font-mono"
        style={{ width: 76, textAlign: 'right', fontSize: 10.5, color: 'var(--muted)', flex: '0 0 auto' }}
      >
        {formatDate(asset.mtime)}
      </div>
    </div>
  )
}
