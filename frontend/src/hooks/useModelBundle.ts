import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { Asset } from '../api/types'

/**
 * Companion-файлы модели (внешние текстуры + анимационные FBX); грузим только для моделей.
 * Кэшируется по (id, mtime) — при изменении файла bundle перезапрашивается.
 */
export function useModelBundle(asset: Asset | null) {
  return useQuery({
    queryKey: ['modelBundle', asset?.id, asset?.mtime],
    queryFn: () => api.getModelBundle(asset!.id),
    enabled: asset !== null && asset.kind === 'model',
    staleTime: 5 * 60_000,
  })
}
