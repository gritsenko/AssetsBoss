import { ArrowSquareOut, ArrowsOut, Copy, Cube, FilmStrip, FolderOpen, ImageSquare, X } from '@phosphor-icons/react'
import { useMemo, useState } from 'react'
import { contentUrl, thumbUrl } from '../api/client'
import type { AnimGroupDetail, Asset } from '../api/types'
import { useAnimGroup } from '../hooks/useAnimGroup'
import { useFramePlayer } from '../hooks/useFramePlayer'
import { useHover } from '../hooks/useHover'
import {
  baseName,
  type Entry,
  entryGroupRef,
  formatGroupName,
  frameUrl,
  initialPosition,
  isAnimEntry,
  modelGroupCounts,
} from '../lib/anim'
import { useModelGroup } from '../hooks/useModelGroup'
import { extLabel, formatDate, formatSize } from '../lib/format'
import { displayKind, isBrowserRenderableImage } from '../lib/kind'
import { canViewModel } from '../lib/three/modelFormats'
import { AnimPlayerControls } from './AnimPlayer'
import { IconButton } from './ui'
import { ModelViewer } from './ModelViewerLazy'
import { useToast } from '../hooks/toastContext'

const KIND_NAME: Record<string, string> = {
  image: 'Image',
  video: 'Video',
  audio: 'Audio',
  model: '3D model',
  other: 'File',
}

const PANEL_WIDTH = 360

interface Props {
  entry: Entry | null
  sourceRoot: string | undefined
  dark: boolean
  selectedCount: number
  onClose: () => void
  onOpenFullscreen: (entry: Entry) => void
  onGoToFolder: (asset: Asset) => void
}

function joinPath(root: string | undefined, relPath: string): string {
  if (!root) return relPath
  const sep = root.includes('\\') ? '\\' : '/'
  const rel = sep === '\\' ? relPath.replaceAll('/', '\\') : relPath
  const trimmed = root.replace(/[\\/]+$/, '')
  return `${trimmed}${sep}${rel}`
}

