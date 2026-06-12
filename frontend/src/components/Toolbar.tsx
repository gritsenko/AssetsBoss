import { MagnifyingGlass, Rows, SidebarSimple, SquaresFour, X } from '@phosphor-icons/react'
import { useState } from 'react'
import { ACCENT } from '../theme'

export type ViewMode = 'grid' | 'list'

interface Props {
  query: string
  onQueryChange: (value: string) => void
  view: ViewMode
  onViewChange: (view: ViewMode) => void
  panelOpen: boolean
  onTogglePanel: () => void
}

export function Toolbar({ query, onQueryChange, view, onViewChange, panelOpen, onTogglePanel }: Props) {
  const [focused, setFocused] = useState(false)

  return (
    <div style={{ padding: '14px 20px 0', display: 'flex', gap: 10, alignItems: 'center' }}>
      <div
        style={{
          flex: 1,
          maxWidth: 560,
          display: 'flex',
          alignItems: 'center',
          gap: 9,
          background: 'var(--card)',
          border: `1px solid ${focused ? ACCENT : 'var(--line2)'}`,
          borderRadius: 10,
          padding: '9px 12px',
        }}
      >
        <MagnifyingGlass size={16} color="var(--faint)" />
        <input
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          onFocus={() => setFocused(true)}
          onBlur={() => setFocused(false)}
          placeholder="Search assets by name and path…"
          style={{
            flex: 1,
            border: 'none',
            background: 'transparent',
            fontSize: 13.5,
            color: 'var(--ink)',
          }}
        />
        {query.length > 0 && (
          <button
            type="button"
            onClick={() => onQueryChange('')}
            style={{
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: 'var(--faint)',
              display: 'flex',
              padding: 0,
            }}
          >
            <X size={13} weight="bold" />
          </button>
        )}
      </div>

      <div style={{ flex: 1 }} />

      <div
        style={{
          display: 'flex',
          background: 'var(--card)',
          border: '1px solid var(--line2)',
          borderRadius: 9,
          padding: 3,
          gap: 2,
        }}
      >
        <ViewButton active={view === 'grid'} onClick={() => onViewChange('grid')}>
          <SquaresFour size={15} weight="bold" />
        </ViewButton>
        <ViewButton active={view === 'list'} onClick={() => onViewChange('list')}>
          <Rows size={15} weight="bold" />
        </ViewButton>
      </div>

      <button
        type="button"
        onClick={onTogglePanel}
        title={panelOpen ? 'Hide details panel' : 'Show details panel'}
        style={{
          width: 34,
          height: 32,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: '1px solid var(--line2)',
          borderRadius: 9,
          cursor: 'pointer',
          background: panelOpen ? 'var(--inkBg)' : 'var(--card)',
          color: panelOpen ? 'var(--inkFg)' : 'var(--muted)',
        }}
      >
        <SidebarSimple size={16} weight="bold" style={{ transform: 'scaleX(-1)' }} />
      </button>
    </div>
  )
}

function ViewButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: 30,
        height: 26,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 'none',
        borderRadius: 6,
        cursor: 'pointer',
        background: active ? 'var(--inkBg)' : 'transparent',
        color: active ? 'var(--inkFg)' : 'var(--muted)',
      }}
    >
      {children}
    </button>
  )
}
