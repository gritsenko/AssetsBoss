import { CaretLeft, CaretRight, CornersOut, FolderOpen, Minus, Plus, X } from '@phosphor-icons/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { contentUrl } from '../api/client'
import type { AnimGroupDetail, Asset } from '../api/types'
import { useAnimGroup } from '../hooks/useAnimGroup'
import { useFramePlayer } from '../hooks/useFramePlayer'
import {
  type Entry,
  entryGroupRef,
  formatClipName,
  formatGroupName,
  frameUrl,
  initialPosition,
  isAnimEntry,
} from '../lib/anim'
import { extLabel, formatSize } from '../lib/format'
import { displayKind } from '../lib/kind'
import { AnimPlayerControls } from './AnimPlayer'
import { ModelViewer } from './ModelViewer'

const MIN_SCALE = 1
const MAX_SCALE = 16

interface Props {
  entry: Entry
  hasPrev: boolean
  hasNext: boolean
  onPrev: () => void
  onNext: () => void
  dark: boolean
  onClose: () => void
  onGoToFolder: (asset: Asset) => void
}

interface Viewport {
  scale: number
  tx: number
  ty: number
}

const FIT: Viewport = { scale: 1, tx: 0, ty: 0 }

function clamp(v: number, lo: number, hi: number) {
  return Math.max(lo, Math.min(hi, v))
}

/** Зум к курсору + панорамирование мышью; общий для картинок и кадров анимации. */
function useViewport(active: boolean) {
  const stageRef = useRef<HTMLDivElement | null>(null)
  const [vp, setVp] = useState<Viewport>(FIT)
  const drag = useRef<{ x: number; y: number; tx: number; ty: number } | null>(null)
  const [dragging, setDragging] = useState(false)

  const zoomAt = useCallback((mx: number, my: number, nextScale: number) => {
    setVp((prev) => {
      const scale = clamp(nextScale, MIN_SCALE, MAX_SCALE)
      const factor = scale / prev.scale
      if (scale === MIN_SCALE) return FIT
      return {
        scale,
        tx: mx - factor * (mx - prev.tx),
        ty: my - factor * (my - prev.ty),
      }
    })
  }, [])

  const onWheel = useCallback(
    (e: React.WheelEvent) => {
      if (!active) return
      e.preventDefault()
      const box = stageRef.current
      if (!box) return
      const rect = box.getBoundingClientRect()
      const mx = e.clientX - (rect.left + rect.width / 2)
      const my = e.clientY - (rect.top + rect.height / 2)
      setVp((prev) => {
        const scale = clamp(prev.scale * Math.exp(-e.deltaY * 0.0018), MIN_SCALE, MAX_SCALE)
        if (scale === MIN_SCALE) return FIT
        const factor = scale / prev.scale
        return { scale, tx: mx - factor * (mx - prev.tx), ty: my - factor * (my - prev.ty) }
      })
    },
    [active],
  )

  const onPointerDown = (e: React.PointerEvent) => {
    if (!active || vp.scale <= 1) return
    e.preventDefault()
    drag.current = { x: e.clientX, y: e.clientY, tx: vp.tx, ty: vp.ty }
    setDragging(true)
    e.currentTarget.setPointerCapture(e.pointerId)
  }
  const onPointerMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d) return
    setVp((prev) => ({ ...prev, tx: d.tx + (e.clientX - d.x), ty: d.ty + (e.clientY - d.y) }))
  }
  const endDrag = () => {
    drag.current = null
    setDragging(false)
  }

  const onDoubleClick = (e: React.MouseEvent) => {
    if (!active) return
    const box = stageRef.current
    if (!box) return
    const rect = box.getBoundingClientRect()
    const mx = e.clientX - (rect.left + rect.width / 2)
    const my = e.clientY - (rect.top + rect.height / 2)
    zoomAt(mx, my, vp.scale > 1 ? MIN_SCALE : 3)
  }

  const zoomStep = (dir: 1 | -1) => zoomAt(0, 0, vp.scale * (dir === 1 ? 1.5 : 1 / 1.5))

  return {
    stageRef,
    vp,
    setVp,
    dragging,
    zoomStep,
    stageHandlers: {
      onWheel,
      onPointerDown,
      onPointerMove,
      onPointerUp: endDrag,
      onPointerCancel: endDrag,
      onDoubleClick,
    },
  }
}

