import { Bounds, OrbitControls, useBounds } from '@react-three/drei'
import { Canvas, useFrame } from '@react-three/fiber'
import { useEffect, useMemo, useRef, useState } from 'react'
import * as THREE from 'three'
import type { Asset, ModelBundle } from '../api/types'
import { useModelBundle } from '../hooks/useModelBundle'
import { disposeObject, loadAnimationClip, loadModel } from '../lib/three/loadModel'
import { canViewModel } from '../lib/three/modelFormats'

type Status = 'loading' | 'ready' | 'error'

/** Вариант анимации в селекторе: встроенный в меш клип либо внешний FBX (грузится лениво). */
type ClipOption =
  | { id: string; label: string; kind: 'embedded'; clip: THREE.AnimationClip }
  | { id: string; label: string; kind: 'external'; relPath: string; file: string }

interface Props {
  asset: Asset
  dark: boolean
}

/** Человекочитаемое имя клипа: без расширения, без префикса-имени меша, разделители → пробелы. */
function prettyClipName(file: string, meshFile: string): string {
  let n = file.replace(/\.[^.]+$/, '')
  const base = meshFile.replace(/\.[^.]+$/, '')
  if (n.length > base.length && n.toLowerCase().startsWith(base.toLowerCase())) {
    n = n.slice(base.length)
  }
  n = n.replace(/^[_\-. ]+/, '').replace(/[_]+/g, ' ').trim()
  return n || file.replace(/\.[^.]+$/, '')
}

/**
 * Интерактивный WebGL-просмотрщик 3D-моделей (glb/gltf/fbx/obj) на three.js + R3F.
 * Грузит оригинал через path-style URL, резолвит внешние текстуры через bundle (включая .tga),
 * вписывает камеру по габаритам и медленно вращает. Если у модели есть анимации (встроенные или
 * внешними FBX в bundle) — показывает селектор клипов с проигрыванием. Тяжёлый three.js грузится
 * лениво (см. ModelViewerLazy).
 */
