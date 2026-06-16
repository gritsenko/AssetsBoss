import * as THREE from 'three'
import { api, MODEL_THUMB_MASTER, modelThumbUploadUrl } from '../../api/client'
import type { Asset } from '../../api/types'
import { disposeObject, loadModel } from './loadModel'

/**
 * Сервер не рендерит 3D (нет headless-GL на ARM) — миниатюры моделей делает клиент:
 * грузим модель в offscreen-WebGL теми же загрузчиками, что и просмотрщик, снимаем один
 * мастер-кадр (512) и заливаем на бэк, где он кэшируется и ужимается под размеры сетки.
 *
 * Один общий рендерер; задания строго последовательны (один GL-контекст не рисует
 * параллельно) и дедуплицируются по (asset, mtime). При сбое запись из inflight удаляется —
 * чтобы транзиентная ошибка не «прибивала» превью на всю сессию.
 */

let renderer: THREE.WebGLRenderer | null = null

function getRenderer(): THREE.WebGLRenderer {
  if (!renderer) {
    const r = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true, // нужно для toBlob после render
    })
    r.setClearColor(0x000000, 0)
    r.outputColorSpace = THREE.SRGBColorSpace
    // потеря контекста (частая при churn множества контекстов) — пересоздадим в следующем задании
    r.domElement.addEventListener('webglcontextlost', () => {
      renderer = null
    })
    renderer = r
  }
  return renderer
}

const inflight = new Map<string, Promise<boolean>>()
let chain: Promise<unknown> = Promise.resolve()

/** Ставит задание в общую очередь (по очереди, не параллельно). */
function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(task, task)
  chain = run.then(
    () => {},
    () => {},
  )
  return run
}

/**
 * Гарантирует наличие мастер-превью модели на бэке: если кэша нет, рендерит и заливает.
 * Возвращает true, если после вызова превью доступно. Безопасно дёргать из многих карточек —
 * дедуп по (asset, mtime), один рендер обслуживает все размеры сетки.
 */
export function ensureModelThumb(asset: Asset): Promise<boolean> {
  const key = `${asset.id}:${asset.mtime}`
  let p = inflight.get(key)
  if (!p) {
    // удаляем ключ по завершении: успех — сервер уже отдаёт превью (повторный вызов не нужен),
    // ошибка — следующий показ карточки сможет попробовать снова
    p = enqueue(() => generate(asset)).finally(() => inflight.delete(key))
    inflight.set(key, p)
  }
  return p
}

async function generate(asset: Asset): Promise<boolean> {
  let obj: THREE.Object3D | null = null
  try {
    // bundle нужен для резолва внешних текстур (TGA, соседние папки); без него — clay
    const bundle = await api.getModelBundle(asset.id).catch(() => undefined)
    obj = await loadModel(asset, bundle)
    const blob = await renderToBlob(obj, MODEL_THUMB_MASTER)
    if (!blob) return false // пустой/вырожденный рендер — не кэшируем мусор, покажем иконку
    const res = await fetch(modelThumbUploadUrl(asset), {
      method: 'POST',
      body: blob,
      headers: { 'Content-Type': blob.type || 'image/webp' },
    })
    return res.ok
  } catch {
    return false
  } finally {
    if (obj) disposeObject(obj)
  }
}

function renderToBlob(obj: THREE.Object3D, size: number): Promise<Blob | null> {
  // центрируем модель и проверяем габариты — пустую/вырожденную сцену не публикуем
  const box = new THREE.Box3().setFromObject(obj)
  if (box.isEmpty()) return Promise.resolve(null)
  const center = box.getCenter(new THREE.Vector3())
  const radius = box.getBoundingSphere(new THREE.Sphere()).radius
  if (!Number.isFinite(radius) || radius <= 0) return Promise.resolve(null)

  const r = getRenderer()
  const px = Math.min(size * 2, 1024) // суперсэмплинг: рисуем крупнее, бэк ужмёт до size
  r.setSize(px, px, false)

  const scene = new THREE.Scene()
  scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 0.9))
  scene.add(new THREE.AmbientLight(0xffffff, 0.4))
  const key = new THREE.DirectionalLight(0xffffff, 1.7)
  key.position.set(4, 8, 6)
  scene.add(key)
  const fill = new THREE.DirectionalLight(0xffffff, 0.5)
  fill.position.set(-6, 2, -4)
  scene.add(fill)

  obj.position.sub(center)
  scene.add(obj)

  const cam = new THREE.PerspectiveCamera(40, 1, radius / 100, radius * 100)
  const dist = (radius / Math.sin(((cam.fov * Math.PI) / 180) / 2)) * 1.15
  cam.position.copy(new THREE.Vector3(1, 0.72, 1.25).normalize().multiplyScalar(dist))
  cam.lookAt(0, 0, 0)
  cam.updateProjectionMatrix()

  r.render(scene, cam)
  return new Promise<Blob | null>((resolve) => {
    r.domElement.toBlob((b) => resolve(b), 'image/webp', 0.85)
    scene.remove(obj)
  })
}
