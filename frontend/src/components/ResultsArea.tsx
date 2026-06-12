import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowsOut, CaretDown, CaretUp, Files, FolderOpen } from '@phosphor-icons/react'
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Asset } from '../api/types'
import { useHover } from '../hooks/useHover'
import { bandKey, type Entry } from '../lib/anim'
import { AssetCard } from './AssetCard'
import { AssetRow } from './AssetRow'
import { ContextMenu, type MenuItem } from './ContextMenu'
import { GroupCard, GroupRow } from './GroupCard'

const GAP = 16
const THUMB_MIN_FALLBACK = 216
const LIST_ROW_HEIGHT = 70
const CAPTION_HEIGHT = 54
const LIST_INDENT = 26
/** Насколько «полоса» раскрытой группы выступает за края ячеек. */
const BAND_PAD = 5

interface Props {
  entries: Entry[]
  /** Всего строк с учётом не догруженных страниц и раскрытых групп. */
  displayTotal: number
  hasMore: boolean
  isLoading: boolean
  isLoadingMore: boolean
  loadMore: () => void
  view: 'grid' | 'list'
  thumbMin: number
  showExt: boolean
  /** Компактный режим: только миниатюры, без подписей. */
  compact: boolean
  dark: boolean
  selectedKeys: Set<string>
  onSelect: (entry: Entry, e: React.MouseEvent) => void
  onOpen: (entry: Entry, e?: React.MouseEvent) => void
  onToggleExpand: (entry: Entry) => void
  onGoToFolder: (asset: Asset) => void
  onBackgroundClick: () => void
  onClearFilters: () => void
  onColumns?: (columns: number) => void
  folders?: ReactNode
}

