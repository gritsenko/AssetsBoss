interface Props {
  value: string
  onChange: (value: string) => void
}

export function SearchBar({ value, onChange }: Props) {
  return (
    <div className="relative flex-1">
      <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-zinc-500">
        🔍
      </span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Поиск по имени и пути…"
        className="w-full rounded-lg border border-zinc-700 bg-zinc-900 py-1.5 pr-8 pl-9 text-sm text-zinc-100 placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
      />
      {value && (
        <button
          onClick={() => onChange('')}
          className="absolute top-1/2 right-2 -translate-y-1/2 text-zinc-500 hover:text-zinc-200"
        >
          ✕
        </button>
      )}
    </div>
  )
}
