import { Component, lazy, Suspense, type ReactNode } from 'react'
import type { Asset } from '../api/types'

// three.js + R3F тяжёлые — грузим их отдельным чанком только когда открыли модель
const Inner = lazy(() => import('./ModelViewer'))

interface Props {
  asset: Asset
  dark: boolean
}

function Notice({ text }: { text: string }) {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: 12.5,
        color: 'var(--muted)',
      }}
    >
      {text}
    </div>
  )
}

/** Ловит сбой загрузки чанка просмотрщика (офлайн, протух хэш после редеплоя) — без падения всего app. */
class ViewerBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }

  static getDerivedStateFromError() {
    return { failed: true }
  }

  render() {
    if (this.state.failed) return <Notice text="Couldn’t load 3D viewer" />
    return this.props.children
  }
}

export function ModelViewer({ asset, dark }: Props) {
  return (
    <ViewerBoundary>
      <Suspense fallback={<Notice text="Loading 3D viewer…" />}>
        {/* key по asset — на смену модели чистый remount (сброс камеры/состояния загрузки) */}
        <Inner key={asset.id} asset={asset} dark={dark} />
      </Suspense>
    </ViewerBoundary>
  )
}
