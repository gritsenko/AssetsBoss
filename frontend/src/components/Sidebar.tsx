import { useQuery } from '@tanstack/react-query'
import {
  ArrowsClockwise,
  CaretDown,
  CaretRight,
  FolderOpen,
  FolderSimple,
  Stack,
  X,
} from '@phosphor-icons/react'
import { type ReactNode, useEffect, useRef, useState } from 'react'
import { api } from '../api/client'
import type { Source } from '../api/types'
import { ACCENT } from '../theme'
import { useHover } from '../hooks/useHover'
import type { KindCounts } from '../hooks/useKindCounts'
import { ALL_META, type DisplayKind, KIND_META, NAV_KINDS } from '../lib/kind'
import { SectionLabel } from './ui'

interface Props {
  activeKind: DisplayKind | null
  folderActive: boolean
  onSelectKind: (kind: DisplayKind | null) => void
  counts: KindCounts
  sources: Source[] | undefined
  activeSourceId: number | undefined
  onSelectSource: (id: number | undefined) => void
  onRescanSource: (id: number) => void
  onRemoveSource: (id: number) => void
  activeDir: string
  onSelectDir: (dir: string) => void
}

export function Sidebar({
  activeKind,
  folderActive,
  onSelectKind,
  counts,
  sources,
  activeSourceId,
  onSelectSource,
  onRescanSource,
  onRemoveSource,
  activeDir,
  onSelectDir,
}: Props) {
  const baseActive = activeKind === null && !folderActive
  const kindCount: Record<DisplayKind, number | undefined> = {
    image: counts.image,
    animation: counts.animation,
    model: counts.model,
    audio: counts.audio,
    video: undefined, // нет серверного kind для видео — счётчик не показываем
    other: undefined,
  }

  return (
    <div
      style={{
        width: 230,
        flex: '0 0 auto',
        display: 'flex',
        flexDirection: 'column',
        padding: '14px 10px 10px',
        borderRight: '1px solid var(--line)',
        overflowY: 'auto',
      }}
    >
      <SectionLabel style={{ padding: '0 10px 6px' }}>Library</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <NavRow
          label="All assets"
          icon={<ALL_META.Icon size={16} weight="bold" color={baseActive ? ACCENT : 'var(--muted)'} />}
          count={counts.all}
          active={baseActive}
          onClick={() => onSelectKind(null)}
        />
        {NAV_KINDS.map((kind) => {
          const meta = KIND_META[kind]
          const active = activeKind === kind
          return (
            <NavRow
              key={kind}
              label={meta.label}
              icon={<meta.Icon size={16} weight="bold" color={active ? ACCENT : 'var(--muted)'} />}
              count={kindCount[kind]}
              active={active}
              onClick={() => onSelectKind(active ? null : kind)}
            />
          )
        })}
      </div>

      <SectionLabel style={{ padding: '18px 10px 6px' }}>Sources</SectionLabel>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <NavRow
          label="All sources"
          icon={<Stack size={16} weight="bold" color={activeSourceId === undefined ? ACCENT : 'var(--muted)'} />}
          active={activeSourceId === undefined}
          onClick={() => onSelectSource(undefined)}
        />
        {sources?.map((src) => (
          <SourceRow
            key={src.id}
            source={src}
            active={activeSourceId === src.id}
            onClick={() => onSelectSource(src.id)}
            onRescan={() => onRescanSource(src.id)}
            onRemove={() => onRemoveSource(src.id)}
          />
        ))}
        {sources?.length === 0 && (
          <div style={{ padding: '6px 12px', fontSize: 12, color: 'var(--faint)' }}>
            Add a folder to start indexing.
          </div>
        )}
      </div>

      {activeSourceId !== undefined && (
        <>
          <SectionLabel style={{ padding: '18px 10px 6px' }}>Folders</SectionLabel>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <FolderLevel
              sourceId={activeSourceId}
              parent=""
              depth={0}
              activeDir={activeDir}
              onSelectDir={onSelectDir}
            />
          </div>
        </>
      )}
    </div>
  )
}

function NavRow({
  label,
  icon,
  count,
  active,
  onClick,
  leftPad = 10,
  caret,
  rowRef,
}: {
  label: string
  icon: ReactNode
  count?: number
  active: boolean
  onClick: () => void
  leftPad?: number
  caret?: ReactNode
  rowRef?: React.Ref<HTMLDivElement>
}) {
  const { hovered, bind } = useHover()
  return (
    <div
      ref={rowRef}
      onClick={onClick}
      {...bind}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: caret !== undefined ? 7 : 10,
        padding: `6px 10px 6px ${leftPad}px`,
        borderRadius: 8,
        cursor: 'pointer',
        background: active ? 'var(--card)' : hovered ? 'var(--hover)' : 'transparent',
        fontSize: 13.5,
        fontWeight: active ? 600 : 400,
        boxShadow: active ? '0 1px 4px var(--sh1)' : 'none',
      }}
    >
      {caret}
      {icon}
      <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {label}
      </span>
      {count !== undefined && (
        <span className="font-mono" style={{ fontSize: 10.5, color: 'var(--faint)' }}>
          {count.toLocaleString()}
        </span>
      )}
    </div>
  )
}

