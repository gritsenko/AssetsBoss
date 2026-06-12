import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useEffect, useRef } from 'react'
import { api } from '../api/client'

/**
 * Опрос статуса сканов: каждые 500 мс пока есть активный скан, иначе раз в 5 с.
 * Когда скан завершается — инвалидируем данные ассетов/папок.
 */
export function useScanStatus() {
  const queryClient = useQueryClient()

  const query = useQuery({
    queryKey: ['scan-status'],
    queryFn: api.getScanStatus,
    refetchInterval: (q) => {
      const active = q.state.data?.some((s) => s.state === 'queued' || s.state === 'running')
      return active ? 500 : 5000
    },
  })

  const hadActive = useRef(false)
  const anyActive = query.data?.some((s) => s.state === 'queued' || s.state === 'running') ?? false
  useEffect(() => {
    if (hadActive.current && !anyActive) {
      queryClient.invalidateQueries({ queryKey: ['assets'] })
      queryClient.invalidateQueries({ queryKey: ['dirs'] })
      queryClient.invalidateQueries({ queryKey: ['sources'] })
      queryClient.invalidateQueries({ queryKey: ['count'] })
      queryClient.invalidateQueries({ queryKey: ['folderPreview'] })
    }
    hadActive.current = anyActive
  }, [anyActive, queryClient])

  return query
}
