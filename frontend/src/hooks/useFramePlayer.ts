import { useCallback, useEffect, useRef, useState } from 'react'
import type { Asset } from '../api/types'
import { frameUrl } from '../lib/anim'
import { usePersistedState } from './usePersistedState'

export const FPS_STEPS = [8, 12, 24] as const

/**
 * Покадровый плеер: таймер по fps, зацикленное воспроизведение, предзагрузка
 * кадров в кэш браузера. Смена массива кадров сбрасывает позицию в 0
 * (или в initialFrame при первом монтировании).
 */
export function useFramePlayer(frames: Asset[], initialFrame = 0) {
  const [index, setIndex] = useState(() => Math.min(initialFrame, Math.max(0, frames.length - 1)))
  const [playing, setPlaying] = useState(false)
  const [fps, setFps] = usePersistedState('assetboss-anim-fps', 12)

  // смена клипа (другой массив кадров) → к первому кадру; сравнение по identity
  // переживает двойной прогон эффектов в StrictMode и сохраняет initialFrame
  const prevFrames = useRef(frames)
  useEffect(() => {
    if (prevFrames.current !== frames) {
      prevFrames.current = frames
      setIndex(0)
    }
  }, [frames])

  useEffect(() => {
    if (!playing || frames.length < 2) return
    const t = setInterval(() => setIndex((i) => (i + 1) % frames.length), 1000 / fps)
    return () => clearInterval(t)
  }, [playing, fps, frames])

  // держим ссылки на предзагруженные картинки, пока клип активен
  const preloaded = useRef<HTMLImageElement[]>([])
  useEffect(() => {
    preloaded.current = frames.map((f) => {
      const img = new Image()
      img.src = frameUrl(f)
      return img
    })
    return () => {
      preloaded.current = []
    }
  }, [frames])

  const seek = useCallback(
    (i: number) => {
      setPlaying(false)
      setIndex(Math.max(0, Math.min(frames.length - 1, i)))
    },
    [frames.length],
  )

  const step = useCallback(
    (delta: number) => {
      setPlaying(false)
      setIndex((i) => {
        const n = frames.length
        return n === 0 ? 0 : (((i + delta) % n) + n) % n
      })
    },
    [frames.length],
  )

  const toggle = useCallback(() => setPlaying((p) => !p), [])

  const cycleFps = useCallback(() => {
    setFps((f) => {
      const i = FPS_STEPS.indexOf(f as (typeof FPS_STEPS)[number])
      return FPS_STEPS[(i + 1) % FPS_STEPS.length]
    })
  }, [setFps])

  const safeIndex = Math.min(index, Math.max(0, frames.length - 1))
  return {
    index: safeIndex,
    frame: frames[safeIndex] as Asset | undefined,
    playing,
    fps,
    toggle,
    seek,
    step,
    cycleFps,
    setPlaying,
  }
}
