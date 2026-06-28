import { contentUrl } from '../../api/client'
import type { Asset } from '../../api/types'
import { getAudioContext } from './waveform'

/**
 * Сохранение аудио-ассета в MP3. Сервер звук не декодирует (нет нативных x64-only либ на
 * ARM — как и с волной/3D-превью): декодируем файл через Web Audio API и кодируем в mp3
 * чистым JS-портом LAME (@breezystack/lamejs, без нативных зависимостей). Если исходник
 * уже mp3 — сохраняем байты как есть, без перекодирования. Результат отдаётся браузеру/
 * WebView2 как загрузка файла.
 */

/** Битрейт CBR результата. */
const MP3_KBPS = 192
/** Размер кадра LAME: encodeBuffer ждёт куски кратные 1152 семплам. */
const FRAME = 1152
/** Частоты, которые понимает LAME; AudioContext почти всегда 44100/48000. */
const SUPPORTED_RATES = new Set([8000, 11025, 12000, 16000, 22050, 24000, 32000, 44100, 48000])

function floatToInt16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length)
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

/** Декодирует аудио и кодирует в MP3 (CBR). Тяжёлый цикл периодически уступает потоку. */
async function encodeToMp3(buf: ArrayBuffer): Promise<Blob> {
  const audio = await getAudioContext().decodeAudioData(buf)
  const { sampleRate } = audio
  if (!SUPPORTED_RATES.has(sampleRate)) throw new Error(`unsupported sample rate ${sampleRate}`)

  const channels = Math.min(2, audio.numberOfChannels)
  const left = floatToInt16(audio.getChannelData(0))
  const right = channels > 1 ? floatToInt16(audio.getChannelData(1)) : null

  const { Mp3Encoder } = await import('@breezystack/lamejs')
  const enc = new Mp3Encoder(channels, sampleRate, MP3_KBPS)

  const chunks: Uint8Array[] = []
  for (let i = 0; i < left.length; i += FRAME) {
    const l = left.subarray(i, i + FRAME)
    const mp3 = right ? enc.encodeBuffer(l, right.subarray(i, i + FRAME)) : enc.encodeBuffer(l)
    if (mp3.length > 0) chunks.push(mp3)
    // каждые ~256 кадров уступаем потоку, чтобы окно не зависало на длинных треках
    if ((i / FRAME) % 256 === 255) await new Promise((r) => setTimeout(r))
  }
  const tail = enc.flush()
  if (tail.length > 0) chunks.push(tail)

  return new Blob(chunks as BlobPart[], { type: 'audio/mpeg' })
}

/** Отдаёт blob браузеру/WebView2 как загрузку файла с заданным именем. */
function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 10_000)
}

/** Имя ассета без последнего расширения + .mp3. */
function mp3Name(name: string): string {
  return `${name.replace(/\.[^./\\]+$/, '')}.mp3`
}

/**
 * Сохраняет аудио-ассет как MP3 (конвертирует при необходимости). Кидает при ошибке
 * чтения/декода — вызывающий показывает тост.
 */
export async function saveAudioAsMp3(asset: Asset): Promise<void> {
  const res = await fetch(contentUrl(asset))
  if (!res.ok) throw new Error('could not read audio file')

  const blob =
    asset.ext.toLowerCase() === 'mp3'
      ? await res.blob() // уже mp3 — без перекодирования
      : await encodeToMp3(await res.arrayBuffer())

  triggerDownload(blob, mp3Name(asset.name))
}
