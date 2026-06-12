import { useVirtualizer } from '@tanstack/react-virtual'
import { ArrowsOut, Files, FolderOpen } from '@phosphor-icons/react'
import { type ReactNode, useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Asset } from '../api/types'
import { useHover } from '../hooks/useHover'
import { AssetCard } from './AssetCard'
import { AssetRow } from './AssetRow'
import { ContextMenu, type MenuItem } from './ContextMenu'

const GAP = 14
const THUMB_MIN_FALLBACK = 216
const LIST_ROW_HEIGHT = 70
const CAPTION_HEIGHT = 46

interface Props {
  items: Asset[]
  total: number
  hasMore: boolean
  isLoading: boolean
  isLoadingMore: boolean
  loadMore: () => void
  view: 'grid' | 'list'
  thumbMin: number
  showExt: boolean
  dark: boolean
  selectedIds: Set<number>
  onSelect: (asset: Asset, e: React.MouseEvent) => void
  onOpen: (asset: Asset, e?: React.MouseEvent) => void
  onGoToFolder: (asset: Asset) => void
  onBackgroundClick: () => void
  onClearFilters: () => void
  onColumns?: (columns: number) => void
  folders?: ReactNode
}

export function ResultsArea({
  items,
  total,
  hasMore,
  isLoading,
  isLoadingMore,
  loadMore,
  view,
  thumbMin,
  showExt,
  dark,
  selectedIds,
  onSelect,
  onOpen,
  onGoToFolder,
  onBackgroundClick,
  onClearFilters,
  onColumns,
  folders,
}: Props) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const [menu, setMenu] = useState<{ x: number; y: number; asset: Asset } | null>(null)

  const openMenu = useCallback(
    (asset: Asset, e: React.MouseEvent) => {
      e.preventDefault()
      onSelect(asset, e) // правый клик без модификаторов выделяет ассет
      setMenu({ x: e.clientX, y: e.clientY, asset })
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
  const thumbSize: 256 | 512 = cellWidth > 220 ? 512 : 256
  const rowHeight = isGrid ? Math.round((cellWidth * 3) / 4) + CAPTION_HEIGHT + GAP : LIST_ROW_HEIGHT
  const rowCount = Math.ceil(total / columns)

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
    if (hasMore && !isLoadingMore && items.length < needed) loadMore()
  }, [hasMore, isLoadingMore, items.length, needed, loadMore])

  useEffect(() => {
    onColumns?.(columns)
  }, [columns, onColumns])

  const showEmpty = !isLoading && total === 0 && !hasMore
  const showLoading = isLoading || (total === 0 && hasMore)

  const menuItems: MenuItem[] = menu
    ? [
        {
          icon: <FolderOpen size={15} />,
          label: 'Go to folder',
          onClick: () => onGoToFolder(menu.asset),
        },
        {
          icon: <ArrowsOut size={15} />,
          label: 'Open fullscreen',
          onClick: () => onOpen(menu.asset),
        },
      ]
    : []

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
              const cells: (Asset | undefined)[] = []
              for (let col = 0; col < columns; col++) {
                const idx = row.index * columns + col
                if (idx >= total) break
                cells.push(items[idx])
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
                  {cells.map((asset, col) =>
                    asset ? (
                      <div
                        key={asset.id}
                        style={{ width: cellWidth }}
                        onContextMenu={(e) => openMenu(asset, e)}
                      >
                        <AssetCard
                          asset={asset}
                          selected={selectedIds.has(asset.id)}
                          thumbSize={thumbSize}
                          showExt={showExt}
                          onSelect={(e) => onSelect(asset, e)}
                          onOpen={(e) => onOpen(asset, e)}
                        />
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
                        }}
                      />
                    ),
                  )}
                </div>
              )
            }
            const asset = items[row.index]
            return (
              <div
                key={row.key}
                style={{ position: 'absolute', top, left: 0, width: '100%', height: rowHeight, paddingBottom: 6 }}
                onContextMenu={asset ? (e) => openMenu(asset, e) : undefined}
              >
                {asset ? (
                  <AssetRow
                    asset={asset}
                    selected={selectedIds.has(asset.id)}
                    showExt={showExt}
                    dark={dark}
                    onSelect={(e) => onSelect(asset, e)}
                    onOpen={(e) => onOpen(asset, e)}
                  />
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
