import { CaretDown, CaretRight, Check, Cube } from '@phosphor-icons/react'
import type { Entry } from '../lib/anim'
import { baseName, modelGroupCounts } from '../lib/anim'
import { extLabel, formatDate, formatSize } from '../lib/format'
import { ACCENT } from '../theme'
import { useHover } from '../hooks/useHover'
import { AssetThumb } from './AssetThumb'

/** Карточки/строки для групп 3D-моделей: обложка-«стопка» приоритетного формата + счётчик форматов. */

type ModelGroupEntry = Extract<Entry, { type: 'modelgroup' }>

/** Эффект стопки: пара «листов» позади верхней грани карточки. */
const DECK =
  '0 -4px 0 -3px var(--card), 0 -5px 0 -3px var(--line3), 0 -9px 0 -7px var(--card), 0 -10px 0 -7px var(--line3)'

export function ModelGroupCard({
  entry,
  selected,
  thumbSize,
  compact,
  onSelect,
  onOpen,
  onToggleExpand,
}: {
  entry: ModelGroupEntry
  selected: boolean
  thumbSize: 128 | 256 | 512
  compact?: boolean
  onSelect: (e: React.MouseEvent) => void
  onOpen: (e: React.MouseEvent) => void
  onToggleExpand: () => void
}) {
  const { hovered, bind } = useHover()
  const title = baseName(entry.asset.name)

  return (
    <div
      onClick={onSelect}
      onDoubleClick={onOpen}
      title={`${title} — ${modelGroupCounts(entry.variantCount)}`}
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
        boxShadow: hovered ? `${DECK}, 0 10px 28px var(--sh1)` : DECK,
        transform: hovered ? 'translateY(-2px)' : 'none',
      }}
    >
      <div style={{ position: 'relative', aspectRatio: '4 / 3', background: 'var(--well)' }}>
        <AssetThumb asset={entry.asset} size={thumbSize} iconSize={compact ? 22 : 34} />

        {/* бейдж группы моделей — только иконка */}
        <div
          title={`${entry.variantCount} formats · preview ${extLabel(entry.asset.ext)}`}
          style={{
            position: 'absolute',
            right: compact ? 5 : 8,
            bottom: compact ? 5 : 8,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFF9EF',
            background: ACCENT,
            padding: compact ? 3 : 4,
            borderRadius: 5,
          }}
        >
          <Cube size={compact ? 10 : 13} weight="bold" />
        </div>

        <button
          type="button"
          title={entry.expanded ? 'Collapse' : 'Expand formats'}
          onClick={(e) => {
            e.stopPropagation()
            onToggleExpand()
          }}
          style={{
            position: 'absolute',
            right: compact ? 5 : 8,
            top: compact ? 5 : 8,
            width: compact ? 20 : 24,
            height: compact ? 20 : 24,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            border: 'none',
            borderRadius: '50%',
            cursor: 'pointer',
            background: 'rgba(20,19,16,0.62)',
            color: '#FFF7EA',
          }}
        >
          {entry.expanded ? <CaretDown size={13} weight="bold" /> : <CaretRight size={13} weight="bold" />}
        </button>

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

      {!compact && (
        <div style={{ padding: '9px 12px 11px' }}>
          <div style={titleStyle}>{title}</div>
          <div className="font-mono" style={{ marginTop: 3, fontSize: 10.5, color: 'var(--muted)', ...ellipsis }}>
            {modelGroupCounts(entry.variantCount)}
          </div>
        </div>
      )}
    </div>
  )
}

export function ModelGroupRow({
  entry,
  selected,
  onSelect,
  onOpen,
  onToggleExpand,
}: {
  entry: ModelGroupEntry
  selected: boolean
  onSelect: (e: React.MouseEvent) => void
  onOpen: (e: React.MouseEvent) => void
  onToggleExpand: () => void
}) {
  const { hovered, bind } = useHover()
  const title = baseName(entry.asset.name)

  return (
    <div
      onClick={onSelect}
      onDoubleClick={onOpen}
      title={`${title} — ${modelGroupCounts(entry.variantCount)}`}
      {...bind}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
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
      <button
        type="button"
        title={entry.expanded ? 'Collapse' : 'Expand formats'}
        onClick={(e) => {
          e.stopPropagation()
          onToggleExpand()
        }}
        style={{
          width: 24,
          height: 24,
          flex: '0 0 auto',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: 'none',
          borderRadius: 6,
          cursor: 'pointer',
          background: 'transparent',
          color: 'var(--muted)',
        }}
      >
        {entry.expanded ? <CaretDown size={13} weight="bold" /> : <CaretRight size={13} weight="bold" />}
      </button>
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
        <AssetThumb asset={entry.asset} size={128} iconSize={20} />
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={titleStyle}>{title}</div>
        <div className="font-mono" style={{ marginTop: 2, fontSize: 10.5, color: 'var(--muted)', ...ellipsis }}>
          {modelGroupCounts(entry.variantCount)}
        </div>
      </div>
      <div
        title={`Preview format: ${extLabel(entry.asset.ext)}`}
        style={{ width: 64, display: 'flex', alignItems: 'center', gap: 5, color: ACCENT, flex: '0 0 auto' }}
      >
        <Cube size={14} weight="bold" />
        <span className="font-mono" style={{ fontSize: 10 }}>
          {extLabel(entry.asset.ext)}
        </span>
      </div>
      <div className="font-mono" style={{ width: 76, textAlign: 'right', fontSize: 10.5, color: 'var(--muted)', flex: '0 0 auto' }}>
        {formatSize(entry.asset.size)}
      </div>
      <div className="font-mono" style={{ width: 76, textAlign: 'right', fontSize: 10.5, color: 'var(--muted)', flex: '0 0 auto' }}>
        {formatDate(entry.asset.mtime)}
      </div>
    </div>
  )
}

const ellipsis = {
  whiteSpace: 'nowrap',
  overflow: 'hidden',
  textOverflow: 'ellipsis',
} as const

const titleStyle = { fontSize: 13, fontWeight: 600, ...ellipsis } as const