export function ResultsArea({
  entries,
  displayTotal,
  hasMore,
  isLoading,
  isLoadingMore,
  loadMore,
  view,
  thumbMin,
  showExt,
  compact,
  dark,
  selectedKeys,
  onSelect,
  onOpen,
  onToggleExpand,
  onGoToFolder,
  onBackgroundClick,
  onClearFilters,
  onColumns,
  folders,
}: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; entry: Entry } | null>(null)

  const openMenu = useCallback(
    (entry: Entry, e: React.MouseEvent) => {
      e.preventDefault()
      onSelect(entry, e) // правый клик без модификаторов выделяет ассет
      setMenu({ x: e.clientX, y: e.clientY, entry })
    },
    [onSelect],
  )
  const gridRef = useRef<HTMLDivElement | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)
  const [width, setWidth] = useState(900)
  const [scrollMargin, setScrollMargin] = useState(0)

  const setScrollEl = useCallback((el: HTMLDivElement | null) => {
    scrollRef.current = el
    observerRef.current?.disconnect()
    observerRef.current = null
    if (el) {
      setWidth(el.clientWidth)
      const observer = new ResizeObserver(() => setWidth(el.clientWidth))
      observer.observe(el)
      observerRef.current = observer
    }
  }, [])

  // отступ виртуализованного списка от верха скроллера (под секцией папок);
  // пересчитывается при смене вида/ширины и при ре-рендере секции папок
  useLayoutEffect(() => {
    const offset = gridRef.current?.offsetTop ?? 0
    setScrollMargin((prev) => (prev === offset ? prev : offset))
  }, [folders, view, width])

  const isGrid = view === 'grid'
  const avail = width - 40 // padding 20px по бокам
  const columns = isGrid ? Math.max(1, Math.floor((avail + GAP) / ((thumbMin || THUMB_MIN_FALLBACK) + GAP))) : 1
  const cellWidth = isGrid ? Math.floor((avail - GAP * (columns - 1)) / columns) : avail
  const thumbSize: 128 | 256 | 512 = cellWidth > 220 ? 512 : cellWidth > 130 ? 256 : 128
  const rowHeight = isGrid
    ? Math.round((cellWidth * 3) / 4) + (compact ? 0 : CAPTION_HEIGHT) + GAP
    : LIST_ROW_HEIGHT
  const bandBg = dark ? 'rgba(217,110,52,0.10)' : 'rgba(217,110,52,0.07)'
  const rowCount = Math.ceil(displayTotal / columns)

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 6,
    scrollMargin,
  })

  useEffect(() => {
    virtualizer.measure()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowHeight, scrollMargin, columns])

  const virtualRows = virtualizer.getVirtualItems()
  const lastIndex = virtualRows.at(-1)?.index ?? 0
  const needed = (lastIndex + 1) * columns + columns * 3
  useEffect(() => {
    if (hasMore && !isLoadingMore && entries.length < needed) loadMore()
  }, [hasMore, isLoadingMore, entries.length, needed, loadMore])

  useEffect(() => {
    onColumns?.(columns)
  }, [columns, onColumns])

  const showEmpty = !isLoading && displayTotal === 0 && !hasMore
  const showLoading = isLoading || (displayTotal === 0 && hasMore)

  const menuItems: MenuItem[] = menu
    ? [
        ...(menu.entry.type === 'group' || menu.entry.type === 'clip'
          ? [
              {
                icon: menu.entry.expanded ? <CaretUp size={15} /> : <CaretDown size={15} />,
                label: menu.entry.expanded
                  ? 'Collapse'
                  : menu.entry.type === 'group'
                    ? 'Expand animations'
                    : 'Expand frames',
                onClick: () => onToggleExpand(menu.entry),
              },
            ]
          : []),
        {
          icon: <FolderOpen size={15} />,
          label: 'Go to folder',
          onClick: () => onGoToFolder(menu.entry.asset),
        },
        {
          icon: <ArrowsOut size={15} />,
          label: 'Open fullscreen',
          onClick: () => onOpen(menu.entry),
        },
      ]
    : []

  const renderCard = (entry: Entry) =>
    entry.type === 'group' || entry.type === 'clip' ? (
      <GroupCard
        entry={entry}
        selected={selectedKeys.has(entry.key)}
        thumbSize={thumbSize}
        compact={compact}
        onSelect={(e) => onSelect(entry, e)}
        onOpen={(e) => onOpen(entry, e)}
        onToggleExpand={() => onToggleExpand(entry)}
      />
    ) : (
      <AssetCard
        asset={entry.asset}
        selected={selectedKeys.has(entry.key)}
        thumbSize={thumbSize}
        showExt={showExt}
        frameNo={entry.type === 'frame' ? entry.frameIndex + 1 : undefined}
        compact={compact}
        onSelect={(e) => onSelect(entry, e)}
        onOpen={(e) => onOpen(entry, e)}
      />
    )

  /** Подряд идущие ячейки одной раскрытой группы — под общую цветную полосу. */
  const bandSegments = (cells: (Entry | undefined)[]) => {
    const segments: { start: number; span: number }[] = []
    let runKey: string | null = null
    let runStart = 0
    for (let col = 0; col <= cells.length; col++) {
      const key = col < cells.length && cells[col] ? bandKey(cells[col]!) : null
      if (key !== runKey) {
        if (runKey !== null) segments.push({ start: runStart, span: col - runStart })
        runKey = key
        runStart = col
      }
    }
    return segments
  }

  const renderRow = (entry: Entry) => {
    const depth = entry.type === 'clip' || entry.type === 'frame' ? entry.depth : 0
    const row =
      entry.type === 'group' || entry.type === 'clip' ? (
        <GroupRow
          entry={entry}
          selected={selectedKeys.has(entry.key)}
          onSelect={(e) => onSelect(entry, e)}
          onOpen={(e) => onOpen(entry, e)}
          onToggleExpand={() => onToggleExpand(entry)}
        />
      ) : (
        <AssetRow
          asset={entry.asset}
          selected={selectedKeys.has(entry.key)}
          showExt={showExt}
          dark={dark}
          onSelect={(e) => onSelect(entry, e)}
          onOpen={(e) => onOpen(entry, e)}
        />
      )
    return depth > 0 ? <div style={{ paddingLeft: depth * LIST_INDENT }}>{row}</div> : row
  }

  return (
    <>
      <div
        ref={setScrollEl}
        onClick={onBackgroundClick}
        style={{ flex: 1, overflowY: 'auto', padding: '8px 20px 90px', scrollbarGutter: 'stable' }}
      >
        {folders}

        {showLoading && (
          <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
            Loading…
          </div>
        )}

        {showEmpty && <EmptyState onClearFilters={onClearFilters} />}

        <div ref={gridRef} style={{ position: 'relative', height: virtualizer.getTotalSize() }}>
          {virtualRows.map((row) => {
            const top = row.start - scrollMargin
            if (isGrid) {
              const cells: (Entry | undefined)[] = []
              for (let col = 0; col < columns; col++) {
                const idx = row.index * columns + col
                if (idx >= displayTotal) break
                cells.push(entries[idx])
              }
              return (
                <div
                  key={row.key}
                  style={{
                    position: 'absolute',
                    top,
                    left: 0,
                    width: '100%',
                    display: 'flex',
                    gap: GAP,
                    height: rowHeight,
                    paddingBottom: GAP,
                  }}
                >
                  {/* общий фон раскрытой группы; полосы соседних строк смыкаются по вертикали */}
                  {bandSegments(cells).map((seg) => (
                    <div
                      key={`band-${row.index}-${seg.start}`}
                      style={{
                        position: 'absolute',
                        top: -(GAP / 2),
                        height: rowHeight,
                        left: seg.start * (cellWidth + GAP) - BAND_PAD,
                        width: seg.span * cellWidth + (seg.span - 1) * GAP + BAND_PAD * 2,
                        background: bandBg,
                        borderRadius: 10,
                      }}
                    />
                  ))}
                  {cells.map((entry, col) =>
                    entry ? (
                      <div
                        key={entry.key}
                        style={{ width: cellWidth, position: 'relative' }}
                        onContextMenu={(e) => openMenu(entry, e)}
                      >
                        {renderCard(entry)}
                      </div>
                    ) : (
                      <div
                        key={`ph-${row.index}-${col}`}
                        style={{
                          width: cellWidth,
                          height: rowHeight - GAP,
                          borderRadius: 12,
                          background: 'var(--well)',
                          opacity: 0.5,
                          position: 'relative',
                        }}
                      />
                    ),
                  )}
                </div>
              )
            }
            const entry = entries[row.index]
            const band = entry ? bandKey(entry) : null
            return (
              <div
                key={row.key}
                style={{ position: 'absolute', top, left: 0, width: '100%', height: rowHeight, paddingBottom: 6 }}
                onContextMenu={entry ? (e) => openMenu(entry, e) : undefined}
              >
                {band && (
                  <div
                    style={{
                      position: 'absolute',
                      top: -3,
                      height: rowHeight,
                      left: -BAND_PAD,
                      right: -BAND_PAD,
                      background: bandBg,
                      borderRadius: 10,
                    }}
                  />
                )}
                {entry ? (
                  <div style={{ position: 'relative' }}>{renderRow(entry)}</div>
                ) : (
                  <div style={{ height: rowHeight - 6, borderRadius: 10, background: 'var(--well)', opacity: 0.5 }} />
                )}
              </div>
            )
          })}
        </div>
      </div>

      {menu && (
        <ContextMenu x={menu.x} y={menu.y} items={menuItems} onClose={() => setMenu(null)} />
      )}
    </>
  )
}

function EmptyState({ onClearFilters }: { onClearFilters: () => void }) {
  const { hovered, bind } = useHover()
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 10,
        padding: '90px 0 0',
        textAlign: 'center',
      }}
    >
      <Files size={34} color="var(--line3)" />
      <div style={{ fontSize: 15, fontWeight: 600 }}>No assets match</div>
      <div style={{ fontSize: 13, color: 'var(--muted)' }}>
        Try a different search or clear the active filters.
      </div>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          onClearFilters()
        }}
        {...bind}
        style={{
          marginTop: 6,
          background: 'var(--card)',
          border: `1px solid ${hovered ? 'var(--line3)' : 'var(--line2)'}`,
          borderRadius: 8,
          padding: '7px 14px',
          cursor: 'pointer',
          fontSize: 12.5,
          fontWeight: 600,
          color: 'var(--ink)',
        }}
      >
        Clear filters
      </button>
    </div>
  )
}
