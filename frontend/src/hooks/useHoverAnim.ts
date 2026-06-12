import { useEffect, useRef, useState } from 'react'
import type { Asset } from '../api/types'

const HOVER_FPS = 20

/**
 * Зацикленный прогон кадров для hover-превью миниатюры: пока active, индекс
 * тикает с HOVER_FPS, кадры предзагружаются в кэш браузера. Возвращает текущий
 * кадр или null (нет наведения / кадры ещё не подгрузились).
 */
export function useHoverAnim(
  frames: Asset[] | null,
  active: boolean,
  urlOf: (frame: Asset) => string,
): Asset | null {
  const [index, setIndex] = useState(0)

  // новый прогон (другой массив кадров, в т.ч. null ↔ кадры при unhover/hover)
  // начинается с первого кадра; сброс — adjust-during-render, без эффекта
  const [prevFrames, setPrevFrames] = useState(frames)
  if (prevFrames !== frames) {
    setPrevFrames(frames)
    setIndex(0)
  }

  useEffect(() => {
    if (!active || !frames || frames.length < 2) return
    const t = setInterval(() => setIndex((i) => (i + 1) % frames.length), 1000 / HOVER_FPS)
    return () => clearInterval(t)
  }, [active, frames])

  // держим ссылки на предзагруженные картинки, пока курсор на карточке
  const preloaded = useRef<HTMLImageElement[]>([])
  useEffect(() => {
    if (!active || !frames) return
    preloaded.current = frames.map((f) => {
      const img = new Image()
      img.src = urlOf(f)
      return img
    })
    return () => {
      preloaded.current = []
    }
  }, [active, frames, urlOf])

  if (!active || !frames || frames.length === 0) return null
  return frames[Math.min(index, frames.length - 1)]
}