export default function ModelViewer({ asset, dark }: Props) {
  const [status, setStatus] = useState<Status>(canViewModel(asset.ext) ? 'loading' : 'error')
  const [embedded, setEmbedded] = useState<ClipOption[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [playing, setPlaying] = useState(true)
  // ручная переориентация (фолбэк, если ось из FBX определилась неверно): переключатель Z↔Y.
  // Y — как определил авто-анализ оси; Z — доворот на 90° вокруг X. Эфемерно, превью не трогает.
  const [upZ, setUpZ] = useState(false)
  const manualRot = useMemo<[number, number, number]>(() => (upZ ? [-Math.PI / 2, 0, 0] : [0, 0, 0]), [upZ])
  const bg = dark ? '#1B1914' : '#ECE9E0'

  // bundle резолвит текстуры и даёт список внешних анимаций; грузим меш только когда он осел
  const bundleQuery = useModelBundle(asset)
  const bundle = bundleQuery.data
  const bundleSettled = !bundleQuery.isLoading

  const externalClips = useMemo<ClipOption[]>(
    () =>
      (bundle?.animations ?? []).map((a) => ({
        id: `ext:${a.relPath}`,
        label: prettyClipName(a.name, asset.name),
        kind: 'external' as const,
        relPath: a.relPath,
        file: a.name,
      })),
    [bundle, asset.name],
  )
  const clips = useMemo(() => [...embedded, ...externalClips], [embedded, externalClips])
  const selected = clips.find((c) => c.id === selectedId) ?? null

  return (
    <div style={{ position: 'absolute', inset: 0 }}>
      {canViewModel(asset.ext) && (
        <Canvas camera={{ position: [3, 2, 4], fov: 45, near: 0.01, far: 5000 }} dpr={[1, 2]} gl={{ antialias: true }}>
          <color attach="background" args={[bg]} />
          <hemisphereLight intensity={0.9} groundColor={dark ? '#15140f' : '#cfc8b6'} />
          <ambientLight intensity={0.4} />
          <directionalLight position={[4, 8, 6]} intensity={1.7} />
          <directionalLight position={[-6, 2, -4]} intensity={0.5} />
          <Bounds fit clip observe margin={1.2}>
            <ModelObject
              asset={asset}
              bundle={bundle}
              bundleSettled={bundleSettled}
              selected={selected}
              playing={playing}
              manualRot={manualRot}
              onStatus={setStatus}
              onEmbeddedClips={setEmbedded}
            />
          </Bounds>
          {/* при выбранной анимации авто-вращение мешает — отключаем */}
          <OrbitControls makeDefault autoRotate={!selected} autoRotateSpeed={1.1} enableDamping enablePan />
        </Canvas>
      )}

      {status === 'ready' && clips.length > 0 && (
        <ClipPicker
          dark={dark}
          clips={clips}
          selectedId={selectedId}
          playing={playing}
          onSelect={(id) => {
            setSelectedId(id)
            setPlaying(true)
          }}
          onTogglePlay={() => setPlaying((p) => !p)}
        />
      )}

      {status === 'ready' && <OrientControls dark={dark} upZ={upZ} onToggle={() => setUpZ((v) => !v)} />}

      {status !== 'ready' && (
        <div
          style={{
            position: 'absolute',
            inset: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            pointerEvents: 'none',
            fontSize: 12.5,
            color: 'var(--muted)',
            background: status === 'loading' ? 'transparent' : bg,
          }}
        >
          {status === 'loading' ? 'Loading 3D model…' : 'Couldn’t load this model'}
        </div>
      )}
    </div>
  )
}

interface ObjectProps {
  asset: Asset
  bundle: ModelBundle | undefined
  bundleSettled: boolean
  selected: ClipOption | null
  playing: boolean
  /** Ручной доворот [x,y,z] в радианах поверх авто-коррекции оси (эфемерный, для текущей сессии). */
  manualRot: [number, number, number]
  onStatus: (s: Status) => void
  onEmbeddedClips: (clips: ClipOption[]) => void
}

function ModelObject({ asset, bundle, bundleSettled, selected, playing, manualRot, onStatus, onEmbeddedClips }: ObjectProps) {
  const [obj, setObj] = useState<THREE.Object3D | null>(null)
  const groupRef = useRef<THREE.Group>(null)
  const bounds = useBounds()
  const mixerRef = useRef<THREE.AnimationMixer | null>(null)
  const actionRef = useRef<THREE.AnimationAction | null>(null)

  // грузим меш один раз, как только bundle осел (нужен для резолва текстур); inner кейется по
  // asset в ModelViewerLazy — на смену модели идёт чистый remount
  useEffect(() => {
    if (!bundleSettled) return
    let alive = true
    let loaded: THREE.Object3D | null = null

    loadModel(asset, bundle)
      .then((o) => {
        if (!alive) {
          disposeObject(o)
          return
        }
        loaded = o
        setObj(o)
        const anims = (o as THREE.Object3D & { animations?: THREE.AnimationClip[] }).animations ?? []
        onEmbeddedClips(
          anims.map((clip, i) => ({
            id: `emb:${i}`,
            label: clip.name || `Clip ${i + 1}`,
            kind: 'embedded' as const,
            clip,
          })),
        )
        onStatus('ready')
      })
      .catch(() => {
        if (alive) onStatus('error')
      })

    return () => {
      alive = false
      if (mixerRef.current) {
        mixerRef.current.stopAllAction()
        mixerRef.current = null
      }
      actionRef.current = null
      if (loaded) disposeObject(loaded)
    }
  }, [asset, bundle, bundleSettled, onStatus, onEmbeddedClips])

  // переподогнать камеру под габариты, как только модель появилась или сменился ручной поворот
  useEffect(() => {
    const target = groupRef.current ?? obj
    if (obj && target) bounds.refresh(target).clip().fit()
  }, [obj, bounds, manualRot])

  // применить выбранный клип: остановить прежний, проиграть новый (внешний — грузим лениво)
  useEffect(() => {
    if (!obj) return
    let alive = true

    if (actionRef.current) {
      actionRef.current.stop()
      actionRef.current = null
    }
    if (!selected) return

    if (!mixerRef.current) mixerRef.current = new THREE.AnimationMixer(obj)
    const mixer = mixerRef.current

    const play = (clip: THREE.AnimationClip | null) => {
      if (!alive || !clip) return
      const action = mixer.clipAction(clip)
      action.reset().play()
      actionRef.current = action
    }

    if (selected.kind === 'embedded') {
      play(selected.clip)
    } else {
      loadAnimationClip(asset.sourceId, selected.relPath, bundle)
        .then(play)
        .catch(() => {})
    }

    return () => {
      alive = false
    }
  }, [obj, selected, asset.sourceId, bundle])

  // продвигаем микшер только когда играем — на паузе модель замирает в текущей позе
  useFrame((_, delta) => {
    if (playing && mixerRef.current) mixerRef.current.update(delta)
  })

  return obj ? (
    <group ref={groupRef} rotation={manualRot}>
      <primitive object={obj} />
    </group>
  ) : null
}

interface OrientProps {
  dark: boolean
  upZ: boolean
  onToggle: () => void
}

// Иконки «вектора вверх» из Online3DViewer (assets/icons/up_y.svg, up_z.svg) — куб с осью и
// стрелками доворота. stroke=currentColor, чтобы подхватывать цвет темы.
const UP_Y_PATH =
  'M11 4.3 9.2 2.5M11 .7 9.2 2.5m6.3 6V6c0-1.9-1.6-3.5-3.5-3.5H9.5m-6 10.1 7 4.1m-7-15.2v11.1m11-.1v3m-11-3 7-4m-9-5 2-2m2 2-2-2m9 9 2 2m2-2-2 2'
const UP_Z_PATH =
  'M11 4.3 9.2 2.5M11 .7 9.2 2.5m6.3 6V6c0-1.9-1.6-3.5-3.5-3.5H9.5m-6 10.1 7 4.1m-7-15.2v11.1m0-.1 7-4m-9-5 2-2m2 2-2-2m9 9h4m-4 5h4m-4 0 4-5'

function UpAxisIcon({ z }: { z: boolean }) {
  return (
    <svg viewBox="0 0 18 18" width="16" height="16" aria-hidden="true">
      <path
        d={z ? UP_Z_PATH : UP_Y_PATH}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeMiterlimit={10}
      />
    </svg>
  )
}

/**
 * Ручная переориентация одной кнопкой: переключатель вертикальной оси Z↔Y (фолбэк, когда ось
 * из FBX определилась неверно). Иконка (как в Online3DViewer) и состояние меняются по клику.
 * Эфемерно — на превью в галерее не влияет.
 */
function OrientControls({ dark, upZ, onToggle }: OrientProps) {
  const panel = dark ? 'rgba(24,21,16,0.95)' : 'rgba(247,244,237,0.97)'
  const text = dark ? '#ece7d9' : '#26231d'
  const border = dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.14)'

  return (
    <div style={{ position: 'absolute', right: 10, top: 10 }}>
      <button
        type="button"
        onClick={onToggle}
        title={upZ ? 'Вертикальная ось: Z (нажми — Y)' : 'Вертикальная ось: Y (нажми — Z)'}
        style={{
          width: 28,
          height: 28,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: `1px solid ${border}`,
          borderRadius: 6,
          cursor: 'pointer',
          color: text,
          background: panel,
        }}
      >
        <UpAxisIcon z={upZ} />
      </button>
    </div>
  )
}

