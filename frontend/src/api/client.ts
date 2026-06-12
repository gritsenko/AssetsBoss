import type {
  AnimGroupDetail,
  Asset,
  AssetPage,
  AssetQueryParams,
  DirNode,
  GroupRef,
  ScanStatus,
  Source,
} from './types'

async function http<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    let message = `${res.status} ${res.statusText}`
    try {
      const body = (await res.json()) as { error?: string }
      if (body.error) message = body.error
    } catch {
      // тело не JSON — оставляем статус
    }
    throw new Error(message)
  }
  if (res.status === 204) return undefined as T
  return (await res.json()) as T
}

export const api = {
  getSources: () => http<Source[]>('/api/sources'),

  addSource: (name: string, root: string) =>
    http<Source>('/api/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, root }),
    }),

  deleteSource: (id: number) => http<void>(`/api/sources/${id}`, { method: 'DELETE' }),

  triggerScan: (id: number) => http<{ queued: boolean }>(`/api/sources/${id}/scan`, { method: 'POST' }),

  getScanStatus: () => http<ScanStatus[]>('/api/scan/status'),

  getDirs: (sourceId: number, parent: string) =>
    http<DirNode[]>(`/api/sources/${sourceId}/dirs?parent=${encodeURIComponent(parent)}`),

  getAssets: (params: AssetQueryParams, offset: number, limit: number) => {
    const search = new URLSearchParams()
    if (params.sourceId !== undefined) search.set('sourceId', String(params.sourceId))
    if (params.dir !== undefined) search.set('dir', params.dir)
    if (params.recursive) search.set('recursive', 'true')
    if (params.kind) search.set('kind', params.kind)
    if (params.q) search.set('q', params.q)
    if (params.grouped) search.set('grouped', 'true')
    search.set('offset', String(offset))
    search.set('limit', String(limit))
    return http<AssetPage>(`/api/assets?${search}`)
  },

  getAsset: (id: number) => http<Asset>(`/api/assets/${id}`),

  getAnimGroup: (ref: GroupRef) => {
    const search = new URLSearchParams({
      sourceId: String(ref.sourceId),
      dir: ref.dir,
      name: ref.name,
    })
    return http<AnimGroupDetail>(`/api/assets/group?${search}`)
  },
}

export const thumbUrl = (asset: Asset, size: 128 | 256 | 512) =>
  `/api/assets/${asset.id}/thumb?size=${size}&v=${asset.mtime}`

export const contentUrl = (asset: Asset) => `/api/assets/${asset.id}/content`
