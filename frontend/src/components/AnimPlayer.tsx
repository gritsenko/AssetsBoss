import { Pause, Play, SkipBack, SkipForward } from '@phosphor-icons/react'
import type { AnimClip, AnimGroupDetail } from '../api/types'
import type { useFramePlayer } from '../hooks/useFramePlayer'
import { useHover } from '../hooks/useHover'
import { formatClipName } from '../lib/anim'
import { ACCENT } from '../theme'

/**
 * Общие контролы покадрового плеера для панели деталей и лайтбокса.
 * glass-режим — светлые элементы поверх тёмного оверлея лайтбокса.
 */

export type FramePlayer = ReturnType<typeof useFramePlayer>

export function AnimPlayerControls({
  detail,
  clipIndex,
  onSelectClip,
  player,
  glass,
}: {
  detail: AnimGroupDetail
  clipIndex: number
  onSelectClip: (index: number) => void
  player: FramePlayer
  glass?: boolean
}) {
  const clip = detail.clips[clipIndex]
  return (
    <>
      <ClipChips
        clips={detail.clips}
        groupName={detail.name}
        active={clipIndex}
        onSelect={onSelectClip}
        glass={glass}
      />
      <PlayerBar
        playing={player.playing}
        onToggle={player.toggle}
        index={player.index}
        count={clip?.frames.length ?? 0}
        onSeek={player.seek}
        onStep={player.step}
        fps={player.fps}
        onCycleFps={player.cycleFps}
        glass={glass}
      />
    </>
  )
}

export function ClipChips({
  clips,
  groupName,
  active,
  onSelect,
  glass,
}: {
  clips: AnimClip[]
  groupName: string
  active: number
  onSelect: (index: number) => void
  glass?: boolean
}) {
  if (clips.length < 2) return null
  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        overflowX: 'auto',
        scrollbarWidth: 'none',
        padding: '2px 0',
      }}
    >
      {clips.map((clip, i) => (
        <ClipChip
          key={clip.name}
          label={formatClipName(clip.name, groupName)}
          count={clip.frames.length}
          active={i === active}
          onClick={() => onSelect(i)}
          glass={glass}
        />
      ))}
    </div>
  )
}

function ClipChip({
  label,
  count,
  active,
  onClick,
  glass,
}: {
  label: string
  count: number
  active: boolean
  onClick: () => void
  glass?: boolean
}) {
  const { hovered, bind } = useHover()
  const idleBg = glass ? 'rgba(245,241,232,0.08)' : 'var(--card)'
  const idleBorder = glass ? 'rgba(245,241,232,0.14)' : hovered ? 'var(--line3)' : 'var(--line2)'
  const idleColor = glass ? '#F5F1E8' : 'var(--ink2)'
  return (
    <button
      type="button"
      onClick={(e) => {
        e.stopPropagation()
        onClick()
      }}
      {...bind}
      style={{
        flex: '0 0 auto',
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        border: `1px solid ${active ? ACCENT : idleBorder}`,
        borderRadius: 999,
        padding: '4px 10px',
        cursor: 'pointer',
        fontSize: 11.5,
        fontWeight: 600,
        background: active ? ACCENT : hovered && glass ? 'rgba(245,241,232,0.14)' : idleBg,
        color: active ? '#FFF9EF' : idleColor,
      }}
    >
      {label}
      <span
        className="font-mono"
        style={{ fontSize: 9, opacity: 0.75, fontWeight: 500 }}
      >
        {count}
      </span>
    </button>
  )
}

export function PlayerBar({
  playing,
  onToggle,
  index,
  count,
  onSeek,
  onStep,
  fps,
  onCycleFps,
  glass,
}: {
  playing: boolean
  onToggle: () => void
  index: number
  count: number
  onSeek: (i: number) => void
  onStep: (delta: number) => void
  fps: number
  onCycleFps: () => void
  glass?: boolean
}) {
  const color = glass ? '#F5F1E8' : 'var(--ink)'
  return (
    <div
      onClick={(e) => e.stopPropagation()}
      onDoubleClick={(e) => e.stopPropagation()}
      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%' }}
    >
      <PlayerButton title="Previous frame (←)" onClick={() => onStep(-1)} glass={glass}>
        <SkipBack size={13} weight="fill" />
      </PlayerButton>
      <PlayerButton
        title={playing ? 'Pause (Space)' : 'Play (Space)'}
        onClick={onToggle}
        glass={glass}
        primary
      >
        {playing ? <Pause size={15} weight="fill" /> : <Play size={15} weight="fill" />}
      </PlayerButton>
      <PlayerButton title="Next frame (→)" onClick={() => onStep(1)} glass={glass}>
        <SkipForward size={13} weight="fill" />
      </PlayerButton>

      <input
        type="range"
        min={0}
        max={Math.max(0, count - 1)}
        value={index}
        onChange={(e) => onSeek(Number(e.target.value))}
        style={{ flex: 1, accentColor: ACCENT, minWidth: 0 }}
      />

      <div
        className="font-mono"
        style={{ fontSize: 10.5, color, opacity: 0.8, flex: '0 0 auto', minWidth: 52, textAlign: 'right' }}
      >
        {index + 1} / {count}
      </div>

      <button
        type="button"
        title="Playback speed"
        onClick={onCycleFps}
        className="font-mono"
        style={{
          flex: '0 0 auto',
          border: `1px solid ${glass ? 'rgba(245,241,232,0.18)' : 'var(--line2)'}`,
          borderRadius: 6,
          background: 'transparent',
          color,
          opacity: 0.85,
          fontSize: 10,
          padding: '3px 7px',
          cursor: 'pointer',
        }}
      >
        {fps} fps
      </button>
    </div>
  )
}

function PlayerButton({
  title,
  onClick,
  children,
  glass,
  primary,
}: {
  title: string
  onClick: () => void
  children: React.ReactNode
  glass?: boolean
  primary?: boolean
}) {
  const { hovered, bind } = useHover()
  const size = primary ? 30 : 26
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      {...bind}
      style={{
        width: size,
        height: size,
        flex: '0 0 auto',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 'none',
        borderRadius: '50%',
        cursor: 'pointer',
        background: primary
          ? ACCENT
          : hovered
            ? glass
              ? 'rgba(245,241,232,0.16)'
              : 'var(--hover)'
            : 'transparent',
        color: primary ? '#FFF9EF' : glass ? '#F5F1E8' : 'var(--ink2)',
      }}
    >
      {children}
    </button>
  )
}