interface PickerProps {
  dark: boolean
  clips: ClipOption[]
  selectedId: string | null
  playing: boolean
  onSelect: (id: string | null) => void
  onTogglePlay: () => void
}

/**
 * Тематический селектор анимаций (нативный <select> рисует <option> системными цветами —
 * на тёмной теме это белое-на-белом). Показывает имя клипа и, для внешних, исходный файл.
 */
function ClipPicker({ dark, clips, selectedId, playing, onSelect, onTogglePlay }: PickerProps) {
  const [open, setOpen] = useState(false)
  const selected = clips.find((c) => c.id === selectedId) ?? null

  const panel = dark ? 'rgba(24,21,16,0.95)' : 'rgba(247,244,237,0.97)'
  const text = dark ? '#ece7d9' : '#26231d'
  const muted = dark ? 'rgba(236,231,217,0.5)' : 'rgba(38,35,29,0.5)'
  const border = dark ? 'rgba(255,255,255,0.14)' : 'rgba(0,0,0,0.14)'
  const hover = dark ? 'rgba(255,255,255,0.09)' : 'rgba(0,0,0,0.06)'

  return (
    <div style={{ position: 'absolute', left: 10, bottom: 10, display: 'flex', alignItems: 'flex-end', gap: 6 }}>
      <button
        type="button"
        onClick={onTogglePlay}
        disabled={!selected}
        title={playing ? 'Pause' : 'Play'}
        style={{
          width: 26,
          height: 26,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          border: `1px solid ${border}`,
          borderRadius: 6,
          cursor: selected ? 'pointer' : 'default',
          color: text,
          background: panel,
          fontSize: 10,
          opacity: selected ? 1 : 0.45,
        }}
      >
        {playing ? '❚❚' : '►'}
      </button>

      <div style={{ position: 'relative' }}>
        {open && (
          <>
            {/* клик мимо — закрыть */}
            <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 1 }} />
            <div
              style={{
                position: 'absolute',
                bottom: 'calc(100% + 4px)',
                left: 0,
                zIndex: 2,
                minWidth: 210,
                maxWidth: 300,
                maxHeight: 264,
                overflowY: 'auto',
                background: panel,
                border: `1px solid ${border}`,
                borderRadius: 8,
                boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
                backdropFilter: 'blur(8px)',
                padding: 4,
              }}
            >
              <ClipRow
                label="No animation"
                active={!selected}
                text={text}
                muted={muted}
                hover={hover}
                onClick={() => {
                  onSelect(null)
                  setOpen(false)
                }}
              />
              {clips.map((c) => (
                <ClipRow
                  key={c.id}
                  label={c.label}
                  file={c.kind === 'external' ? c.file : undefined}
                  active={c.id === selectedId}
                  text={text}
                  muted={muted}
                  hover={hover}
                  onClick={() => {
                    onSelect(c.id)
                    setOpen(false)
                  }}
                />
              ))}
            </div>
          </>
        )}

        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            maxWidth: 240,
            border: `1px solid ${border}`,
            borderRadius: 6,
            padding: '5px 8px',
            background: panel,
            color: text,
            fontSize: 11.5,
            cursor: 'pointer',
          }}
        >
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selected ? selected.label : 'No animation'}
          </span>
          <span style={{ opacity: 0.5, fontSize: 8 }}>▲</span>
        </button>
      </div>
    </div>
  )
}

function ClipRow({
  label,
  file,
  active,
  text,
  muted,
  hover,
  onClick,
}: {
  label: string
  file?: string
  active: boolean
  text: string
  muted: string
  hover: string
  onClick: () => void
}) {
  const [hot, setHot] = useState(false)
  return (
    <button
      type="button"
      onMouseEnter={() => setHot(true)}
      onMouseLeave={() => setHot(false)}
      onClick={onClick}
      style={{
        display: 'block',
        width: '100%',
        textAlign: 'left',
        border: 'none',
        borderRadius: 5,
        padding: '5px 8px',
        cursor: 'pointer',
        color: text,
        background: active || hot ? hover : 'transparent',
      }}
    >
      <div
        style={{
          fontSize: 11.5,
          fontWeight: active ? 600 : 400,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}
      >
        {label}
      </div>
      {file && (
        <div
          style={{
            fontSize: 9.5,
            color: muted,
            marginTop: 1,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {file}
        </div>
      )}
    </button>
  )
}
