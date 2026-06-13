import { Bounds, OrbitControls, useBounds } from '@react-three/drei'
import { Canvas } from '@react-three/fiber'
import { useEffect, useState } from 'react'
import type * as THREE from 'three'
import { modelUrl } from '../api/client'
import type { Asset } from '../api/types'
import { disposeObject, loadModel } from '../lib/three/loadModel'
import { canViewModel } from '../lib/three/modelFormats'

type Status = 'loading' | 'ready' | 'error'

interface Props {
  asset: Asset
  dark: boolean
}

/**
 * Интерактивный WebGL-просмотрщик 3D-моделей (glb/gltf/fbx/obj) на three.js + R3F.
 * Грузит оригинал через path-style URL (резолвит соседние текстуры), вписывает камеру
 * по габаритам и медленно вращает. Тяжёлый three.js грузится лениво (см. ModelViewerLazy).
 */
export default function ModelViewer({ asset, dark }: Props) {
  const [status, setStatus] = useState<Status>(canViewModel(asset.ext) ? 'loading' : 'error')
  const bg = dark ? '#1B1914' : '#ECE9E0'

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
            <ModelObject asset={asset} onStatus={setStatus} />
          </Bounds>
          <OrbitControls makeDefault autoRotate autoRotateSpeed={1.1} enableDamping enablePan />
        </Canvas>
      )}

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

function ModelObject({ asset, onStatus }: { asset: Asset; onStatus: (s: Status) => void }) {
  const [obj, setObj] = useState<THREE.Object3D | null>(null)
  const bounds = useBounds()

  // Inner кейется по asset (см. ModelViewerLazy) — компонент монтируется заново на каждую
  // модель, поэтому грузим один раз на монтировании, без синхронного сброса state в эффекте
  useEffect(() => {
    let alive = true
    let loaded: THREE.Object3D | null = null

    loadModel(modelUrl(asset), asset.ext)
      .then((o) => {
        if (!alive) {
          disposeObject(o)
          return
        }
        loaded = o
        setObj(o)
        onStatus('ready')
      })
      .catch(() => {
        if (alive) onStatus('error')
      })

    return () => {
      alive = false
      if (loaded) disposeObject(loaded)
    }
  }, [asset, onStatus])

  // переподогнать камеру под габариты, как только модель появилась
  useEffect(() => {
    if (obj) bounds.refresh(obj).clip().fit()
  }, [obj, bounds])

  return obj ? <primitive object={obj} /> : null
}
