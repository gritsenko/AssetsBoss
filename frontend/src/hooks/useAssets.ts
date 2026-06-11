import { useInfiniteQuery } from '@tanstack/react-query'
import { api } from '../api/client'
import type { AssetQueryParams } from '../api/types'

export const PAGE_SIZE = 200

export function useAssets(params: AssetQueryParams) {
  return useInfiniteQuery({
    queryKey: ['assets', params],
    queryFn: ({ pageParam }) => api.getAssets(params, pageParam, PAGE_SIZE),
    initialPageParam: 0,
    getNextPageParam: (lastPage) => {
      const next = lastPage.offset + lastPage.items.length
      return next < lastPage.total ? next : undefined
    },
  })
}
