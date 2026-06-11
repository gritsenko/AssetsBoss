import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { api } from '../api/client'

interface Props {
  sourceId: number
  selectedDir: string | null
  onSelect: (dir: string) => void
}

export function FolderTree({ sourceId, selectedDir, onSelect }: Props) {
  return (
    <div className="flex-1 overflow-y-auto p-2">
      <button
        onClick={() => onSelect('')}
        className={`mb-1 w-full rounded px-2 py-1 text-left text-sm ${
          selectedDir === '' ? 'bg-blue-600/20 text-blue-300' : 'text-zinc-300 hover:bg-zinc-800'
        }`}
      >
        🏠 Корень
      </button>
      <TreeLevel sourceId={sourceId} parent="" selectedDir={selectedDir} onSelect={onSelect} depth={0} />
    </div>
  )
}

function TreeLevel({
  sourceId,
  parent,
  selectedDir,
  onSelect,
  depth,
}: Props & { parent: string; depth: number }) {
  const { data: dirs } = useQuery({
    queryKey: ['dirs', sourceId, parent],
    queryFn: () => api.getDirs(sourceId, parent),
  })

  if (!dirs?.length) return null

  return (
    <ul>
      {dirs.map((dir) => (
        <TreeNode
          key={dir.path}
          sourceId={sourceId}
          path={dir.path}
          name={dir.name}
          hasChildren={dir.hasChildren}
          selectedDir={selectedDir}
          onSelect={onSelect}
          depth={depth}
        />
      ))}
    </ul>
  )
}

function TreeNode({
  sourceId,
  path,
  name,
  hasChildren,
  selectedDir,
  onSelect,
  depth,
}: {
  sourceId: number
  path: string
  name: string
  hasChildren: boolean
  selectedDir: string | null
  onSelect: (dir: string) => void
  depth: number
}) {
  const [expanded, setExpanded] = useState(false)

  return (
    <li>
      <div
        className={`flex cursor-pointer items-center rounded py-0.5 pr-2 text-sm ${
          selectedDir === path ? 'bg-blue-600/20 text-blue-300' : 'text-zinc-300 hover:bg-zinc-800'
        }`}
        style={{ paddingLeft: `${depth * 14 + 4}px` }}
      >
        <button
          onClick={() => setExpanded(!expanded)}
          className={`w-5 shrink-0 text-center text-xs text-zinc-500 ${hasChildren ? '' : 'invisible'}`}
        >
          {expanded ? '▾' : '▸'}
        </button>
        <span className="flex-1 truncate" onClick={() => onSelect(path)} title={path}>
          {name}
        </span>
      </div>
      {expanded && hasChildren && (
        <TreeLevel
          sourceId={sourceId}
          parent={path}
          selectedDir={selectedDir}
          onSelect={onSelect}
          depth={depth + 1}
        />
      )}
    </li>
  )
}
