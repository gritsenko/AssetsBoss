import { useQuery } from '@tanstack/react-query'
import { FolderSimple } from '@phosphor-icons/react'
import { api } from '../api/client'
import { ACCENT } from '../theme'
import { useHover } from '../hooks/useHover'
import { AssetThumb } from './AssetThumb'
import { SectionLabel } from './ui'

interface Props {
  sourceId: number
  dir: string
  onOpenFolder: (path: string) => void
}

/**
 * Explorer/Unity-style tiles for the immediate subfolders of the current dir,
 * each with a 2×2 collage of thumbnails pulled recursively from inside it.
 * Renders nothing when the current folder has no subfolders.
 */
export function FolderCards({ sourceId, dir, onOpenFolder }: Props) {
  const { data: dirs } = useQuery({
    queryKey: ['dirs', sourceId, dir],
    queryFn: () => api.getDirs(sourceId, dir),
  })

  if (!dirs?.length) return null

  return (
    <div style={{ marginBottom: 6 }}>
      <SectionLabel style={{ padding: '4px 2px 8px' }}>Folders</SectionLabel>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(186px, 1fr))', gap: 10 }}>
        {dirs.map((d) => (
          <FolderCard
            key={d.path}
            sourceId={sourceId}
            path={d.path}
            name={d.name}
            onClick={() => onOpenFolder(d.path)}
          />
        ))}
      </div>
      <SectionLabel style={{ padding: '16px 2px 8px' }}>Assets</SectionLabel>
    </div>
  )
}

function FolderCard({
  sourceId,
  path,
  name,
  onClick,
}: {
  sourceId: number
  path: string
  name: string
  onClick: () => void
}) {
  const { hovered, bind } = useHover()
  const { data } = useQuery({
    queryKey: ['folderPreview', sourceId, path],
    // разнообразная выборка (разные клипы/подпапки), а не 4 соседних кадра одного клипа
    queryFn: () => api.getFolderPreview(sourceId, path, 4),
  })
  const items = data?.items ?? []

  return (
    <div
      onClick={onClick}
      {...bind}
      style={{
        background: 'var(--card)',
        border: '1px solid var(--line)',
        borderRadius: 10,
        padding: 8,
        cursor: 'pointer',
        transition: 'box-shadow 0.15s ease, transform 0.15s ease',
        boxShadow: hovered ? '0 8px 22px var(--sh1)' : 'none',
        transform: hovered ? 'translateY(-2px)' : 'none',
      }}
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 3, borderRadius: 6, overflow: 'hidden' }}>
        {[0, 1, 2, 3].map((i) => {
          const a = items[i]
          return (
            <div key={i} style={{ position: 'relative', aspectRatio: '16 / 9', background: 'var(--well)' }}>
              {a && <AssetThumb asset={a} size={256} iconSize={16} />}
            </div>
          )
        })}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 4px 2px' }}>
        <FolderSimple size={14} weight="bold" color={ACCENT} />
        <span
          style={{
            flex: 1,
            fontSize: 12.5,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
        >
          {name}
        </span>
        <span className="font-mono" style={{ fontSize: 10, color: 'var(--faint)' }}>
          {data?.total?.toLocaleString() ?? ''}
        </span>
      </div>
    </div>
  )
}
