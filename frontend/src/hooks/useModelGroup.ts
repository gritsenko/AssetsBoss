import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { ModelGroupRef } from '../api/types'

/** Варианты группы 3D-моделей (форматы одного имени); null — ничего не грузим. */
export function useModelGroup(ref: ModelGroupRef | null) {
  return useQuery({
    queryKey: ['modelGroup', ref?.sourceId, ref?.dir, ref?.name],
    queryFn: () => api.getModelGroup(ref!),
    enabled: ref !== null,
    staleTime: 5 * 60_000,
  })
}