export function Lightbox(props: Props) {
  return isAnimEntry(props.entry) ? <AnimLightbox {...props} /> : <AssetLightbox {...props} />
}

/* ---------- общая рамка ---------- */

function Shell({
  dark,
  children,
  hasPrev,
  hasNext,
  onPrev,
  onNext,
}: {
  dark: boolean
  children: React.ReactNode
  hasPrev: boolean
  hasNext: boolean
  onPrev: () => void
  onNext: () => void
}) {
  return (
    <div
      className="ab-fade"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        display: 'flex',
        flexDirection: 'column',
        background: dark ? 'rgba(8,7,5,0.94)' : 'rgba(20,19,16,0.9)',
        backdropFilter: 'blur(4px)',
      }}
    >
      {children}
      {hasPrev && (
        <EdgeNav side="left" onClick={onPrev}>
          <CaretLeft size={26} weight="bold" />
        </EdgeNav>
      )}
      {hasNext && (
        <EdgeNav side="right" onClick={onNext}>
          <CaretRight size={26} weight="bold" />
        </EdgeNav>
      )}
    </div>
  )
}

function Header({
  title,
  titleHint,
  meta,
  children,
  onGoToFolder,
  onClose,
}: {
  title: string
  titleHint?: string
  meta: string
  children?: React.ReactNode
  onGoToFolder: () => void
  onClose: () => void
}) {
  return (
    <div
      style={{
        flex: '0 0 auto',
        display: 'flex',
        alignItems: 'center',
        gap: 12,
        padding: '12px 16px',
        color: '#F5F1E8',
      }}
    >
      <div style={{ minWidth: 0, flex: 1 }}>
        <div
          style={{
            fontSize: 14,
            fontWeight: 600,
            whiteSpace: 'nowrap',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
          }}
          title={titleHint ?? title}
        >
          {title}
        </div>
        <div className="font-mono" style={{ fontSize: 10.5, color: 'rgba(245,241,232,0.55)', marginTop: 2 }}>
          {meta}
        </div>
      </div>

      {children}

      <GlassButton title="Go to folder" onClick={onGoToFolder}>
        <FolderOpen size={16} weight="bold" />
      </GlassButton>

      <GlassButton title="Close (Esc)" onClick={onClose}>
        <X size={16} weight="bold" />
      </GlassButton>
    </div>
  )
}

/* ---------- полноэкранный плеер анимаций ---------- */

function AnimLightbox(props: Props) {
  const { entry, dark, onClose, onGoToFolder } = props
  const ref = entryGroupRef(entry)
  const { data: detail } = useAnimGroup(ref)

  return (
    <Shell
      dark={dark}
      hasPrev={props.hasPrev}
      hasNext={props.hasNext}
      onPrev={props.onPrev}
      onNext={props.onNext}
    >
      {detail ? (
        <AnimContent key={detail.name} {...props} detail={detail} />
      ) : (
        <>
          <Header
            title={ref ? formatGroupName(ref.name) : entry.asset.name}
            meta="loading animation…"
            onGoToFolder={() => onGoToFolder(entry.asset)}
            onClose={onClose}
          />
          <div style={{ flex: 1 }} />
        </>
      )}
    </Shell>
  )
}

