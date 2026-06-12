import { HardDrives, Square, SquaresFour } from '@phosphor-icons/react'
import { ACCENT } from '../theme'

interface Props {
  leftText: string
  view: 'grid' | 'list'
  thumbMin: number
  onThumbMin: (value: number) => void
  sourcePath: string
}

export function StatusBar({ leftText, view, thumbMin, onThumbMin, sourcePath }: Props) {
  return (
    <div
      className="font-mono"
      style={{
        height: 32,
        flex: '0 0 auto',
        borderTop: '1px solid var(--line)',
        display: 'flex',
        alignItems: 'center',
        gap: 16,
        padding: '0 16px',
        fontSize: 10.5,
        color: 'var(--faint)',
      }}
    >
      <span>{leftText}</span>
      <span style={{ flex: 1 }} />
      {view === 'grid' && (
        <>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <SquaresFour size={11} weight="bold" />
            <input
              type="range"
              min={140}
              max={320}
              step={4}
              value={thumbMin}
              onChange={(e) => onThumbMin(Number(e.target.value))}
              style={{ width: 120, accentColor: ACCENT, cursor: 'pointer', margin: 0 }}
            />
            <Square size={13} weight="bold" />
          </span>
          <span style={{ color: 'var(--line3)' }}>|</span>
        </>
      )}
      <span style={{ display: 'flex', alignItems: 'center', gap: 6, maxWidth: 360, overflow: 'hidden' }}>
        <HardDrives size={12} weight="bold" />
        <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sourcePath}</span>
      </span>
    </div>
  )
}
