import type { AssetKind } from '../api/types'

const KINDS: { value: AssetKind | null; label: string }[] = [
  { value: null, label: 'Все' },
  { value: 'image', label: '🖼️ Картинки' },
  { value: 'audio', label: '🔊 Аудио' },
  { value: 'model', label: '🧊 3D' },
  { value: 'other', label: '📄 Прочее' },
]

interface Props {
  value: AssetKind | null
  onChange: (kind: AssetKind | null) => void
}

export function TypeFilter({ value, onChange }: Props) {
  return (
    <div className="flex gap-1">
      {KINDS.map((kind) => (
        <button
          key={kind.label}
          onClick={() => onChange(kind.value)}
          className={`rounded-full px-3 py-1 text-sm whitespace-nowrap ${
            value === kind.value
              ? 'bg-blue-600 text-white'
              : 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'
          }`}
        >
          {kind.label}
        </button>
      ))}
    </div>
  )
}
