export type AssetKind = 'other' | 'image' | 'audio' | 'model'

export interface Source {
  id: number
  name: string
  scheme: string
  root: string
  configJson: string | null
  createdAt: number
  lastScanAt: number | null
}

export interface Asset {
  id: number
  sourceId: number
  relPath: string
  parentDir: string
  name: string
  ext: string
  kind: AssetKind
  size: number
  mtime: number
  width: number | null
  height: number | null
  /** Кластер клипов («персонаж») в пределах папки; null — не кадр анимации. */
  animGroup: string | null
  /** Имя клипа (базовое имя файла без номера кадра). */
  animClip: string | null
  /** Номер кадра из имени файла. */
  animFrame: number | null
}

/** Строка выдачи /assets: для группы анимаций — обложка (первый кадр) + счётчики. */
export interface AssetListItem extends Asset {
  /** Сколько кадров схлопнуто в строку (1 — обычный ассет). */
  frameCount: number
  /** Сколько клипов в группе (0 — обычный ассет). */
  clipCount: number
}

export interface AssetPage {
  items: AssetListItem[]
  total: number
  offset: number
  limit: number
}

export interface AnimClip {
  name: string
  frames: Asset[]
}

export interface AnimGroupDetail {
  sourceId: number
  dir: string
  name: string
  clips: AnimClip[]
}

/** Адрес группы анимаций: источник + папка + имя группы. */
export interface GroupRef {
  sourceId: number
  dir: string
  name: string
}

/** Адрес группы 3D-моделей: источник + папка + basename (имя без расширения). */
export interface ModelGroupRef {
  sourceId: number
  dir: string
  name: string
}

/** Состав группы 3D-моделей: варианты одного имени в разных форматах (по приоритету). */
export interface ModelGroupDetail {
  sourceId: number
  dir: string
  name: string
  variants: Asset[]
}

export interface DirNode {
  path: string
  name: string
  hasChildren: boolean
}

export type ScanState = 'queued' | 'running' | 'done' | 'failed'

export interface ScanStatus {
  sourceId: number
  state: ScanState
  seen: number
  added: number
  updated: number
  removed: number
  currentDir: string | null
  startedAt: string | null
  finishedAt: string | null
  elapsedSeconds: number | null
  error: string | null
}

export interface AssetQueryParams {
  sourceId?: number
  dir?: string
  recursive?: boolean
  kind?: AssetKind
  q?: string
  /** Схлопывать анимационные последовательности в одну строку-группу. */
  grouped?: boolean
  /** Показывать только анимации: секвенции кадров + анимированные одиночки (GIF/WebP/APNG). */
  animated?: boolean
}
