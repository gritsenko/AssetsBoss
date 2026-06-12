import { Cube, FilmStrip, type Icon, Image, Stack, Waveform } from '@phosphor-icons/react'
import type { Asset, AssetKind } from '../api/types'

/**
 * Display kinds shown in the UI. The backend only knows image/audio/model/other,
 * so "video" is derived on the client from the extension of an "other" asset
 * (the scanner files .mp4/.mov/… under "other"). This split is presentation-only.
 */
export type DisplayKind = 'image' | 'video' | 'audio' | 'model' | 'other'

const VIDEO_EXTS = new Set([
  '.mp4', '.mov', '.webm', '.avi', '.mkv', '.m4v', '.wmv', '.flv', '.ogv', '.mpg', '.mpeg',
])

export function isVideoExt(ext: string): boolean {
  return VIDEO_EXTS.has(ext.toLowerCase())
}

/** Map a backend asset to its display kind (splitting video out of "other"). */
export function displayKind(asset: Pick<Asset, 'kind' | 'ext'>): DisplayKind {
  if (asset.kind !== 'other') return asset.kind
  return isVideoExt(asset.ext) ? 'video' : 'other'
}

export interface KindMeta {
  /** Server-side filter to send (`null` = no kind param, narrow on the client). */
  serverKind: AssetKind | null
  /** Client predicate applied on top of the server filter, when needed. */
  clientFilter?: (a: Asset) => boolean
  label: string
  /** Short tag shown on cards / list rows. */
  badge: string
  Icon: Icon
}

/** Library-nav order, matching the design (All / Images / Video / 3D models / Audio). */
export const NAV_KINDS: DisplayKind[] = ['image', 'video', 'model', 'audio']

export const KIND_META: Record<DisplayKind, KindMeta> = {
  image: { serverKind: 'image', label: 'Images', badge: 'IMG', Icon: Image },
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
