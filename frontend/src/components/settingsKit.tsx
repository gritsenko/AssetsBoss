import { PencilSimple, Plus, X } from '@phosphor-icons/react'
import { useState } from 'react'
import type { Source } from '../api/types'
import { ACCENT } from '../theme'
import { useHover } from '../hooks/useHover'

/** Общий стиль инпутов в панелях настроек (источники, формы добавления). */
export const panelInputStyle: React.CSSProperties = {
  background: 'var(--card)',
  border: '1px solid var(--line2)',
  borderRadius: 8,
  padding: '8px 10px',
  fontSize: 11,
  color: 'var(--ink)',
}

/** Имя источника с инлайн-редактированием (карандаш → input). Tooltip — полный root. */
export function EditableSourceName({
  source,
  onRename,
}: {
  source: Source
  onRename: (id: number, name: string) => Promise<string | null>
}) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(source.name)
  const [busy, setBusy] = useState(false)
  const { hovered, bind } = useHover()

  const commit = async () => {
    const name = value.trim()
    if (!name || name === source.name) {
      setValue(source.name)
      setEditing(false)
      return
    }
    setBusy(true)
    const err = await onRename(source.id, name)
    setBusy(false)
    if (err) setValue(source.name)
    setEditing(false)
  }

  if (editing) {
    return (
      <input
        autoFocus
        value={value}
        disabled={busy}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') commit()
          if (e.key === 'Escape') {
            setValue(source.name)
            setEditing(false)
          }
        }}
        className="font-mono"
        style={{ ...panelInputStyle, flex: 1, padding: '4px 8px', minWidth: 0 }}
      />
    )
  }

  return (
    <span {...bind} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }} title={source.root}>
      <span
        className="font-mono"
        style={{
          fontSize: 11,
          color: 'var(--ink2)',
          whiteSpace: 'nowrap',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
        }}
      >
        {source.name}
      </span>
      <button
        type="button"
        onClick={() => {
          setValue(source.name)
          setEditing(true)
        }}
        title="Rename"
        style={{
          border: 'none',
          background: 'transparent',
          cursor: 'pointer',
          color: hovered ? ACCENT : 'var(--faint)',
          display: 'flex',
          padding: 2,
          flex: '0 0 auto',
        }}
      >
        <PencilSimple size={12} weight="bold" />
      </button>
    </span>
  )
}

export function RemoveButton({ onClick }: { onClick: () => void }) {
  const { hovered, bind } = useHover()
  return (
    <button
      type="button"
      onClick={onClick}
      {...bind}
      title="Remove from index"
      style={{
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        color: hovered ? 'var(--danger)' : 'var(--faint)',
        display: 'flex',
        padding: 2,
      }}
    >
      <X size={12} weight="bold" />
    </button>
  )
}

/** Пунктирная кнопка «добавить …» с настраиваемым лейблом (источник любого провайдера). */
export function AddProviderButton({
  busy,
  label,
  onClick,
}: {
  busy: boolean
  label: string
  onClick: () => void
}) {
  const { hovered, bind } = useHover()
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      {...bind}
      style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 7,
        border: `1px dashed ${hovered ? ACCENT : 'var(--line3)'}`,
        background: 'transparent',
        borderRadius: 8,
        padding: '9px 0',
        cursor: busy ? 'default' : 'pointer',
        fontSize: 12.5,
        fontWeight: 600,
        color: hovered ? ACCENT : 'var(--muted)',
        opacity: busy ? 0.6 : 1,
      }}
    >
      <Plus size={13} weight="bold" />
      {busy ? 'Adding…' : label}
    </button>
  )
}
