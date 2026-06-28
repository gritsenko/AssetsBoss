import { useSyncExternalStore } from 'react'
import { contentUrl } from '../../api/client'
import type { Asset } from '../../api/types'

/**
 * Один общий <audio> на всё приложение: кнопки play в карточках и плеер в деталях/лайтбоксе
 * управляют одним источником звука, поэтому всегда синхронны и звучит ровно один клип.
 *
 * Два независимых стора, чтобы сетка не перерисовывалась на каждый тик прогресса:
 *  - transport (assetId, playing) — меняется только на play/pause/смену трека (его слушают карточки);
 *  - progress (currentTime, duration) — тикает на timeupdate + rAF (его слушает лишь плеер).
 */

let audio: HTMLAudioElement | null = null
let transport: { assetId: number | null; playing: boolean } = { assetId: null, playing: false }
let progress: { currentTime: number; duration: number } = { currentTime: 0, duration: 0 }
const transportListeners = new Set<() => void>()
const progressListeners = new Set<() => void>()
let raf = 0
// перемотка, заказанная до загрузки метаданных нового трека (clic по волне неактивного аудио)
let pendingSeek: number | null = null

function emitTransport() {
  transport = { ...transport } // новая ссылка → useSyncExternalStore замечает изменение
  transportListeners.forEach((l) => l())
}

function emitProgress() {
  progress = { ...progress }
  progressListeners.forEach((l) => l())
}

// timeupdate стреляет ~4 раза/с — мало для плавного seek-бара; пока играем, докручиваем rAF
function pump() {
  cancelAnimationFrame(raf)
  const tick = () => {
    if (!audio || audio.paused) return
    progress.currentTime = audio.currentTime
    emitProgress()
    raf = requestAnimationFrame(tick)
  }
  raf = requestAnimationFrame(tick)
}

function getAudio(): HTMLAudioElement {
  if (!audio) {
    const el = new Audio()
    el.preload = 'metadata'
    el.addEventListener('play', () => {
      transport.playing = true
      emitTransport()
      pump()
    })
    el.addEventListener('pause', () => {
      transport.playing = false
      emitTransport()
    })
    el.addEventListener('ended', () => {
      transport.playing = false
      emitTransport()
      progress.currentTime = 0
      emitProgress()
    })
    el.addEventListener('loadedmetadata', () => {
      progress.duration = Number.isFinite(el.duration) ? el.duration : 0
      if (pendingSeek != null) {
        el.currentTime = pendingSeek
        progress.currentTime = pendingSeek
        pendingSeek = null
      }
      emitProgress()
    })
    el.addEventListener('durationchange', () => {
      progress.duration = Number.isFinite(el.duration) ? el.duration : 0
      emitProgress()
    })
    el.addEventListener('timeupdate', () => {
      progress.currentTime = el.currentTime
      emitProgress()
    })
    audio = el
  }
  return audio
}

/** Начинает (или возобновляет) воспроизведение ассета, переключая источник при смене трека. */
export function playAudio(asset: Asset, seekTo?: number) {
  const el = getAudio()
  if (transport.assetId !== asset.id) {
    el.src = contentUrl(asset)
    transport.assetId = asset.id
    emitTransport()
    progress = { currentTime: 0, duration: 0 }
    emitProgress()
  }
  if (seekTo !== undefined && Number.isFinite(seekTo)) {
    // метаданные нового трека ещё не загружены — перемотаем в обработчике loadedmetadata
    if (el.readyState >= 1 && (el.duration || 0) > 0) {
      el.currentTime = seekTo
      progress.currentTime = seekTo
      emitProgress()
    } else {
      pendingSeek = seekTo
    }
  }
  void el.play().catch(() => {}) // autoplay-политика может отклонить — не критично
}

export function pauseAudio() {
  audio?.pause()
}

/** play/stop для конкретного ассета: активный — пауза/продолжить, иначе переключаемся на него. */
export function toggleAudio(asset: Asset) {
  const el = getAudio()
  if (transport.assetId === asset.id) {
    if (el.paused) void el.play().catch(() => {})
    else el.pause()
  } else {
    playAudio(asset)
  }
}

function seekAudio(time: number) {
  if (!audio || !Number.isFinite(time)) return
  audio.currentTime = Math.max(0, audio.duration ? Math.min(time, audio.duration) : time)
  progress.currentTime = audio.currentTime
  emitProgress()
}

function subscribeTransport(cb: () => void) {
  transportListeners.add(cb)
  return () => void transportListeners.delete(cb)
}

function subscribeProgress(cb: () => void) {
  progressListeners.add(cb)
  return () => void progressListeners.delete(cb)
}

/** Транспорт для конкретного ассета: активен ли он и играет ли (дёшево для карточек сетки). */
export function useAudio(asset: Asset) {
  const snap = useSyncExternalStore(subscribeTransport, () => transport)
  const active = snap.assetId === asset.id
  return {
    active,
    playing: active && snap.playing,
    toggle: () => toggleAudio(asset),
  }
}

/** Прогресс активного трека + перемотка — для развёрнутого плеера. */
export function useAudioProgress() {
  const t = useSyncExternalStore(subscribeTransport, () => transport)
  const p = useSyncExternalStore(subscribeProgress, () => progress)
  return {
    assetId: t.assetId,
    playing: t.playing,
    currentTime: p.currentTime,
    duration: p.duration,
    seek: seekAudio,
  }
}
