import { FolderPlus, GearSix, MagnifyingGlass, Moon, Sun } from '@phosphor-icons/react'
import { ACCENT, ACCENT_HOVER } from '../theme'
import { useHover } from '../hooks/useHover'
import { IconButton, Kbd } from './ui'

interface Props {
  dark: boolean
  onToggleTheme: () => void
  onOpenPalette: () => void
  onOpenSettings: () => void
  onAddFolder: () => void
}

export function TitleBar({ dark, onToggleTheme, onOpenPalette, onOpenSettings, onAddFolder }: Props) {
  return (
    <div
      style={{
        height: 46,
        flex: '0 0 auto',
        display: 'flex',
        alignItems: 'center',
        gap: 14,
        padding: '0 14px 0 16px',
        borderBottom: '1px solid var(--line)',
      }}
    >
      <div style={{ display: 'flex', gap: 7, alignItems: 'center' }}>
        {[0, 1, 2].map((i) => (
          <div key={i} style={{ width: 11, height: 11, borderRadius: '50%', background: 'var(--dots)' }} />
        ))}
      </div>

      <div style={{ fontSize: 15.5, fontWeight: 700, letterSpacing: '-0.02em', marginLeft: 4 }}>
        assetboss<span style={{ color: ACCENT }}>.</span>
      </div>
      <div className="font-mono" style={{ fontSize: 10.5, color: 'var(--faint)', marginTop: 1 }}>
        v0.3 · local library
      </div>

      <div style={{ flex: 1 }} />

      <PaletteTrigger onClick={onOpenPalette} />

      <IconButton onClick={onToggleTheme} title={dark ? 'Light theme' : 'Dark theme'}>
        {dark ? <Sun size={17} weight="bold" /> : <Moon size={17} weight="bold" />}
      </IconButton>

      <IconButton onClick={onOpenSettings} title="Settings">
        <GearSix size={17} weight="bold" />
      </IconButton>

      <AddFolderButton onClick={onAddFolder} />
    </div>
  )
}

function PaletteTrigger({ onClick }: { onClick: () => void }) {
  const { hovered, bind } = useHover()
  return (
    <button
      type="button"
      onClick={onClick}
      {...bind}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: 'var(--card)',
        border: `1px solid ${hovered ? 'var(--line3)' : 'var(--line2)'}`,
        borderRadius: 8,
        padding: '6px 10px',
        cursor: 'pointer',
        fontSize: 12.5,
        color: 'var(--muted)',
      }}
    >
      <MagnifyingGlass size={14} />
      <span>Anything…</span>
      <Kbd>⌘K</Kbd>
    </button>
  )
}

function AddFolderButton({ onClick }: { onClick: () => void }) {
  const { hovered, bind } = useHover()
  return (
    <button
      type="button"
      onClick={onClick}
      className="ab-press"
      {...bind}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 7,
        background: hovered ? ACCENT_HOVER : ACCENT,
        color: '#FFF9EF',
        border: 'none',
        borderRadius: 8,
        padding: '8px 14px',
        cursor: 'pointer',
        fontSize: 13,
        fontWeight: 600,
      }}
    >
      <FolderPlus size={15} weight="bold" />
      Add folder
    </button>
  )
}
