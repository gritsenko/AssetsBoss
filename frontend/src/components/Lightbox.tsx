import { CaretLeft, CaretRight, CornersOut, FolderOpen, Minus, Plus, X } from '@phosphor-icons/react'
import { useCallback, useRef, useState } from 'react'
import { contentUrl } from '../api/client'
import type { Asset } from '../api/types'
import { extLabel, formatSize } from '../lib/format'
import { displayKind } from '../lib/kind'
import { ModelViewer } from './ModelViewer'

const MIN_SCALE = 1
const MAX_SCALE = 16

interface Props {
  asset: Asset
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

/**
 * Полноэкранный просмотр ассета: изображение можно зумить колесом (к курсору),
 * двойным кликом и кнопками, и таскать мышью (скролл). Мелкая графика при
 * увеличении остаётся резкой (nearest-neighbour). Стрелки листают соседние ассеты.
 */
export function Lightbox({ asset, hasPrev, hasNext, onPrev, onNext, dark, onClose, onGoToFolder }: Props) {
  const dk = displayKind(asset)
  const stageRef = useRef<HTMLDivElement | null>(null)
  const [vp, setVp] = useState<Viewport>(FIT)
  // натуральная и отрисованная (вписанная) ширина — для резкого апскейла пиксель-арта
  const [img, setImg] = useState({ natW: 0, dispW: 0 })
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
      if (dk !== 'image') return
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
    [dk],
  )

  const onPointerDown = (e: React.PointerEvent) => {
    if (dk !== 'image' || vp.scale <= 1) return
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
    if (dk !== 'image') return
    const box = stageRef.current
    if (!box) return
    const rect = box.getBoundingClientRect()
    const mx = e.clientX - (rect.left + rect.width / 2)
    const my = e.clientY - (rect.top + rect.height / 2)
    zoomAt(mx, my, vp.scale > 1 ? MIN_SCALE : 3)
  }

  const zoomStep = (dir: 1 | -1) => zoomAt(0, 0, vp.scale * (dir === 1 ? 1.5 : 1 / 1.5))

  // резкое масштабирование без размытия, когда натуральный размер меньше отображаемого
  const pixelated = img.natW > 0 && img.natW < img.dispW * vp.scale

  const dim = asset.width != null && asset.height != null ? `${asset.width} × ${asset.height}` : null
  const meta = [dim, `${extLabel(asset.ext)}`, formatSize(asset.size)].filter(Boolean).join('  ·  ')

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
      {/* шапка */}
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
            title={asset.relPath}
          >
            {asset.name}
          </div>
          <div className="font-mono" style={{ fontSize: 10.5, color: 'rgba(245,241,232,0.55)', marginTop: 2 }}>
            {meta}
          </div>
        </div>

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

        <GlassButton title="Go to folder" onClick={() => onGoToFolder(asset)}>
          <FolderOpen size={16} weight="bold" />
        </GlassButton>

        <GlassButton title="Close (Esc)" onClick={onClose}>
          <X size={16} weight="bold" />
        </GlassButton>
      </div>

      {/* сцена */}
      <div
        ref={stageRef}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={endDrag}
        onPointerCancel={endDrag}
        onDoubleClick={onDoubleClick}
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
