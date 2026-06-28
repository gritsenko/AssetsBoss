import { DownloadSimple, Pause, Play } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import type { Asset } from '../api/types'
import { useHover } from '../hooks/useHover'
import { useToast } from '../hooks/toastContext'
import { playAudio, useAudio, useAudioProgress } from '../lib/audio/player'
import { saveAudioAsMp3 } from '../lib/audio/mp3'
import { useWaveform } from '../lib/audio/waveform'
import { formatTime } from '../lib/format'
import { kindColor } from '../lib/kind'
import { WaveBars } from './WaveBars'

interface Props {
  asset: Asset
  dark: boolean
  /** Начать воспроизведение при монтировании (лайтбокс). */
  autoPlay?: boolean
}

/**
 * Кастомный аудиоплеер: реальная волна с подсветкой проигранного и перемоткой по клику/drag,
 * play/pause и время. Звучит через общий синглтон плеера, поэтому синхронен с кнопками в сетке.
 */
export function AudioPlayer({ asset, dark, autoPlay }: Props) {
  const { data, isFetching } = useWaveform(asset)
  const { playing, toggle } = useAudio(asset)
  const { assetId, currentTime, duration, seek } = useAudioProgress()
  const active = assetId === asset.id

  useEffect(() => {
    if (autoPlay) playAudio(asset)
    // перезапуск при смене ассета (навигация в лайтбоксе); playAudio стабилен
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [asset.id, autoPlay])

  // длительность: у активного трека — из элемента (точная), иначе из кэша волны/DTO
  const wfDur = (data?.durationMs ?? asset.durationMs ?? 0) / 1000
  const total = active && duration > 0 ? duration : wfDur
  const at = active ? currentTime : 0
  const fraction = total > 0 ? Math.min(1, at / total) : 0

  const played = kindColor('audio', dark)

  const onSeek = (e: React.PointerEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect()
    const f = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width))
    const t = f * total
    if (!Number.isFinite(t)) return
    if (active) seek(t)
    else playAudio(asset, t)
  }

  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        gap: 18,
        padding: '0 26px',
      }}
    >
      <div
        onPointerDown={(e) => {
          e.currentTarget.setPointerCapture(e.pointerId)
          onSeek(e)
        }}
        onPointerMove={(e) => {
          if (e.buttons & 1) onSeek(e)
        }}
        style={{ position: 'relative', width: '100%', height: 120, cursor: total > 0 ? 'pointer' : 'default' }}
      >
        {data ? (
          <>
            <div style={{ position: 'absolute', inset: 0 }}>
              <WaveBars peaks={data.peaks} color="var(--line3)" />
            </div>
            <div style={{ position: 'absolute', inset: 0, clipPath: `inset(0 ${(1 - fraction) * 100}% 0 0)` }}>
              <WaveBars peaks={data.peaks} color={played} />
            </div>
          </>
        ) : (
          // волна ещё строится или не построилась — плоская дорожка, перемотка всё равно работает
          <>
            <div style={{ position: 'absolute', top: '50%', left: 0, right: 0, height: 2, background: 'var(--line3)' }} />
            <div
              style={{
                position: 'absolute',
                top: '50%',
                left: 0,
                width: `${fraction * 100}%`,
                height: 2,
                background: played,
              }}
            />
          </>
        )}
        {/* головка воспроизведения */}
        {total > 0 && (
          <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${fraction * 100}%`, width: 2, background: played }} />
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <button
          type="button"
          title={playing ? 'Pause' : 'Play'}
          onClick={toggle}
          style={{
            width: 40,
            height: 40,
            padding: 0,
            borderRadius: '50%',
            border: 'none',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#FFF9EF',
            background: played,
            flex: '0 0 auto',
          }}
        >
          {playing ? <Pause size={18} weight="fill" /> : <Play size={18} weight="fill" />}
        </button>
        <div className="font-mono" style={{ fontSize: 11.5, color: 'var(--muted)', letterSpacing: '0.04em' }}>
          {formatTime(at)} / {total > 0 ? formatTime(total) : '--:--'}
          {!data && isFetching ? '  ·  building waveform…' : ''}
        </div>
        <SaveMp3Button asset={asset} />
      </div>
    </div>
  )
}

/**
 * Сохранить трек как MP3 (конвертация в браузере, см. lib/audio/mp3). Кнопка справа в
 * ряду управления — общая для деталей и лайтбокса. На время кодирования блокируется.
 */
function SaveMp3Button({ asset }: { asset: Asset }) {
  const showToast = useToast()
  const { hovered, bind } = useHover()
  const [saving, setSaving] = useState(false)

  const onClick = async () => {
    if (saving) return
    setSaving(true)
    showToast(asset.ext.toLowerCase() === 'mp3' ? 'Saving…' : 'Converting to MP3…')
    try {
      await saveAudioAsMp3(asset)
      showToast('Saved as MP3')
    } catch {
      showToast('Could not save as MP3')
    } finally {
      setSaving(false)
    }
  }

  return (
    <button
      type="button"
      title="Save as MP3"
      onClick={onClick}
      disabled={saving}
      {...bind}
      style={{
        marginLeft: 'auto',
        flex: '0 0 auto',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        border: `1px solid ${hovered && !saving ? 'var(--line3)' : 'var(--line2)'}`,
        background: 'var(--card)',
        borderRadius: 8,
        padding: '6px 11px',
        cursor: saving ? 'default' : 'pointer',
        opacity: saving ? 0.6 : 1,
        color: 'var(--ink2)',
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      <DownloadSimple size={13} weight="bold" />
      {saving ? 'Converting…' : 'Save MP3'}
    </button>
  )
}
