import type { ScanStatus, Source } from '../api/types'

interface Props {
  statuses: ScanStatus[] | undefined
  sources: Source[] | undefined
}

export function ScanStatusBar({ statuses, sources }: Props) {
  const active = statuses?.filter((s) => s.state === 'queued' || s.state === 'running') ?? []
  const failed = statuses?.filter((s) => s.state === 'failed') ?? []

  if (active.length === 0 && failed.length === 0) return null

  const nameOf = (sourceId: number) =>
    sources?.find((s) => s.id === sourceId)?.name ?? `#${sourceId}`

  return (
    <footer className="border-t border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs">
      {active.map((s) => (
        <div key={s.sourceId} className="flex items-center gap-2 text-zinc-400">
          <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-blue-500" />
          <span className="shrink-0">
            {s.state === 'queued' ? 'В очереди:' : 'Сканирую'} {nameOf(s.sourceId)} —{' '}
            {s.seen.toLocaleString('ru-RU')} файлов
            {s.added > 0 && `, +${s.added.toLocaleString('ru-RU')}`}
            {s.removed > 0 && `, −${s.removed.toLocaleString('ru-RU')}`}
          </span>
          {s.currentDir && <span className="truncate font-mono text-zinc-600">/{s.currentDir}</span>}
        </div>
      ))}
      {failed.map((s) => (
        <div key={s.sourceId} className="text-red-400">
          Скан {nameOf(s.sourceId)} упал: {s.error}
        </div>
      ))}
    </footer>
  )
}
