import { useHover } from '../hooks/useHover'
import { type DisplayKind, KIND_META, NAV_KINDS } from '../lib/kind'

interface Props {
  activeKind: DisplayKind | null
  onSelectKind: (kind: DisplayKind | null) => void
}

/** Quick single-select type chips (mirrors the backend's single `kind` filter). */
export function FilterChips({ activeKind, onSelectKind }: Props) {
  return (
    <div
      style={{
        padding: '10px 20px 0',
        display: 'flex',
        gap: 7,
        flexWrap: 'wrap',
        alignItems: 'center',
      }}
    >
      {NAV_KINDS.map((kind) => (
        <Chip
          key={kind}
          label={KIND_META[kind].label}
          active={activeKind === kind}
          onClick={() => onSelectKind(activeKind === kind ? null : kind)}
        />
      ))}
    </div>
  )
}

function Chip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  const { hovered, bind } = useHover()
  return (
    <button
      type="button"
      onClick={onClick}
      {...bind}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 6,
        fontSize: 12,
        fontWeight: 500,
        padding: '5px 12px',
        borderRadius: 999,
        cursor: 'pointer',
        background: active ? 'var(--inkBg)' : 'var(--card)',
        color: active ? 'var(--inkFg)' : 'var(--muted)',
        border: `1px solid ${active ? 'var(--inkBg)' : hovered ? 'var(--line3)' : 'var(--line2)'}`,
      }}
    >
      {label}
    </button>
  )
}
