import type {
  AnimGroupDetail,
  Asset,
  AssetPage,
  AssetQueryParams,
  AudioWaveform,
  DirNode,
  GroupRef,
  ModelBundle,
  ModelGroupDetail,
  ModelGroupRef,
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

  browseFolder: () => http<{ path: string }>('/api/sources/browse'),

  deleteSource: (id: number) => http<void>(`/api/sources/${id}`, { method: 'DELETE' }),

  renameSource: (id: number, name: string) =>
    http<Source>(`/api/sources/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    }),

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
    if (params.animated) search.set('animated', 'true')
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

  getFolderPreview: (sourceId: number, dir: string, limit = 4) =>
    http<{ items: Asset[]; total: number }>(
      `/api/assets/folder-preview?sourceId=${sourceId}&dir=${encodeURIComponent(dir)}&limit=${limit}`,
    ),

  getModelGroup: (ref: ModelGroupRef) => {
    const search = new URLSearchParams({
      sourceId: String(ref.sourceId),
      dir: ref.dir,
      name: ref.name,
    })
    return http<ModelGroupDetail>(`/api/assets/modelgroup?${search}`)
  },

  /** Companion-файлы модели (внешние текстуры + анимационные FBX). */
  getModelBundle: (id: number) => http<ModelBundle>(`/api/assets/${id}/bundle`),

  /** Открыть файл ассета в приложении ОС по умолчанию (запускается на машине-хосте). */
  openAsset: (id: number) => http<void>(`/api/assets/${id}/open`, { method: 'POST' }),

  /** Показать файл ассета в системном проводнике (открыть папку, выделить файл). */
  revealAsset: (id: number) => http<void>(`/api/assets/${id}/reveal`, { method: 'POST' }),

  /** Заливает построенную клиентом волну в кэш сервера. */
  putWaveform: (asset: Asset, data: AudioWaveform) =>
    http<void>(`/api/assets/${asset.id}/waveform`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    }),
}

export const thumbUrl = (asset: Asset, size: 128 | 256 | 512 | 1024) =>
  `/api/assets/${asset.id}/thumb?size=${size}&v=${asset.mtime}`

export const contentUrl = (asset: Asset) => `/api/assets/${asset.id}/content`

/** Сколько столбиков в волне строит клиент (фиксировано; старые кэши с другой длиной рисуются как есть). */
export const WAVEFORM_BARS = 200

/** URL кэшированной волны; v={mtime} делает содержимое неизменным под этим адресом. */
export const waveformUrl = (asset: Asset) => `/api/assets/${asset.id}/waveform?v=${asset.mtime}`

/**
 * Сырой файл по относительному пути внутри источника. Сегменты кодируются, но '/'
 * сохраняются — так 3D-загрузчики (glTF/OBJ) разрешают соседние .bin/.mtl/текстуры
 * относительно URL модели.
 */
export const rawUrl = (sourceId: number, relPath: string) =>
  `/api/sources/${sourceId}/raw/${relPath.split('/').map(encodeURIComponent).join('/')}`

/** URL модели для WebGL-загрузчиков (резолвит соседние ресурсы). */
export const modelUrl = (asset: Asset) => rawUrl(asset.sourceId, asset.relPath)

/**
 * Версия клиентского рендера 3D-превью. Меняем при правках рендера (свет/камера/материалы) —
 * новый rev даёт новый ключ кэша на бэке, старые превью инвалидируются сами.
 * rev=2: рендер с внешними текстурами (TGA + резолв через bundle).
 * rev=3: авто-привязка текстур из bundle по конвенции имён (Unity .mat без ссылок в FBX).
 * rev=4: коррекция оси FBX (Z-up → Y-up) по UpAxis из GlobalSettings.
 */
export const MODEL_THUMB_REV = 4
/** Канонический размер мастер-превью; меньшие размеры сервер ужимает из него. */
export const MODEL_THUMB_MASTER = 512

/** URL превью модели для сетки (сервер отдаёт из кэша или ужимает из мастера). */
export const modelThumbUrl = (asset: Asset, size: number) =>
  `/api/assets/${asset.id}/thumb?size=${size}&v=${asset.mtime}&rev=${MODEL_THUMB_REV}`

/** Куда клиент заливает мастер-превью (один рендер обслуживает все размеры). */
export const modelThumbUploadUrl = (asset: Asset) =>
  `/api/assets/${asset.id}/thumb?size=${MODEL_THUMB_MASTER}&rev=${MODEL_THUMB_REV}`