function SourceRow({
  source,
  active,
  onClick,
  onRescan,
  onRemove,
}: {
  source: Source
  active: boolean
  onClick: () => void
  onRescan: () => void
  onRemove: () => void
}) {
  const { hovered, bind } = useHover()
  return (
    <div
      onClick={onClick}
      title={source.root}
      {...bind}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '6px 8px 6px 10px',
        borderRadius: 8,
        cursor: 'pointer',
        background: active ? 'var(--card)' : hovered ? 'var(--hover)' : 'transparent',
        fontSize: 13.5,
        fontWeight: active ? 600 : 400,
        boxShadow: active ? '0 1px 4px var(--sh1)' : 'none',
      }}
    >
      <FolderSimple size={16} weight="bold" color={active ? ACCENT : 'var(--muted)'} />
      <span style={{ flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
        {source.name}
      </span>
      {hovered && (
        <span style={{ display: 'flex', gap: 2, flex: '0 0 auto' }}>
          <MiniButton
            title="Rescan"
            onClick={(e) => {
              e.stopPropagation()
              onRescan()
            }}
          >
            <ArrowsClockwise size={13} weight="bold" />
          </MiniButton>
          <MiniButton
            title="Remove from index"
            danger
            onClick={(e) => {
              e.stopPropagation()
              onRemove()
            }}
          >
            <X size={13} weight="bold" />
          </MiniButton>
        </span>
      )}
    </div>
  )
}

function MiniButton({
  children,
  title,
  danger,
  onClick,
}: {
  children: ReactNode
  title: string
  danger?: boolean
  onClick: (e: React.MouseEvent) => void
}) {
  const { hovered, bind } = useHover()
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      {...bind}
      style={{
        width: 22,
        height: 22,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 'none',
        borderRadius: 6,
        cursor: 'pointer',
        background: 'transparent',
        color: hovered ? (danger ? 'var(--danger)' : 'var(--ink)') : 'var(--faint)',
      }}
    >
      {children}
    </button>
  )
}

function FolderLevel({
  sourceId,
  parent,
  depth,
  activeDir,
  onSelectDir,
}: {
  sourceId: number
  parent: string
  depth: number
  activeDir: string
  onSelectDir: (dir: string) => void
}) {
  const { data: dirs } = useQuery({
    queryKey: ['dirs', sourceId, parent],
    queryFn: () => api.getDirs(sourceId, parent),
  })

  if (!dirs?.length) return null

  return (
    <>
      {dirs.map((dir) => (
        <FolderNode
          key={dir.path}
          sourceId={sourceId}
          path={dir.path}
          name={dir.name}
          hasChildren={dir.hasChildren}
          depth={depth}
          activeDir={activeDir}
          onSelectDir={onSelectDir}
        />
      ))}
    </>
  )
}

function FolderNode({
  sourceId,
  path,
  name,
  hasChildren,
  depth,
  activeDir,
  onSelectDir,
}: {
  sourceId: number
  path: string
  name: string
  hasChildren: boolean
  depth: number
  activeDir: string
  onSelectDir: (dir: string) => void
}) {
  // узел лежит на пути к активной папке (сам активен или является её предком)
  const onActivePath = activeDir === path || activeDir.startsWith(path + '/')
  const [expanded, setExpanded] = useState(onActivePath)
  const active = activeDir === path
  const leftPad = 10 + depth * 16
  const rowRef = useRef<HTMLDivElement>(null)

  // при переходе в папку (карточки папок, «перейти к папке» из деталей/лайтбокса)
  // разворачиваем путь до неё; при уходе не сворачиваем — оставляем дерево как есть.
  // подстройка состояния во время рендера, а не в эффекте (так советует React)
  const [wasOnPath, setWasOnPath] = useState(onActivePath)
  if (onActivePath !== wasOnPath) {
    setWasOnPath(onActivePath)
    if (onActivePath) setExpanded(true)
  }

  // подтягиваем активную папку в зону видимости сайдбара
  useEffect(() => {
    if (active) rowRef.current?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const caret = (
    <span
      onClick={(e) => {
        e.stopPropagation()
        if (hasChildren) setExpanded((v) => !v)
      }}
      style={{
        width: 12,
        flex: '0 0 auto',
        color: 'var(--faint)',
        cursor: hasChildren ? 'pointer' : 'default',
        display: 'flex',
        alignItems: 'center',
      }}
    >
      {hasChildren ? (
        expanded ? <CaretDown size={10} weight="bold" /> : <CaretRight size={10} weight="bold" />
      ) : null}
    </span>
  )

  return (
    <>
      <NavRow
        label={name}
        icon={
          expanded && hasChildren ? (
            <FolderOpen size={16} color={active ? ACCENT : 'var(--muted)'} />
          ) : (
            <FolderSimple size={16} color={active ? ACCENT : 'var(--muted)'} />
          )
        }
        active={active}
        onClick={() => onSelectDir(path)}
        leftPad={leftPad}
        caret={caret}
        rowRef={rowRef}
      />
      {expanded && hasChildren && (
        <FolderLevel
          sourceId={sourceId}
          parent={path}
          depth={depth + 1}
          activeDir={activeDir}
          onSelectDir={onSelectDir}
        />
      )}
    </>
  )
}
