import { useQueries } from '@tanstack/react-query'
import { api } from '../api/client'
import type { AssetKind } from '../api/types'

export interface KindCounts {
  all: number | undefined
  image: number | undefined
  animation: number | undefined
  model: number | undefined
  audio: number | undefined
}

/**
 * Source-wide totals per kind for the sidebar nav, each a cheap `limit=1` query
 * that only reads `total`. Video has no server-side kind, so it has no count.
 * Animation is filtered server-side via `animated=true` (sequences + animated singles).
 */
export function useKindCounts(sourceId: number | undefined): KindCounts {
  const total = (kind?: AssetKind) =>
    api.getAssets({ sourceId, kind }, 0, 1).then((p) => p.total)

  const results = useQueries({
    queries: [
      { queryKey: ['count', sourceId, 'all'], queryFn: () => total() },
      { queryKey: ['count', sourceId, 'image'], queryFn: () => total('image') },
      {
        queryKey: ['count', sourceId, 'animation'],
        queryFn: () => api.getAssets({ sourceId, animated: true }, 0, 1).then((p) => p.total),
      },
      { queryKey: ['count', sourceId, 'model'], queryFn: () => total('model') },
      { queryKey: ['count', sourceId, 'audio'], queryFn: () => total('audio') },
    ],
  })

  return {
    all: results[0].data,
    image: results[1].data,
    animation: results[2].data,
    model: results[3].data,
    audio: results[4].data,
  }
}
