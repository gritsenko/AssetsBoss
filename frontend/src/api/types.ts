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
}

export interface AssetPage {
  items: Asset[]
  total: number
  offset: number
  limit: number
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
}