function AnimContent({
  entry,
  detail,
  onClose,
  onGoToFolder,
}: Props & { detail: AnimGroupDetail }) {
  const initial = initialPosition(entry, detail)
  const [clipIdx, setClipIdx] = useState(initial.clip)
  const clip = detail.clips[Math.min(clipIdx, detail.clips.length - 1)]
  const player = useFramePlayer(clip.frames, initial.frame)
  const frame = player.frame

  const { stageRef, vp, dragging, stageHandlers } = useViewport(true)
  const [img, setImg] = useState({ natW: 0, dispW: 0 })
  const pixelated = img.natW > 0 && img.natW < img.dispW * vp.scale

  const switchClip = useCallback(
    (i: number) => setClipIdx(clamp(i, 0, detail.clips.length - 1)),
    [detail.clips.length],
  )

  // Space — play/pause, ←/→ — кадры, ↑/↓ — клипы (Esc закрывает App)
  const { toggle, step } = player
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      if (target?.tagName === 'INPUT' && (target as HTMLInputElement).type !== 'range') return
      if (e.key === ' ') {
        e.preventDefault()
        toggle()
      } else if (e.key === 'ArrowRight') {
        e.preventDefault()
        step(1)
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault()
        step(-1)
      } else if (e.key === 'ArrowDown') {
        e.preventDefault()
        switchClip(clipIdx + 1)
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        switchClip(clipIdx - 1)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [clipIdx, switchClip, toggle, step])

  const dim = frame?.width != null && frame.height != null ? `${frame.width} × ${frame.height}` : null
  const totalFrames = detail.clips.reduce((n, c) => n + c.frames.length, 0)
  const meta = [
    dim,
    detail.clips.length > 1 ? `${detail.clips.length} clips` : null,
    `${totalFrames} frames`,
    frame ? formatSize(frame.size) : null,
  ]
    .filter(Boolean)
    .join('  ·  ')

  const clipLabel = formatClipName(clip.name, detail.name)

  return (
    <>
      <Header
        title={formatGroupName(detail.name)}
        titleHint={detail.dir}
        meta={meta}
        onGoToFolder={() => frame && onGoToFolder(frame)}
        onClose={onClose}
      />

      {/* сцена */}
      <div
        ref={stageRef}
        {...stageHandlers}
        style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: vp.scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in',
          touchAction: 'none',
        }}
      >
        {frame && (
          <img
            src={frameUrl(frame)}
            alt={frame.name}
            draggable={false}
            onLoad={(e) => setImg({ natW: e.currentTarget.naturalWidth, dispW: e.currentTarget.clientWidth })}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              transform: `translate(${vp.tx}px, ${vp.ty}px) scale(${vp.scale})`,
              transformOrigin: 'center center',
              transition: dragging ? 'none' : 'transform 0.08s ease-out',
              imageRendering: pixelated ? 'pixelated' : 'auto',
              willChange: 'transform',
              userSelect: 'none',
            }}
          />
        )}
        <div
          className="font-mono"
          style={{
            position: 'absolute',
            left: 16,
            bottom: 14,
            pointerEvents: 'none',
            fontSize: 10.5,
            color: 'rgba(245,241,232,0.6)',
          }}
        >
          {clipLabel} · {frame?.name}
        </div>
      </div>

      {/* панель плеера */}
      <div
        style={{
          flex: '0 0 auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 10,
          alignItems: 'center',
          padding: '10px 16px 18px',
        }}
      >
        <div
          style={{
            width: 'min(760px, 96%)',
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
            background: 'rgba(245,241,232,0.07)',
            border: '1px solid rgba(245,241,232,0.12)',
            borderRadius: 14,
            padding: '12px 16px',
          }}
        >
          <AnimPlayerControls
            detail={detail}
            clipIndex={Math.min(clipIdx, detail.clips.length - 1)}
            onSelectClip={switchClip}
            player={player}
            glass
          />
        </div>
      </div>
    </>
  )
}

/* ---------- одиночные ассеты (как раньше) ---------- */

/**
 * Полноэкранный просмотр ассета: изображение можно зумить колесом (к курсору),
 * двойным кликом и кнопками, и таскать мышью (скролл). Мелкая графика при
 * увеличении остаётся резкой (nearest-neighbour). Стрелки листают соседние ассеты.
 */