export function DetailPanel({ entry, sourceRoot, dark, selectedCount, onClose, onOpenFullscreen, onGoToFolder }: Props) {
  const title =
    entry === null
      ? 'Details'
      : entry.type === 'group'
        ? formatGroupName(entry.ref.name)
        : entry.type === 'clip'
          ? entry.clipName
          : entry.type === 'modelgroup'
            ? baseName(entry.asset.name)
            : entry.asset.name

  return (
    <div
      style={{
        width: PANEL_WIDTH,
        flex: `0 0 ${PANEL_WIDTH}px`,
        background: 'var(--panel)',
        borderLeft: '1px solid var(--line)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: 0,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '14px 16px 10px' }}>
        <div
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 14,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={title}
        >
          {selectedCount > 1 ? `${selectedCount} assets selected` : title}
        </div>
        <IconButton onClick={onClose} title="Hide panel" size={28}>
          <X size={15} weight="bold" />
        </IconButton>
      </div>

      {entry ? (
        entry.type === 'modelgroup' ? (
          <ModelGroupBody
            key={entry.key}
            entry={entry}
            sourceRoot={sourceRoot}
            dark={dark}
            selectedCount={selectedCount}
            onOpenFullscreen={onOpenFullscreen}
            onGoToFolder={onGoToFolder}
          />
        ) : isAnimEntry(entry) ? (
          <AnimBody
            key={entry.key}
            entry={entry}
            sourceRoot={sourceRoot}
            selectedCount={selectedCount}
            onOpenFullscreen={onOpenFullscreen}
            onGoToFolder={onGoToFolder}
          />
        ) : (
          <Body
            key={entry.key}
            entry={entry}
            asset={entry.asset}
            sourceRoot={sourceRoot}
            dark={dark}
            selectedCount={selectedCount}
            onOpenFullscreen={onOpenFullscreen}
            onGoToFolder={onGoToFolder}
          />
        )
      ) : (
        <Empty />
      )}
    </div>
  )
}

/* ---------- анимационные группы / клипы / кадры ---------- */

function AnimBody({
  entry,
  sourceRoot,
  selectedCount,
  onOpenFullscreen,
  onGoToFolder,
}: {
  entry: Entry
  sourceRoot: string | undefined
  selectedCount: number
  onOpenFullscreen: (entry: Entry) => void
  onGoToFolder: (asset: Asset) => void
}) {
  const ref = entryGroupRef(entry)
  const { data: detail } = useAnimGroup(ref)

  if (!detail) {
    return (
      <div style={{ padding: '120px 24px', textAlign: 'center', color: 'var(--muted)', fontSize: 13 }}>
        Loading animation…
      </div>
    )
  }
  return (
    <AnimLoaded
      entry={entry}
      detail={detail}
      sourceRoot={sourceRoot}
      selectedCount={selectedCount}
      onOpenFullscreen={onOpenFullscreen}
      onGoToFolder={onGoToFolder}
    />
  )
}

function AnimLoaded({
  entry,
  detail,
  sourceRoot,
  selectedCount,
  onOpenFullscreen,
  onGoToFolder,
}: {
  entry: Entry
  detail: AnimGroupDetail
  sourceRoot: string | undefined
  selectedCount: number
  onOpenFullscreen: (entry: Entry) => void
  onGoToFolder: (asset: Asset) => void
}) {
  const showToast = useToast()
  const initial = useMemo(() => initialPosition(entry, detail), [entry, detail])
  const [clipIdx, setClipIdx] = useState(initial.clip)
  const clip = detail.clips[Math.min(clipIdx, detail.clips.length - 1)]
  const player = useFramePlayer(clip.frames, initial.frame)
  const [pixelated, setPixelated] = useState(false)

  const cover = player.frame ?? clip.frames[0]
  const totalFrames = detail.clips.reduce((n, c) => n + c.frames.length, 0)
  const folderPath = useMemo(
    () => joinPath(sourceRoot, detail.dir.length > 0 ? detail.dir : ''),
    [sourceRoot, detail.dir],
  )

  const metaRows = [
    { k: 'Format', v: `${extLabel(cover.ext)} · Animation` },
    {
      k: 'Clips',
      v: detail.clips.length > 1 ? `${detail.clips.length} · ${totalFrames} frames total` : '1',
    },
    { k: 'Frames', v: `${clip.frames.length} in ${clip.name}` },
    cover.width != null && cover.height != null
      ? { k: 'Dimensions', v: `${cover.width} × ${cover.height}` }
      : null,
    { k: 'Added', v: formatDate(cover.mtime) },
    { k: 'Folder', v: detail.dir || '—', onClick: () => onGoToFolder(cover) },
  ].filter((r): r is { k: string; v: string; onClick?: () => void } => r !== null)

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(folderPath)
      showToast('Path copied to clipboard')
    } catch {
      showToast('Could not copy path')
    }
  }

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      {selectedCount > 1 && (
        <div
          className="font-mono"
          style={{ padding: '0 16px 10px', fontSize: 10.5, color: 'var(--faint)' }}
        >
          Showing last selected
        </div>
      )}

      <div
        onDoubleClick={() => onOpenFullscreen(entry)}
        style={{
          margin: '0 16px',
          borderRadius: 12,
          overflow: 'hidden',
          background: 'var(--well)',
          height: 246,
          position: 'relative',
          flex: '0 0 auto',
        }}
      >
        {player.frame && (
          <div
            onClick={() => onOpenFullscreen(entry)}
            style={{ position: 'absolute', inset: 0, overflow: 'hidden', cursor: 'zoom-in' }}
          >
            <img
              src={frameUrl(player.frame)}
              alt={player.frame.name}
              draggable={false}
              onLoad={(e) => {
                const img = e.currentTarget
                setPixelated(img.naturalWidth > 0 && img.naturalWidth < img.clientWidth)
              }}
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'contain',
                imageRendering: pixelated ? 'pixelated' : 'auto',
              }}
            />
          </div>
        )}
        <div
          className="font-mono"
          style={{
            position: 'absolute',
            right: 10,
            top: 10,
            pointerEvents: 'none',
            fontSize: 9.5,
            color: '#FFF7EA',
            background: 'rgba(20,19,16,0.62)',
            padding: '3px 8px',
            borderRadius: 5,
            display: 'flex',
            alignItems: 'center',
            gap: 5,
          }}
        >
          <FilmStrip size={11} weight="bold" />
          {player.frame?.name}
        </div>
      </div>

      <div style={{ padding: '10px 16px 0', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <AnimPlayerControls
          detail={detail}
          clipIndex={Math.min(clipIdx, detail.clips.length - 1)}
          onSelectClip={setClipIdx}
          player={player}
        />
      </div>

      <div style={{ padding: '14px 16px 0', display: 'flex', flexDirection: 'column', gap: 9 }}>
        {metaRows.map((m) => (
          <MetaRow key={m.k} k={m.k} v={m.v} onClick={m.onClick} />
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            className="font-mono"
            style={{
              width: 84,
              flex: '0 0 auto',
              fontSize: 9.5,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--faint)',
            }}
          >
            Path
          </div>
          <div
            className="font-mono"
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 10.5,
              color: 'var(--muted)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={folderPath}
          >
            {folderPath}
          </div>
          <CopyButton onClick={copyPath} />
        </div>
      </div>

      <div style={{ marginTop: 'auto', padding: '18px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <ActionButton onClick={() => onOpenFullscreen(entry)} primary>
          <ArrowsOut size={13} weight="bold" />
          Open fullscreen
        </ActionButton>
        <div style={{ display: 'flex', gap: 8 }}>
          <ActionButton onClick={() => onGoToFolder(cover)}>
            <FolderOpen size={13} weight="bold" />
            Go to folder
          </ActionButton>
          <ActionButton onClick={copyPath}>
            <Copy size={13} weight="bold" />
            Copy path
          </ActionButton>
        </div>
      </div>
    </div>
  )
}

/* ---------- одиночные ассеты ---------- */

function Body({
  entry,
  asset,
  sourceRoot,
  dark,
  selectedCount,
  onOpenFullscreen,
  onGoToFolder,
}: {
  entry: Entry
  asset: Asset
  sourceRoot: string | undefined
  dark: boolean
  selectedCount: number
  onOpenFullscreen: (entry: Entry) => void
  onGoToFolder: (asset: Asset) => void
}) {
  const showToast = useToast()
  const dk = displayKind(asset)
  const fullPath = useMemo(() => joinPath(sourceRoot, asset.relPath), [sourceRoot, asset.relPath])

  const metaRows = [
    { k: 'Format', v: `${extLabel(asset.ext)} · ${KIND_NAME[dk]}` },
    { k: 'Size', v: formatSize(asset.size) },
    asset.width != null && asset.height != null
      ? { k: 'Dimensions', v: `${asset.width} × ${asset.height}` }
      : null,
    { k: 'Added', v: formatDate(asset.mtime) },
    { k: 'Folder', v: asset.parentDir || '—', onClick: () => onGoToFolder(asset) },
  ].filter((r): r is { k: string; v: string; onClick?: () => void } => r !== null)

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(fullPath)
      showToast('Path copied to clipboard')
    } catch {
      showToast('Could not copy path')
    }
  }

  const openOriginal = () => window.open(contentUrl(asset), '_blank', 'noopener')

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      {selectedCount > 1 && (
        <div
          className="font-mono"
          style={{ padding: '0 16px 10px', fontSize: 10.5, color: 'var(--faint)' }}
        >
          Showing last selected
        </div>
      )}

      <div
        onDoubleClick={() => onOpenFullscreen(entry)}
        style={{
          margin: '0 16px',
          borderRadius: 12,
          overflow: 'hidden',
          background: dk === 'audio' ? '#23211C' : 'var(--well)',
          height: 282,
          position: 'relative',
          flex: '0 0 auto',
        }}
      >
        <Preview asset={asset} dk={dk} dark={dark} onOpenFullscreen={() => onOpenFullscreen(entry)} />
      </div>

      <div style={{ padding: '16px 16px 0', display: 'flex', flexDirection: 'column', gap: 9 }}>
        {metaRows.map((m) => (
          <MetaRow key={m.k} k={m.k} v={m.v} onClick={m.onClick} />
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            className="font-mono"
            style={{
              width: 84,
              flex: '0 0 auto',
              fontSize: 9.5,
              letterSpacing: '0.1em',
              textTransform: 'uppercase',
              color: 'var(--faint)',
            }}
          >
            Path
          </div>
          <div
            className="font-mono"
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 10.5,
              color: 'var(--muted)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
            }}
            title={fullPath}
          >
            {fullPath}
          </div>
          <CopyButton onClick={copyPath} />
        </div>
      </div>

      <div style={{ marginTop: 'auto', padding: '18px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <ActionButton onClick={() => onOpenFullscreen(entry)} primary>
          <ArrowsOut size={13} weight="bold" />
          Open fullscreen
        </ActionButton>
        <ActionButton onClick={() => onGoToFolder(asset)}>
          <FolderOpen size={13} weight="bold" />
          Go to folder
        </ActionButton>
        <div style={{ display: 'flex', gap: 8 }}>
          <ActionButton onClick={copyPath}>
            <Copy size={13} weight="bold" />
            Copy path
          </ActionButton>
          <ActionButton onClick={openOriginal}>
            <ArrowSquareOut size={13} weight="bold" />
            Open
          </ActionButton>
        </div>
      </div>
    </div>
  )
}

/* ---------- группа 3D-моделей (форматы одного имени) ---------- */

function ModelGroupBody({
  entry,
  sourceRoot,
  dark,
  selectedCount,
  onOpenFullscreen,
  onGoToFolder,
}: {
  entry: Extract<Entry, { type: 'modelgroup' }>
  sourceRoot: string | undefined
  dark: boolean
  selectedCount: number
  onOpenFullscreen: (entry: Entry) => void
  onGoToFolder: (asset: Asset) => void
}) {
  const showToast = useToast()
  const { data: detail } = useModelGroup(entry.ref)
  const variants = detail?.variants ?? [entry.asset]
  // выбранный для превью формат; по умолчанию — приоритетный (обложка)
  const [selId, setSelId] = useState<number>(entry.asset.id)
  const asset = variants.find((v) => v.id === selId) ?? variants[0]
  const fullPath = useMemo(() => joinPath(sourceRoot, asset.relPath), [sourceRoot, asset.relPath])

  const metaRows = [
    { k: 'Format', v: `${extLabel(asset.ext)} · 3D model` },
    { k: 'Formats', v: `${variants.map((v) => extLabel(v.ext)).join(', ')} · ${modelGroupCounts(entry.variantCount)}` },
    { k: 'Size', v: formatSize(asset.size) },
    { k: 'Added', v: formatDate(asset.mtime) },
    { k: 'Folder', v: asset.parentDir || '—', onClick: () => onGoToFolder(asset) },
  ]

  const copyPath = async () => {
    try {
      await navigator.clipboard.writeText(fullPath)
      showToast('Path copied to clipboard')
    } catch {
      showToast('Could not copy path')
    }
  }
  const openOriginal = () => window.open(contentUrl(asset), '_blank', 'noopener')

  return (
    <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
      {selectedCount > 1 && (
        <div className="font-mono" style={{ padding: '0 16px 10px', fontSize: 10.5, color: 'var(--faint)' }}>
          Showing last selected
        </div>
      )}

      <div
        onDoubleClick={() => onOpenFullscreen(entry)}
        style={{
          margin: '0 16px',
          borderRadius: 12,
          overflow: 'hidden',
          background: 'var(--well)',
          height: 282,
          position: 'relative',
          flex: '0 0 auto',
        }}
      >
        {/* key по asset.id — на смену формата перемонтируем просмотрщик */}
        <Preview key={asset.id} asset={asset} dk="model" dark={dark} onOpenFullscreen={() => onOpenFullscreen(entry)} />
      </div>

      {/* переключатель форматов */}
      <div style={{ padding: '12px 16px 0', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        {variants.map((v) => (
          <FormatChip
            key={v.id}
            label={extLabel(v.ext)}
            active={v.id === asset.id}
            onClick={() => setSelId(v.id)}
          />
        ))}
      </div>

      <div style={{ padding: '14px 16px 0', display: 'flex', flexDirection: 'column', gap: 9 }}>
        {metaRows.map((m) => (
          <MetaRow key={m.k} k={m.k} v={m.v} onClick={'onClick' in m ? m.onClick : undefined} />
        ))}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            className="font-mono"
            style={{ width: 84, flex: '0 0 auto', fontSize: 9.5, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--faint)' }}
          >
            Path
          </div>
          <div
            className="font-mono"
            style={{ flex: 1, minWidth: 0, fontSize: 10.5, color: 'var(--muted)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}
            title={fullPath}
          >
            {fullPath}
          </div>
          <CopyButton onClick={copyPath} />
        </div>
      </div>

      <div style={{ marginTop: 'auto', padding: '18px 16px 16px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <ActionButton onClick={() => onOpenFullscreen(entry)} primary>
          <ArrowsOut size={13} weight="bold" />
          Open fullscreen
        </ActionButton>
        <ActionButton onClick={() => onGoToFolder(asset)}>
          <FolderOpen size={13} weight="bold" />
          Go to folder
        </ActionButton>
        <div style={{ display: 'flex', gap: 8 }}>
          <ActionButton onClick={copyPath}>
            <Copy size={13} weight="bold" />
            Copy path
          </ActionButton>
          <ActionButton onClick={openOriginal}>
            <ArrowSquareOut size={13} weight="bold" />
            Open
          </ActionButton>
        </div>
      </div>
    </div>
  )
}

function FormatChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  const { hovered, bind } = useHover()
  return (
    <button
      type="button"
      onClick={onClick}
      {...bind}
      className="font-mono"
      style={{
        border: `1px solid ${active ? 'transparent' : hovered ? 'var(--line3)' : 'var(--line2)'}`,
        background: active ? 'var(--inkBg)' : 'var(--card)',
        color: active ? 'var(--inkFg)' : 'var(--ink2)',
        borderRadius: 7,
        padding: '5px 11px',
        cursor: 'pointer',
        fontSize: 11,
        fontWeight: 600,
      }}
    >
      {label}
    </button>
  )
}

function Empty() {
  return (
    <div
      style={{
        flex: 1,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        padding: '0 24px',
        textAlign: 'center',
        color: 'var(--faint)',
      }}
    >
      <ImageSquare size={34} weight="thin" />
      <div style={{ fontSize: 13, color: 'var(--muted)' }}>Select an asset to see its details here.</div>
    </div>
  )
}

function Preview({
  asset,
  dk,
  dark,
  onOpenFullscreen,
}: {
  asset: Asset
  dk: string
  dark: boolean
  onOpenFullscreen: () => void
}) {
  const [pixelated, setPixelated] = useState(false)

  if (dk === 'image') {
    return (
      <>
        <div
          onClick={onOpenFullscreen}
          style={{ position: 'absolute', inset: 0, overflow: 'hidden', cursor: 'zoom-in' }}
        >
          <img
            src={isBrowserRenderableImage(asset.ext) ? contentUrl(asset) : thumbUrl(asset, 1024)}
            alt={asset.name}
            draggable={false}
            onLoad={(e) => {
              const img = e.currentTarget
              setPixelated(img.naturalWidth > 0 && img.naturalWidth < img.clientWidth)
            }}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              imageRendering: pixelated ? 'pixelated' : 'auto',
            }}
          />
        </div>
        <div
          className="font-mono"
          style={{
            position: 'absolute',
            right: 10,
            bottom: 10,
            pointerEvents: 'none',
            fontSize: 9.5,
            color: '#FFF7EA',
            background: 'rgba(20,19,16,0.62)',
            padding: '3px 8px',
            borderRadius: 5,
          }}
        >
          click to zoom
        </div>
      </>
    )
  }

  if (dk === 'video') {
    return (
      <video
        src={contentUrl(asset)}
        controls
        preload="metadata"
        style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#000' }}
      />
    )
  }

  if (dk === 'audio') {
    return (
      <div
        style={{
          position: 'absolute',
          inset: 0,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          gap: 18,
          padding: '0 22px',
        }}
      >
        <Waveform seed={asset.id} />
        <audio src={contentUrl(asset)} controls preload="metadata" style={{ width: '100%' }} />
      </div>
    )
  }

  if (dk === 'model') {
    if (!canViewModel(asset.ext)) return <ModelUnsupported ext={asset.ext} />
    return (
      <>
        <ModelViewer asset={asset} dark={dark} />
        <div
          className="font-mono"
          style={{
            position: 'absolute',
            right: 10,
            bottom: 10,
            pointerEvents: 'none',
            fontSize: 9.5,
            color: 'var(--muted)',
            background: 'var(--well)',
            padding: '3px 8px',
            borderRadius: 5,
          }}
        >
          drag to orbit · 3D preview
        </div>
      </>
    )
  }

  return null
}

/** Модель в формате, который браузерный загрузчик не открывает (.blend/.stl/.dae/.3ds). */
function ModelUnsupported({ ext }: { ext: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 10,
        color: 'var(--faint)',
      }}
    >
      <Cube size={34} weight="thin" />
      <div style={{ fontSize: 12, color: 'var(--muted)' }}>No 3D preview for {extLabel(ext)}</div>
    </div>
  )
}

function Waveform({ seed }: { seed: number }) {
  const bars = useMemo(() => {
    let t = (seed * 2654435761) >>> 0
    let h = 40
    const out: number[] = []
    const rnd = () => {
      t += 0x6d2b79f5
      let r = Math.imul(t ^ (t >>> 15), 1 | t)
      r ^= r + Math.imul(r ^ (r >>> 7), 61 | r)
      return ((r ^ (r >>> 14)) >>> 0) / 4294967296
    }
    for (let i = 0; i < 52; i++) {
      h = Math.max(10, Math.min(110, h + (rnd() - 0.5) * 46))
      out.push(Math.round(h))
    }
    return out
  }, [seed])

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 3, height: 120, width: '100%', justifyContent: 'center' }}>
      {bars.map((h, i) => (
        <div key={i} style={{ width: 4, borderRadius: 2, background: 'rgba(233,226,209,0.5)', height: h, flex: '0 0 auto' }} />
      ))}
    </div>
  )
}

function MetaRow({ k, v, onClick }: { k: string; v: string; onClick?: () => void }) {
  return (
    <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
      <div
        className="font-mono"
        style={{
          width: 84,
          flex: '0 0 auto',
          fontSize: 9.5,
          letterSpacing: '0.1em',
          textTransform: 'uppercase',
          color: 'var(--faint)',
        }}
      >
        {k}
      </div>
      {onClick ? (
        <MetaLink v={v} onClick={onClick} />
      ) : (
        <div
          style={{
            fontSize: 12.5,
            color: 'var(--ink2)',
            flex: 1,
            minWidth: 0,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={v}
        >
          {v}
        </div>
      )}
    </div>
  )
}

function MetaLink({ v, onClick }: { v: string; onClick: () => void }) {
  const { hovered, bind } = useHover()
  return (
    <button
      type="button"
      onClick={onClick}
      {...bind}
      title={`Go to ${v}`}
      style={{
        border: 'none',
        background: 'transparent',
        padding: 0,
        cursor: 'pointer',
        textAlign: 'left',
        fontSize: 12.5,
        color: hovered ? '#D96E34' : 'var(--ink2)',
        flex: 1,
        minWidth: 0,
        whiteSpace: 'nowrap',
        overflow: 'hidden',
        textOverflow: 'ellipsis',
      }}
    >
      {v}
    </button>
  )
}

function CopyButton({ onClick }: { onClick: () => void }) {
  const { hovered, bind } = useHover()
  return (
    <button
      type="button"
      onClick={onClick}
      {...bind}
      style={{
        border: 'none',
        background: 'transparent',
        cursor: 'pointer',
        color: hovered ? '#D96E34' : 'var(--muted)',
        display: 'flex',
        padding: 2,
      }}
    >
      <Copy size={13} weight="bold" />
    </button>
  )
}

function ActionButton({
  onClick,
  children,
  primary,
}: {
  onClick: () => void
  children: React.ReactNode
  primary?: boolean
}) {
  const { hovered, bind } = useHover()
  return (
    <button
      type="button"
      onClick={onClick}
      {...bind}
      style={{
        flex: 1,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 6,
        background: primary ? (hovered ? 'var(--ink)' : 'var(--inkBg)') : 'var(--card)',
        border: `1px solid ${primary ? 'transparent' : hovered ? 'var(--line3)' : 'var(--line2)'}`,
        borderRadius: 8,
        padding: '9px 0',
        cursor: 'pointer',
        fontSize: 12,
        fontWeight: 600,
        color: primary ? 'var(--inkFg)' : 'var(--ink2)',
      }}
    >
      {children}
    </button>
  )
}
