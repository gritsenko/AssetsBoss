import { useVirtualizer } from '@tanstack/react-virtual'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Asset, AssetQueryParams } from '../api/types'
import { PAGE_SIZE, useAssets } from '../hooks/useAssets'
import { AssetCard } from './AssetCard'

const CELL_MIN_WIDTH = 150
const CELL_GAP = 8
const CAPTION_HEIGHT = 26

interface Props {
  params: AssetQueryParams
  selectedAsset: Asset | null
  onSelect: (asset: Asset) => void
}

export function AssetGrid({ params, selectedAsset, onSelect }: Props) {
  const { data, isFetching, isLoading, fetchNextPage, hasNextPage, isFetchingNextPage } =
    useAssets(params)

  const items = useMemo(() => data?.pages.flatMap((p) => p.items) ?? [], [data])
  const total = data?.pages[0]?.total ?? 0

  const scrollRef = useRef<HTMLDivElement | null>(null)
  const observerRef = useRef<ResizeObserver | null>(null)
  const [width, setWidth] = useState(800)

  // callback-ref: контейнер может монтироваться позже первого рендера,
  // поэтому ResizeObserver вешаем в момент появления элемента
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

  const columns = Math.max(2, Math.floor((width - CELL_GAP) / (CELL_MIN_WIDTH + CELL_GAP)))
  const cellWidth = Math.floor((width - CELL_GAP * (columns + 1)) / columns)
  const rowHeight = cellWidth + CAPTION_HEIGHT + CELL_GAP
  const rowCount = Math.ceil(total / columns)

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 5,
  })

  // докачка следующей страницы, когда виртуализатор подбирается к краю загруженного
  const virtualRows = virtualizer.getVirtualItems()
  const lastVisibleIndex = virtualRows.at(-1)?.index ?? 0
  const lastNeededItem = Math.min(total, (lastVisibleIndex + 1) * columns + PAGE_SIZE / 2)
  useEffect(() => {
    if (hasNextPage && !isFetchingNextPage && items.length < lastNeededItem) {
      fetchNextPage()
    }
  }, [hasNextPage, isFetchingNextPage, items.length, lastNeededItem, fetchNextPage])

  if (isLoading || total === 0) {
    return (
      <div className="flex h-full items-center justify-center text-zinc-500">
        {isLoading || isFetching ? 'Загрузка…' : 'Ничего не найдено'}
      </div>
    )
  }

  return (
    <div ref={setScrollEl} className="h-full overflow-y-auto" style={{ scrollbarGutter: 'stable' }}>
      <div className="px-2 pt-1 pb-0 text-xs text-zinc-500">
        {total.toLocaleString('ru-RU')} ассетов
      </div>
      <div className="relative" style={{ height: virtualizer.getTotalSize() }}>
        {virtualRows.map((row) => {
          const rowItems: (Asset | undefined)[] = []
          for (let col = 0; col < columns; col++) {
            const idx = row.index * columns + col
            if (idx >= total) break
            rowItems.push(items[idx])
          }
          return (
            <div
              key={row.key}
              className="absolute left-0 flex w-full"
              style={{
                top: row.start,
                height: rowHeight,
                gap: CELL_GAP,
                padding: `${CELL_GAP / 2}px ${CELL_GAP}px`,
              }}
            >
              {rowItems.map((asset, col) =>
                asset ? (
                  <div key={asset.id} style={{ width: cellWidth }}>
                    <AssetCard
                      asset={asset}
                      selected={selectedAsset?.id === asset.id}
                      onSelect={onSelect}
                    />
                  </div>
                ) : (
                  <div
                    key={`ph-${row.index}-${col}`}
                    style={{ width: cellWidth }}
                    className="animate-pulse rounded-lg bg-zinc-900"
                  />
                ),
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