function AssetLightbox({ entry, hasPrev, hasNext, onPrev, onNext, dark, onClose, onGoToFolder }: Props) {
  const asset = entry.asset
  const dk = displayKind(asset)
  const { stageRef, vp, setVp, dragging, zoomStep, stageHandlers } = useViewport(dk === 'image')
  // натуральная и отрисованная (вписанная) ширина — для резкого апскейла пиксель-арта
  const [img, setImg] = useState({ natW: 0, dispW: 0 })

  // резкое масштабирование без размытия, когда натуральный размер меньше отображаемого
  const pixelated = img.natW > 0 && img.natW < img.dispW * vp.scale

  const dim = asset.width != null && asset.height != null ? `${asset.width} × ${asset.height}` : null
  const meta = [dim, `${extLabel(asset.ext)}`, formatSize(asset.size)].filter(Boolean).join('  ·  ')

  return (
    <Shell dark={dark} hasPrev={hasPrev} hasNext={hasNext} onPrev={onPrev} onNext={onNext}>
      <Header
        title={asset.name}
        titleHint={asset.relPath}
        meta={meta}
        onGoToFolder={() => onGoToFolder(asset)}
        onClose={onClose}
      >
        {dk === 'image' && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 2,
              background: 'rgba(245,241,232,0.08)',
              border: '1px solid rgba(245,241,232,0.12)',
              borderRadius: 9,
              padding: 3,
            }}
          >
            <GlassButton title="Zoom out" onClick={() => zoomStep(-1)}>
              <Minus size={15} weight="bold" />
            </GlassButton>
            <button
              type="button"
              onClick={() => setVp(FIT)}
              className="font-mono"
              title="Fit to screen"
              style={{
                minWidth: 48,
                height: 28,
                border: 'none',
                background: 'transparent',
                color: '#F5F1E8',
                cursor: 'pointer',
                fontSize: 11,
              }}
            >
              {Math.round(vp.scale * 100)}%
            </button>
            <GlassButton title="Zoom in" onClick={() => zoomStep(1)}>
              <Plus size={15} weight="bold" />
            </GlassButton>
            <GlassButton title="Fit to screen" onClick={() => setVp(FIT)}>
              <CornersOut size={15} weight="bold" />
            </GlassButton>
          </div>
        )}
      </Header>

      {/* сцена */}
      <div
        ref={stageRef}
        {...stageHandlers}
        style={{
          flex: 1,
          position: 'relative',
          overflow: 'hidden',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          padding: dk === 'image' ? 0 : 28,
          cursor:
            dk !== 'image' ? 'default' : vp.scale > 1 ? (dragging ? 'grabbing' : 'grab') : 'zoom-in',
          touchAction: 'none',
        }}
      >
        {dk === 'image' ? (
          <img
            src={contentUrl(asset)}
            alt={asset.name}
            draggable={false}
            onLoad={(e) => setImg({ natW: e.currentTarget.naturalWidth, dispW: e.currentTarget.clientWidth })}
            style={{
              maxWidth: '100%',
              maxHeight: '100%',
              objectFit: 'contain',
              transform: `translate(${vp.tx}px, ${vp.ty}px) scale(${vp.scale})`,
              transformOrigin: 'center center',
              transition: dragging ? 'none' : 'transform 0.08s ease-out',
              imageRendering: pixelated ? 'pixelated' : 'auto',
              willChange: 'transform',
              userSelect: 'none',
            }}
          />
        ) : (
          <Media asset={asset} dk={dk} dark={dark} />
        )}
      </div>
    </Shell>
  )
}

function Media({ asset, dk, dark }: { asset: Asset; dk: string; dark: boolean }) {
  if (dk === 'video') {
    return (
      <video
        src={contentUrl(asset)}
        controls
        autoPlay
        preload="metadata"
        style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 10, background: '#000' }}
      />
    )
  }
  if (dk === 'audio') {
    return (
      <audio src={contentUrl(asset)} controls autoPlay preload="metadata" style={{ width: 'min(560px, 90%)' }} />
    )
  }
  if (dk === 'model') {
    return (
      <div style={{ position: 'relative', width: 'min(900px, 92%)', height: '82%', borderRadius: 12, overflow: 'hidden' }}>
        <ModelViewer assetKey={String(asset.id)} dark={dark} />
      </div>
    )
  }
  return null
}

function GlassButton({
  children,
  title,
  onClick,
}: {
  children: React.ReactNode
  title: string
  onClick: () => void
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        width: 30,
        height: 28,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: 'none',
        borderRadius: 7,
        cursor: 'pointer',
        background: hovered ? 'rgba(245,241,232,0.14)' : 'transparent',
        color: '#F5F1E8',
      }}
    >
      {children}
    </button>
  )
}

function EdgeNav({
  side,
  onClick,
  children,
}: {
  side: 'left' | 'right'
  onClick: () => void
  children: React.ReactNode
}) {
  const [hovered, setHovered] = useState(false)
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        position: 'absolute',
        top: '50%',
        [side]: 16,
        transform: 'translateY(-50%)',
        width: 44,
        height: 44,
        borderRadius: '50%',
        border: 'none',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: hovered ? 'rgba(245,241,232,0.22)' : 'rgba(245,241,232,0.1)',
        color: '#F5F1E8',
      }}
    >
      {children}
    </button>
  )
}
