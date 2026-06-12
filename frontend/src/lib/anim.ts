import { contentUrl, thumbUrl } from '../api/client'
import type { AnimGroupDetail, Asset, AssetListItem, GroupRef } from '../api/types'

/**
 * Модель отображаемой строки результатов: обычный ассет, группа анимаций
 * («персонаж»), клип внутри раскрытой группы или кадр раскрытого клипа.
 * Раскрытие Unity-style: дети вставляются в плоский список сразу за родителем.
 */
export type Entry =
  | { type: 'asset'; key: string; asset: AssetListItem }
  | {
      type: 'group'
      key: string
      asset: AssetListItem // обложка — первый кадр
      ref: GroupRef
      frameCount: number
      clipCount: number
      expanded: boolean
      loading: boolean
    }
  | {
      type: 'clip'
      key: string
      asset: Asset // первый кадр клипа
      ref: GroupRef
      clipName: string
      frameCount: number
      expanded: boolean
      depth: number
    }
  | {
      type: 'frame'
      key: string
      asset: Asset
      ref: GroupRef
      clipName: string
      frameIndex: number
      depth: number
    }

/** Строка выдачи является группой, если сервер схлопнул в неё больше одного кадра. */
export function isGroupItem(item: AssetListItem): boolean {
  return item.animGroup != null && item.frameCount > 1
}

export function groupRefOf(asset: Asset): GroupRef | null {
  return asset.animGroup
    ? { sourceId: asset.sourceId, dir: asset.parentDir, name: asset.animGroup }
    : null
}

export function groupKey(ref: GroupRef): string {
  return `g:${ref.sourceId}|${ref.dir}|${ref.name}`
}

export function clipKey(gkey: string, clipName: string): string {
  return `c:${gkey}/${clipName}`
}

/** "01_*_sword" → "01 sword" (звёздочка — позиция токена-действия). */
export function formatGroupName(name: string): string {
  return name.split('_').filter((t) => t !== '*').join(' ') || name
}

/** Токен, которым клип отличается от группы: "01_attack_sword" в "01_*_sword" → "attack". */
export function formatClipName(clipName: string, groupName: string): string {
  const gt = groupName.split('_')
  const ct = clipName.split('_')
  if (gt.length === ct.length) {
    const star = gt.indexOf('*')
    if (star >= 0 && ct[star]) return ct[star]
  }
  return clipName
}

/** URL кадра для плеера: оригинал для мелких файлов, иначе миниатюра 512. */
export function frameUrl(frame: Asset): string {
  return frame.size <= 400_000 ? contentUrl(frame) : thumbUrl(frame, 512)
}

/** Кадры hover-превью: у клипа — свои, у группы — все клипы подряд. */
export function previewFrames(
  entry: Extract<Entry, { type: 'group' | 'clip' }>,
  detail: AnimGroupDetail | undefined,
): Asset[] | null {
  if (!detail) return null
  if (entry.type === 'clip')
    return detail.clips.find((c) => c.name === entry.clipName)?.frames ?? null
  return detail.clips.flatMap((c) => c.frames)
}

/** Заголовок карточки/строки группы или клипа. */
export function entryTitle(entry: Extract<Entry, { type: 'group' | 'clip' }>): string {
  return entry.type === 'group'
    ? formatGroupName(entry.ref.name)
    : formatClipName(entry.clipName, entry.ref.name)
}

/** Строка счётчиков карточки/строки группы или клипа. */
export function entryCounts(entry: Extract<Entry, { type: 'group' | 'clip' }>): string {
  if (entry.type === 'clip') return `${entry.frameCount} frames`
  return entry.clipCount > 1
    ? `${entry.clipCount} clips · ${entry.frameCount} frames`
    : `${entry.frameCount} frames`
}

/**
 * Ключ «полосы» раскрытой группы: общий фон под группой и её детьми.
 * null — строка не относится к раскрытой группе.
 */
export function bandKey(entry: Entry): string | null {
  if (entry.type === 'group') return entry.expanded ? entry.key : null
  if (entry.type === 'clip' || entry.type === 'frame') return groupKey(entry.ref)
  return null
}

/** Entry для произвольного ассета вне текущей выдачи (палитра команд и т.п.). */
export function assetEntry(asset: Asset): Entry {
  return { type: 'asset', key: `a:${asset.id}`, asset: { ...asset, frameCount: 1, clipCount: 0 } }
}

/** Entry умеет проигрываться: группа/клип/кадр либо ассет, входящий в клип. */
export function isAnimEntry(entry: Entry): boolean {
  return entry.type !== 'asset' || entry.asset.animGroup != null
}

/** Адрес группы для любого анимационного entry. */
export function entryGroupRef(entry: Entry): GroupRef | null {
  return entry.type === 'asset' ? groupRefOf(entry.asset) : entry.ref
}

/** Начальная позиция плеера (клип + кадр) для выбранного entry. */
export function initialPosition(
  entry: Entry,
  detail: AnimGroupDetail,
): { clip: number; frame: number } {
  const clipName =
    entry.type === 'clip' || entry.type === 'frame'
      ? entry.clipName
      : entry.asset.animClip
  const ci = clipName ? detail.clips.findIndex((c) => c.name === clipName) : 0
  const clip = ci >= 0 ? ci : 0
  if (entry.type === 'frame') return { clip, frame: entry.frameIndex }
  if (entry.type === 'asset') {
    const fi = detail.clips[clip]?.frames.findIndex((f) => f.id === entry.asset.id) ?? -1
    return { clip, frame: fi >= 0 ? fi : 0 }
  }
  return { clip, frame: 0 }
}

/**
 * Превращает страницы выдачи в плоский список строк с учётом раскрытий.
 * Группа из одного клипа раскрывается сразу в кадры (без промежуточного уровня).
 */
export function buildEntries(
  items: AssetListItem[],
  groupDetails: ReadonlyMap<string, AnimGroupDetail | undefined>,
  expandedClips: ReadonlySet<string>,
): Entry[] {
  const out: Entry[] = []
  for (const item of items) {
    if (!isGroupItem(item)) {
      out.push({ type: 'asset', key: `a:${item.id}`, asset: item })
      continue
    }
    const ref = groupRefOf(item)!
    const gkey = groupKey(ref)
    const expanded = groupDetails.has(gkey)
    const detail = groupDetails.get(gkey)
    out.push({
      type: 'group',
      key: gkey,
      asset: item,
      ref,
      frameCount: item.frameCount,
      clipCount: item.clipCount,
      expanded,
      loading: expanded && !detail,
    })
    if (!expanded || !detail) continue

    const single = detail.clips.length === 1
    for (const clip of detail.clips) {
      const ckey = clipKey(gkey, clip.name)
      const clipExpanded = single || expandedClips.has(ckey)
      if (!single) {
        out.push({
          type: 'clip',
          key: ckey,
          asset: clip.frames[0],
          ref,
          clipName: clip.name,
          frameCount: clip.frames.length,
          expanded: clipExpanded,
          depth: 1,
        })
      }
      if (clipExpanded) {
        clip.frames.forEach((f, i) =>
          out.push({
            type: 'frame',
            key: `f:${f.id}`,
            asset: f,
            ref,
            clipName: clip.name,
            frameIndex: i,
            depth: single ? 1 : 2,
          }),
        )
      }
    }
  }
  return out
}
