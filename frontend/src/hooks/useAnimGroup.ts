import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { GroupRef } from '../api/types'

/** Детали группы анимаций (клипы с кадрами); null — ничего не грузим. */
export function useAnimGroup(ref: GroupRef | null) {
  return useQuery({
    queryKey: ['animGroup', ref?.sourceId, ref?.dir, ref?.name],
    queryFn: () => api.getAnimGroup(ref!),
    enabled: ref !== null,
    staleTime: 5 * 60_000,
  })
}
