import * as THREE from 'three'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'

export { canViewModel, VIEWABLE_MODEL_EXTS } from './modelFormats'

// декодер Draco лежит локально (public/draco) — компрессированные glb грузятся офлайн
let dracoLoader: DRACOLoader | null = null

function makeGltfLoader(): GLTFLoader {
  const loader = new GLTFLoader()
  if (!dracoLoader) {
    dracoLoader = new DRACOLoader()
    dracoLoader.setDecoderPath('/draco/gltf/')
  }
  loader.setDRACOLoader(dracoLoader)
  loader.setMeshoptDecoder(MeshoptDecoder)
  return loader
}

function dirOf(url: string): string {
  const i = url.lastIndexOf('/')
  return i < 0 ? '' : url.slice(0, i + 1)
}

/**
 * Загружает модель и возвращает корневой Object3D. URL должен быть path-style
 * (см. {@link rawUrl}) — загрузчики резолвят соседние .bin/.mtl/текстуры относительно него.
 * Бросает при неизвестном формате или ошибке загрузки.
 */
export async function loadModel(url: string, ext: string): Promise<THREE.Object3D> {
  const e = ext.toLowerCase()
  let obj: THREE.Object3D

  if (e === '.glb' || e === '.gltf') {
    // GLTFLoader дожидается всех текстур до resolve — досыпать ничего не нужно
    obj = (await makeGltfLoader().loadAsync(url)).scene
    sanitizeMaterials(obj)
    return obj
  }

  if (e === '.fbx') {
    obj = (await new FBXLoader().loadAsync(url)) as unknown as THREE.Object3D
  } else if (e === '.obj') {
    const objLoader = new OBJLoader()
    // .mtl лежит рядом с .obj — подтягиваем материалы/текстуры; нет файла — дефолтный материал
    const mtlUrl = url.replace(/\.obj(\?|$)/i, '.mtl$1')
    try {
      const mtl = new MTLLoader()
      mtl.setResourcePath(dirOf(url))
      const materials = await mtl.loadAsync(mtlUrl)
      materials.preload()
      objLoader.setMaterials(materials)
    } catch {
      /* нет .mtl — грузим только геометрию */
    }
    obj = await objLoader.loadAsync(url)
  } else {
    throw new Error(`Unsupported model format: ${ext}`)
  }

  // FBX/OBJ грузят внешние текстуры асинхронно уже после resolve loadAsync; на localhost
  // успех/404 приходят за десятки мс — небольшой запас, потом чиним материалы
  await new Promise((r) => setTimeout(r, 300))
  sanitizeMaterials(obj)
  return obj
}

function textureLoaded(tex: THREE.Texture | null | undefined): boolean {
  const img = tex?.image as { width?: number; naturalWidth?: number } | undefined
  return !!(img && (img.width || img.naturalWidth))
}

// слоты текстур, которые проверяем на «битость» (общий атлас часто лежит не рядом с .fbx/.obj)
const MAP_SLOTS = [
  'map',
  'normalMap',
  'roughnessMap',
  'metalnessMap',
  'aoMap',
  'emissiveMap',
  'specularMap',
] as const

/**
 * Чинит внешний вид моделей с неразрешившимися текстурами: выкидывает все «битые» карты
 * (иначе normal/rough/ao рисуют чёрный/мусор), а почти чёрный базовый цвет красит в нейтральный
 * clay ТОЛЬКО если ждали диффуз-текстуру (m.map), но она не загрузилась — намеренно тёмные
 * материалы без текстур не трогаем.
 */
function sanitizeMaterials(root: THREE.Object3D): void {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const mat of mats) {
      const m = mat as THREE.MeshStandardMaterial & Record<string, unknown>
      if (!m) continue

      let baseMapFailed = false
      for (const slot of MAP_SLOTS) {
        const tex = m[slot] as THREE.Texture | null | undefined
        if (tex && tex.isTexture && !textureLoaded(tex)) {
          if (slot === 'map') baseMapFailed = true
          m[slot] = null
          m.needsUpdate = true
        }
      }

      if (baseMapFailed && m.color && typeof m.color.getHSL === 'function') {
        const hsl = { h: 0, s: 0, l: 0 }
        m.color.getHSL(hsl)
        if (hsl.l < 0.12) {
          m.color.setHex(0x9a948c)
          m.needsUpdate = true
        }
      }
    }
  })
}

function disposeMaterial(material: THREE.Material): void {
  for (const value of Object.values(material) as unknown[]) {
    if (value && (value as THREE.Texture).isTexture) (value as THREE.Texture).dispose()
  }
  material.dispose()
}

/** Освобождает GPU-ресурсы (геометрии, материалы, текстуры) загруженной модели. */
export function disposeObject(root: THREE.Object3D): void {
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (mesh.geometry) mesh.geometry.dispose()
    const material = mesh.material
    if (Array.isArray(material)) material.forEach(disposeMaterial)
    else if (material) disposeMaterial(material)
  })
}
