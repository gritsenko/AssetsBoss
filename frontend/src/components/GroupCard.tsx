import { CaretDown, CaretRight, Check } from '@phosphor-icons/react'
import { useCallback, useMemo } from 'react'
import { thumbUrl } from '../api/client'
import type { Asset } from '../api/types'
import { ACCENT } from '../theme'
import { useAnimGroup } from '../hooks/useAnimGroup'
import { useHover } from '../hooks/useHover'
import { useHoverAnim } from '../hooks/useHoverAnim'
import { type Entry, entryCounts, entryTitle, previewFrames } from '../lib/anim'
import { formatDate, formatSize } from '../lib/format'
import { AnimIcon, ClipIcon } from './AnimIcon'
import { AssetThumb } from './AssetThumb'

/** Карточки/строки для групп анимаций и клипов: обложка-«стопка», счётчики, раскрытие. */

type GroupEntry = Extract<Entry, { type: 'group' | 'clip' }>

/** Бейдж типа: иконка без текста (группа — своя, клип — slideshow). */
function TypeBadge({ entry, size }: { entry: GroupEntry; size: number }) {
  return entry.type === 'group' ? <AnimIcon size={size} /> : <ClipIcon size={size} />
}

/**
 * Hover-превью: при наведении лениво грузим состав группы и зацикленно гоним
 * кадры в миниатюре. Пока кадры не пришли, показывается обложка.
 */
function useHoverPreview(entry: GroupEntry, hovered: boolean, thumbSize: 128 | 256 | 512) {
  const { data: detail } = useAnimGroup(hovered ? entry.ref : null)
  const frames = useMemo(() => previewFrames(entry, detail), [entry, detail])
  const urlOf = useCallback((f: Asset) => thumbUrl(f, thumbSize), [thumbSize])
  return useHoverAnim(frames, hovered, urlOf)
}

/** Эффект стопки: пара «листов» позади верхней грани карточки. */
function deckShadow(double: boolean): string {
  const sheet1 = '0 -4px 0 -3px var(--card), 0 -5px 0 -3px var(--line3)'
  const sheet2 = '0 -9px 0 -7px var(--card), 0 -10px 0 -7px var(--line3)'
  return double ? `${sheet1}, ${sheet2}` : sheet1
}

export function GroupCard({
  entry,
  selected,
  thumbSize,
  compact,
  onSelect,
  onOpen,
  onToggleExpand,
}: {
  entry: GroupEntry
  selected: boolean
  thumbSize: 128 | 256 | 512
  compact?: boolean
  onSelect: (e: React.MouseEvent) => void
  onOpen: (e: React.MouseEvent) => void
  onToggleExpand: () => void
}) {
  const { hovered, bind } = useHover()
  const preview = useHoverPreview(entry, hovered, thumbSize)
  const deck = deckShadow(entry.type === 'group')

  return (
    <div
      onClick={onSelect}
      onDoubleClick={onOpen}
      title={`${entryTitle(entry)} — ${entryCounts(entry)}`}
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
        boxShadow: hovered ? `${deck}, 0 10px 28px var(--sh1)` : deck,
        transform: hovered ? 'translateY(-2px)' : 'none',
      }}
    >
      <div style={{ position: 'relative', aspectRatio: '4 / 3', background: 'var(--well)' }}>
        <AssetThumb asset={preview ?? entry.asset} size={thumbSize} iconSize={compact ? 22 : 34} />

        <div
          title={entry.type === 'group' ? 'Animation' : 'Clip'}
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
          <TypeBadge entry={entry} size={compact ? 10 : 13} />
        </div>

        <button
          type="button"
          title={entry.expanded ? 'Collapse' : `Expand ${entry.type === 'group' ? 'animations' : 'frames'}`}
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
          <div
            style={{
              fontSize: 13,
              fontWeight: 600,
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
          >
            {entryTitle(entry)}
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
            {entryCounts(entry)}
          </div>
        </div>
      )}
    </div>
  )
}

export function GroupRow({
  entry,
  selected,
  onSelect,
  onOpen,
  onToggleExpand,
}: {
  entry: GroupEntry
  selected: boolean
  onSelect: (e: React.MouseEvent) => void
  onOpen: (e: React.MouseEvent) => void
  onToggleExpand: () => void
}) {
  const { hovered, bind } = useHover()
  const preview = useHoverPreview(entry, hovered, 128)

  return (
    <div
      onClick={onSelect}
      onDoubleClick={onOpen}
      title={`${entryTitle(entry)} — ${entryCounts(entry)}`}
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
        title={entry.expanded ? 'Collapse' : 'Expand'}
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
        <AssetThumb asset={preview ?? entry.asset} size={128} iconSize={20} />
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
          {entryTitle(entry)}
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
          {entryCounts(entry)}
        </div>
      </div>
      <div
        title={entry.type === 'group' ? 'Animation' : 'Clip'}
        style={{ width: 64, display: 'flex', alignItems: 'center', color: ACCENT, flex: '0 0 auto' }}
      >
        <TypeBadge entry={entry} size={14} />
      </div>
      <div
        className="font-mono"
        style={{ width: 76, textAlign: 'right', fontSize: 10.5, color: 'var(--muted)', flex: '0 0 auto' }}
      >
        {formatSize(entry.asset.size)}
      </div>
      <div
        className="font-mono"
        style={{ width: 76, textAlign: 'right', fontSize: 10.5, color: 'var(--muted)', flex: '0 0 auto' }}
      >
        {formatDate(entry.asset.mtime)}
      </div>
    </div>
  )
}
