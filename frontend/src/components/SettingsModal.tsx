import { FolderSimple, X } from '@phosphor-icons/react'
import { useState } from 'react'
import type { Source } from '../api/types'
import { ACCENT } from '../theme'
import { IconButton } from './ui'
import { AddProviderButton, EditableSourceName, RemoveButton, panelInputStyle } from './settingsKit'
import { providerExtensions } from '../extensions'
import type { ExtensionContext } from '../extensions/types'

interface Props {
  open: boolean
  onClose: () => void
  dark: boolean
  setDark: (dark: boolean) => void
  thumbMin: number
  setThumbMin: (value: number) => void
  showExt: boolean
  setShowExt: (value: boolean) => void
  sources: Source[] | undefined
  addSource: (path: string) => Promise<string | null>
  removeSource: (id: number) => void
  renameSource: (id: number, name: string) => Promise<string | null>
  showToast: (message: string) => void
}

const SIZE_PRESETS: [string, number][] = [
  ['S', 176],
  ['M', 216],
  ['L', 264],
]

export function SettingsModal({
  open,
  onClose,
  dark,
  setDark,
  thumbMin,
  setThumbMin,
  showExt,
  setShowExt,
  sources,
  addSource,
  removeSource,
  renameSource,
  showToast,
}: Props) {
  const [adding, setAdding] = useState(false)
  const [path, setPath] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  if (!open) return null

  // Локальные папки; источники сторонних провайдеров рисуют их собственные секции-расширения.
  const folders = sources?.filter((s) => s.scheme === 'local')

  const extCtx: ExtensionContext = { sources, removeSource, renameSource, showToast }

  const submitFolder = async () => {
    const trimmed = path.trim()
    if (!trimmed) return
    setBusy(true)
    const err = await addSource(trimmed)
    setBusy(false)
    if (err) {
      setError(err)
    } else {
      setPath('')
      setError(null)
      setAdding(false)
    }
  }

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,14,12,0.45)' }} />
      <div
        className="ab-modal"
        style={{
          position: 'absolute',
          top: '50%',
          left: '50%',
          transform: 'translate(-50%, -50%)',
          width: 460,
          maxWidth: 'calc(100vw - 48px)',
          background: 'var(--panel)',
          borderRadius: 16,
          boxShadow: '0 40px 100px var(--sh2)',
          padding: '22px 22px 18px',
          maxHeight: 'calc(100vh - 80px)',
          overflowY: 'auto',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: 18 }}>
          <div style={{ fontSize: 16, fontWeight: 700, letterSpacing: '-0.01em' }}>Settings</div>
          <div style={{ flex: 1 }} />
          <IconButton onClick={onClose} title="Close" size={28}>
            <X size={15} weight="bold" />
          </IconButton>
        </div>

        <SettingRow title="Appearance" subtitle="Light or dark interface">
          <Segmented
            options={[
              { label: 'Light', active: !dark, onClick: () => setDark(false) },
              { label: 'Dark', active: dark, onClick: () => setDark(true) },
            ]}
            minWidth={48}
          />
        </SettingRow>

        <SettingRow title="Thumbnail size" subtitle="Density of the library grid">
          <Segmented
            options={SIZE_PRESETS.map(([label, px]) => ({
              label,
              active: thumbMin === px,
              onClick: () => setThumbMin(px),
            }))}
            minWidth={34}
          />
        </SettingRow>

        <SettingRow title="Show file extensions" subtitle="Display full filenames in cards">
          <Toggle on={showExt} onClick={() => setShowExt(!showExt)} />
        </SettingRow>

        <div style={{ padding: '12px 0 4px' }}>
          <div style={{ fontSize: 13.5, fontWeight: 600, marginBottom: 8 }}>Watched folders</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {folders?.map((src) => (
              <div
                key={src.id}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 10,
                  background: 'var(--card)',
                  border: '1px solid var(--line)',
                  borderRadius: 8,
                  padding: '8px 10px',
                }}
              >
                <FolderSimple size={15} color="var(--faint)" />
                <EditableSourceName source={src} onRename={renameSource} />
                <RemoveButton onClick={() => removeSource(src.id)} />
              </div>
            ))}

            {adding && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                <input
                  autoFocus
                  value={path}
                  onChange={(e) => setPath(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') submitFolder()
                    if (e.key === 'Escape') {
                      setAdding(false)
                      setError(null)
                    }
                  }}
                  placeholder="C:\Path\To\Assets"
                  className="font-mono"
                  style={panelInputStyle}
                />
                {error && <span style={{ fontSize: 11, color: 'var(--danger)' }}>{error}</span>}
              </div>
            )}

            <AddProviderButton
              busy={busy}
              label="Add folder"
              onClick={() => {
                if (adding) submitFolder()
                else setAdding(true)
              }}
            />
          </div>
        </div>

        {providerExtensions.map((ext) => (
          <div key={ext.id} style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--line)' }}>
            <ext.SettingsSection ctx={extCtx} />
          </div>
        ))}
      </div>
    </div>
  )
}

function SettingRow({
  title,
  subtitle,
  children,
}: {
  title: string
  subtitle: string
  children: React.ReactNode
}) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0' }}>
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{title}</div>
        <div style={{ fontSize: 12, color: 'var(--muted)', marginTop: 2 }}>{subtitle}</div>
      </div>
      {children}
    </div>
  )
}

function Segmented({
  options,
  minWidth,
}: {
  options: { label: string; active: boolean; onClick: () => void }[]
  minWidth: number
}) {
  return (
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
      {options.map((o) => (
        <button
          key={o.label}
          type="button"
          onClick={o.onClick}
          style={{
            minWidth,
            height: 26,
            border: 'none',
            borderRadius: 6,
            cursor: 'pointer',
            fontSize: 12,
            fontWeight: 600,
            background: o.active ? 'var(--inkBg)' : 'transparent',
            color: o.active ? 'var(--inkFg)' : 'var(--muted)',
          }}
        >
          {o.label}
        </button>
      ))}
    </div>
  )
}

function Toggle({ on, onClick }: { on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        width: 40,
        height: 23,
        borderRadius: 999,
        border: 'none',
        cursor: 'pointer',
        background: on ? ACCENT : 'var(--line3)',
        position: 'relative',
        transition: 'background 0.18s ease',
        flex: '0 0 auto',
      }}
    >
      <div
        style={{
          position: 'absolute',
          top: 2.5,
          left: on ? 19.5 : 2.5,
          width: 18,
          height: 18,
          borderRadius: '50%',
          background: '#FFFFFF',
          boxShadow: '0 1px 3px rgba(0,0,0,0.25)',
          transition: 'left 0.18s ease',
        }}
      />
    </button>
  )
}
