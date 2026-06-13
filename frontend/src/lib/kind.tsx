import { Cube, FilmReel, FilmStrip, type Icon, Image, Stack, Waveform } from '@phosphor-icons/react'
import type { Asset, AssetKind } from '../api/types'
import { canViewModel } from './three/modelFormats'

/**
 * Display kinds shown in the UI. The backend only knows image/audio/model/other,
 * so "video" is derived on the client from the extension of an "other" asset
 * (the scanner files .mp4/.mov/… under "other"). This split is presentation-only.
 *
 * "animation" is not an intrinsic asset kind either — it's a server-side filter
 * (`animated=true`) selecting frame sequences + animated single images. `displayKind`
 * never returns it; it exists only as a nav/chip selection.
 */
export type DisplayKind = 'image' | 'animation' | 'video' | 'audio' | 'model' | 'other'

const VIDEO_EXTS = new Set([
  '.mp4', '.mov', '.webm', '.avi', '.mkv', '.m4v', '.wmv', '.flv', '.ogv', '.mpg', '.mpeg',
])

export function isVideoExt(ext: string): boolean {
  return VIDEO_EXTS.has(ext.toLowerCase())
}

// Форматы, которые браузер рисует сам (показываем оригинал через /content). Остальные
// картинки (.psd, .tga) браузер не понимает — для них берём отрендеренную миниатюру с бэка.
const BROWSER_IMAGE_EXTS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.bmp', '.svg', '.avif', '.ico', '.apng',
])

export function isBrowserRenderableImage(ext: string): boolean {
  return BROWSER_IMAGE_EXTS.has(ext.toLowerCase())
}

// .psd рендерится сервером (composite-слой → WebP). .svg бэк пока не декодирует — иконка.
const NON_THUMBABLE = new Set(['.svg'])

/** Картинка, для которой бэк отдаёт реальную миниатюру (не .svg). */
export function isThumbable(asset: Pick<Asset, 'kind' | 'ext'>): boolean {
  return asset.kind === 'image' && !NON_THUMBABLE.has(asset.ext.toLowerCase())
}

/**
 * Детерминированно ли ассет рисуется иконкой типа, а не реальной миниатюрой.
 * Картинки-thumbnail'ы и модели с вьювером могут упасть в иконку по ошибке загрузки,
 * но это не «всегда иконка» — здесь только заведомо иконочные виды (.svg, audio, video,
 * other, модели без поддерживаемого формата). Такие карточки визуально неотличимы,
 * поэтому в компактном режиме им подписывают имя.
 */
export function rendersAsIcon(asset: Pick<Asset, 'kind' | 'ext'>): boolean {
  if (asset.kind === 'model' && canViewModel(asset.ext)) return false
  return !isThumbable(asset)
}

/** Map a backend asset to its display kind (splitting video out of "other"). */
export function displayKind(asset: Pick<Asset, 'kind' | 'ext'>): DisplayKind {
  if (asset.kind !== 'other') return asset.kind
  return isVideoExt(asset.ext) ? 'video' : 'other'
}

export interface KindMeta {
  /** Server-side filter to send (`null` = no kind param, narrow on the client). */
  serverKind: AssetKind | null
  /** Send `animated=true` instead of a `kind` filter (frame sequences + animated singles). */
  serverAnimated?: boolean
  /** Client predicate applied on top of the server filter, when needed. */
  clientFilter?: (a: Asset) => boolean
  label: string
  /** Short tag shown on cards / list rows. */
  badge: string
  Icon: Icon
}

/** Library-nav order, matching the design (All / Images / Animation / Video / 3D models / Audio). */
export const NAV_KINDS: DisplayKind[] = ['image', 'animation', 'video', 'model', 'audio']

export const KIND_META: Record<DisplayKind, KindMeta> = {
  image: { serverKind: 'image', label: 'Images', badge: 'IMG', Icon: Image },
  animation: {
    serverKind: null,
    serverAnimated: true,
    label: 'Animation',
    badge: 'ANIM',
    Icon: FilmReel,
  },
  video: {
    serverKind: 'other',
    clientFilter: (a) => isVideoExt(a.ext),
    label: 'Video',
    badge: 'VID',
    Icon: FilmStrip,
  },
  model: { serverKind: 'model', label: '3D models', badge: '3D', Icon: Cube },
  audio: { serverKind: 'audio', label: 'Audio', badge: 'AUD', Icon: Waveform },
  other: { serverKind: 'other', clientFilter: (a) => !isVideoExt(a.ext), label: 'Other', badge: 'FILE', Icon: Stack },
}

export const ALL_META = { label: 'All assets', Icon: Stack }

/** Accent colour per display kind, tuned per theme (ported from the design). */
export function kindColor(kind: DisplayKind, dark: boolean): string {
  switch (kind) {
    case 'image':
      return '#C75B2E'
    case 'animation':
      return dark ? '#D88FB0' : '#B85F8A'
    case 'video':
      return dark ? '#9D85D8' : '#7A5FB8'
    case 'model':
      return dark ? '#6BAF87' : '#4E8F66'
    case 'audio':
      return dark ? '#6B9CC9' : '#3F7CAD'
    default:
      return 'var(--muted)'
  }
}
