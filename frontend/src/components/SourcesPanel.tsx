import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api/client'
import type { Source } from '../api/types'

interface Props {
  selectedId: number | null
  onSelect: (source: Source | null) => void
}

export function SourcesPanel({ selectedId, onSelect }: Props) {
  const queryClient = useQueryClient()
  const { data: sources } = useQuery({ queryKey: ['sources'], queryFn: api.getSources })

  const [adding, setAdding] = useState(false)
  const [root, setRoot] = useState('')
  const [error, setError] = useState<string | null>(null)

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['sources'] })
    queryClient.invalidateQueries({ queryKey: ['scan-status'] })
  }

  const addMutation = useMutation({
    mutationFn: (path: string) => api.addSource('', path),
    onSuccess: () => {
      invalidate()
      setRoot('')
      setAdding(false)
      setError(null)
    },
    onError: (e: Error) => setError(e.message),
  })

  const deleteMutation = useMutation({
    mutationFn: api.deleteSource,
    onSuccess: (_, id) => {
      invalidate()
      queryClient.invalidateQueries({ queryKey: ['assets'] })
      if (selectedId === id) onSelect(null)
    },
  })

  const scanMutation = useMutation({
    mutationFn: api.triggerScan,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['scan-status'] }),
  })

  return (
    <div className="border-b border-zinc-800 p-3">
      <div className="mb-2 flex items-center justify-between">
        <h2 className="text-xs font-semibold tracking-wider text-zinc-400 uppercase">Источники</h2>
        <button
          onClick={() => setAdding(!adding)}
          className="rounded px-2 py-0.5 text-sm text-zinc-400 hover:bg-zinc-800 hover:text-zinc-100"
          title="Добавить папку"
        >
          {adding ? '✕' : '＋'}
        </button>
      </div>

      {adding && (
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (root.trim()) addMutation.mutate(root.trim())
          }}
          className="mb-2"
        >
          <input
            autoFocus
            value={root}
            onChange={(e) => setRoot(e.target.value)}
            placeholder="C:\Путь\К\Папке"
            className="w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 placeholder-zinc-600 focus:border-blue-500 focus:outline-none"
          />
          {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
        </form>
      )}

      <ul className="space-y-0.5">
        {sources?.map((src) => (
          <li
            key={src.id}
            className={`group flex cursor-pointer items-center justify-between rounded px-2 py-1 text-sm ${
              selectedId === src.id ? 'bg-blue-600/20 text-blue-300' : 'text-zinc-300 hover:bg-zinc-800'
            }`}
            onClick={() => onSelect(src)}
            title={src.root}
          >
            <span className="truncate">📁 {src.name}</span>
            <span className="hidden shrink-0 gap-1 group-hover:flex">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  scanMutation.mutate(src.id)
                }}
                className="rounded px-1 text-zinc-400 hover:text-zinc-100"
                title="Пересканировать"
              >
                ⟳
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  if (confirm(`Удалить источник «${src.name}» из индекса? Файлы на диске не трогаются.`))
                    deleteMutation.mutate(src.id)
                }}
                className="rounded px-1 text-zinc-400 hover:text-red-400"
                title="Удалить из индекса"
              >
                🗑
              </button>
            </span>
          </li>
        ))}
        {sources?.length === 0 && !adding && (
          <li className="px-2 py-1 text-xs text-zinc-500">Нажмите ＋ и добавьте папку с ассетами</li>
        )}
      </ul>
    </div>
  )
}
