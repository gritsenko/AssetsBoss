import { useQuery } from '@tanstack/react-query'
import { api, contentUrl, WAVEFORM_BARS, waveformUrl } from '../../api/client'
import type { Asset, AudioWaveform } from '../../api/types'

/**
 * Сервер не декодирует аудио (нет нативных x64-only либ на ARM — как и с 3D-превью):
 * волну и длительность считает клиент через Web Audio API и заливает на бэк, где они
 * кэшируются под mtime файла. Первый показ декодирует файл целиком; дальше — из кэша.
 *
 * Один общий AudioContext; задания дедуплицируются по (asset, mtime) и идут строго
 * последовательно (decode тяжёлый — не запускаем десятки разом на сетке аудио). При
 * сбое возвращаем null, чтобы карточка показала иконку, а не висела в загрузке.
 */

let ctx: AudioContext | null = null

/** Единственный на приложение AudioContext для декода (волна + конвертация в mp3). */
export function getAudioContext(): AudioContext {
  // создаём лениво: до user-gesture контекст в suspended, но decodeAudioData это не мешает
  ctx ??= new AudioContext()
  return ctx
}

/** Пики max-abs по бакетам канала 0, нормированные к 0..255; длительность из буфера. */
async function decodePeaks(buf: ArrayBuffer, bars: number): Promise<AudioWaveform | null> {
  const audio = await getAudioContext().decodeAudioData(buf)
  if (!Number.isFinite(audio.duration) || audio.length === 0) return null

  const channel = audio.getChannelData(0)
  const block = Math.max(1, Math.floor(channel.length / bars))
  const peaks: number[] = []
  let max = 0
  for (let b = 0; b < bars; b++) {
    const start = b * block
    const end = Math.min(start + block, channel.length)
    let peak = 0
    for (let i = start; i < end; i++) {
      const v = Math.abs(channel[i])
      if (v > peak) peak = v
    }
    peaks.push(peak)
    if (peak > max) max = peak
  }

  // нормируем по самому громкому столбику — тихие записи тоже читаются
  const scale = max > 0 ? 255 / max : 0
  return {
    durationMs: Math.round(audio.duration * 1000),
    peaks: peaks.map((p) => Math.round(p * scale)),
  }
}

const inflight = new Map<string, Promise<AudioWaveform | null>>()
let chain: Promise<unknown> = Promise.resolve()

/** Ставит задание в общую очередь (по очереди, не параллельно) — как в thumbnailer. */
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task)
  chain = run.then(
    () => {},
    () => {},
  )
  return run
}

async function generate(asset: Asset): Promise<AudioWaveform | null> {
  try {
    const res = await fetch(contentUrl(asset))
    if (!res.ok) return null
    const wf = await decodePeaks(await res.arrayBuffer(), WAVEFORM_BARS)
    if (!wf) return null
    // заливка кэша не критична: даже если упадёт, волну этой сессии уже нарисуем
    await api.putWaveform(asset, wf).catch(() => {})
    return wf
  } catch {
    return null
  }
}

/** Декодирует и кэширует волну (дедуп по asset+mtime). Безопасно дёргать из многих карточек. */
export function ensureWaveform(asset: Asset): Promise<AudioWaveform | null> {
  const key = `${asset.id}:${asset.mtime}`
  let p = inflight.get(key)
  if (!p) {
    p = enqueue(() => generate(asset)).finally(() => inflight.delete(key))
    inflight.set(key, p)
  }
  return p
}

/** Волна из кэша сервера; при её отсутствии (404) строит и заливает. null — построить не вышло. */
export async function getOrCreateWaveform(asset: Asset): Promise<AudioWaveform | null> {
  try {
    const res = await fetch(waveformUrl(asset))
    if (res.ok) return (await res.json()) as AudioWaveform
    if (res.status !== 404) return null
  } catch {
    return null
  }
  return ensureWaveform(asset)
}

/** Волна аудио для UI (общий кэш react-query; одна генерация на (id, mtime)). */
export function useWaveform(asset: Asset) {
  return useQuery({
    queryKey: ['waveform', asset.id, asset.mtime],
    queryFn: () => getOrCreateWaveform(asset),
    enabled: asset.kind === 'audio',
    staleTime: Infinity,
    gcTime: Infinity,
    retry: false,
  })
}
