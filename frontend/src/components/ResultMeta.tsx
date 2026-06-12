import { Sparkle } from '@phosphor-icons/react'
import { ACCENT } from '../theme'
import { useHover } from '../hooks/useHover'

interface Props {
  dir: string
  hasSourceScope: boolean
  onNavigate: (dir: string) => void
  count: number | undefined
  approxNote?: string | null
}

export function ResultMeta({ dir, hasSourceScope, onNavigate, count, approxNote }: Props) {
  const segments = dir ? dir.split('/') : []
  const showCrumbs = hasSourceScope

  return (
    <div
      className="font-mono"
      style={{
        padding: '12px 22px 6px',
        display: 'flex',
        gap: 12,
        alignItems: 'center',
        fontSize: 10.5,
        color: 'var(--faint)',
      }}
    >
      {showCrumbs && (
        <>
          <span style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <Crumb label="All" color="var(--faint)" onClick={() => onNavigate('')} />
            {segments.map((seg, i) => {
              const path = segments.slice(0, i + 1).join('/')
              const last = i === segments.length - 1
              return (
                <span key={path} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span>/</span>
                  <Crumb
                    label={seg}
                    color={last ? 'var(--ink)' : 'var(--faint)'}
                    onClick={() => onNavigate(path)}
                  />
                </span>
              )
            })}
          </span>
          <span style={{ color: 'var(--line3)' }}>·</span>
        </>
      )}
      <span>
        {count === undefined
          ? '…'
          : `${count.toLocaleString()} ${count === 1 ? 'asset' : 'assets'}`}
      </span>
      {approxNote && (
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: ACCENT }}>
          <Sparkle size={11} weight="bold" />
          {approxNote}
        </span>
      )}
    </div>
  )
}

function Crumb({ label, color, onClick }: { label: string; color: string; onClick: () => void }) {
  const { hovered, bind } = useHover()
  return (
    <button
      type="button"
      onClick={onClick}
      {...bind}
      className="font-mono"
      style={{
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        fontSize: 10.5,
        padding: 0,
        color: hovered ? ACCENT : color,
      }}
    >
      {label}
    </button>
  )
}
