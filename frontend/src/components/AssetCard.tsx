import { Check } from '@phosphor-icons/react'
import type { Asset } from '../api/types'
import { ACCENT } from '../theme'
import { useHover } from '../hooks/useHover'
import { displayName, extLabel, formatSize } from '../lib/format'
import { rendersAsIcon } from '../lib/kind'
import { AssetThumb } from './AssetThumb'

interface Props {
  asset: Asset
  selected: boolean
  thumbSize: 128 | 256 | 512
  showExt: boolean
  /** Номер кадра внутри клипа — у раскрытых кадров анимации. */
  frameNo?: number
  /** Компактный режим: только миниатюра, без подписей и бейджей. */
  compact?: boolean
  onSelect: (e: React.MouseEvent) => void
  onOpen: (e: React.MouseEvent) => void
}

export function AssetCard({ asset, selected, thumbSize, showExt, frameNo, compact, onSelect, onOpen }: Props) {
  const { hovered, bind } = useHover()
  const dim = asset.width != null && asset.height != null ? `${asset.width} × ${asset.height}` : null
  const metaLine = [dim, formatSize(asset.size)].filter(Boolean).join(' · ')

  return (
    <div
      onClick={onSelect}
      onDoubleClick={onOpen}
      title={asset.relPath}
      {...bind}
      style={{
        background: 'var(--card)',
        borderRadius: compact ? 8 : 12,
        border: '1px solid var(--line)',
        overflow: 'hidden',
        cursor: 'pointer',
        outline: `2px solid ${selected ? ACCENT : 'transparent'}`,
        outlineOffset: -2,
        transition: 'box-shadow 0.15s ease, transform 0.15s ease',
        boxShadow: hovered ? '0 10px 28px var(--sh1)' : 'none',
        transform: hovered ? 'translateY(-2px)' : 'none',
      }}
    >
      <div style={{ position: 'relative', aspectRatio: '4 / 3', background: 'var(--well)' }}>
        <AssetThumb asset={asset} size={thumbSize} iconSize={compact ? 22 : 34} />
        {compact && rendersAsIcon(asset) && (
          <div
            title={asset.name}
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              bottom: 0,
              padding: '3px 5px 4px',
              fontSize: 9.5,
              fontWeight: 600,
              lineHeight: 1.15,
              textAlign: 'center',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              color: 'var(--ink2)',
              // мягкий скрим из фона ячейки, чтобы подпись читалась поверх иконки
              background: 'linear-gradient(to top, var(--well) 65%, transparent)',
            }}
          >
            {displayName(asset.name, showExt)}
          </div>
        )}
        {!compact && (
          <div
            className="font-mono"
            style={{
              position: 'absolute',
              right: 8,
              bottom: 8,
              fontSize: 9.5,
              fontWeight: 500,
              color: '#FFF7EA',
              background: 'rgba(20,19,16,0.62)',
              padding: '3px 7px',
              borderRadius: 5,
              letterSpacing: '0.04em',
            }}
          >
            {extLabel(asset.ext)}
          </div>
        )}
        {frameNo !== undefined && !selected && !compact && (
          <div
            className="font-mono"
            style={{
              position: 'absolute',
              left: 8,
              top: 8,
              fontSize: 9.5,
              fontWeight: 600,
              color: '#FFF7EA',
              background: 'rgba(20,19,16,0.62)',
              padding: '3px 7px',
              borderRadius: 5,
            }}
          >
            #{frameNo}
          </div>
        )}
        {selected && (
          <div
            style={{
              position: 'absolute',
              left: compact ? 5 : 8,
              top: compact ? 5 : 8,
              width: compact ? 17 : 22,
              height: compact ? 17 : 22,
              borderRadius: '50%',
              background: ACCENT,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 2px 8px rgba(0,0,0,0.25)',
            }}
          >
            <Check size={compact ? 10 : 12} weight="bold" color="#FFF9EF" />
          </div>
        )}
      </div>
      {compact ? null : (
      <div style={{ padding: '9px 12px 11px' }}>
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
            marginTop: 3,
            fontSize: 10.5,
            color: 'var(--muted)',
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {metaLine}
        </div>
      </div>
      )}
    </div>
  )
}
