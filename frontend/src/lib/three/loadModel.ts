import * as THREE from 'three'
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js'
import { FBXLoader } from 'three/examples/jsm/loaders/FBXLoader.js'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { MeshoptDecoder } from 'three/examples/jsm/libs/meshopt_decoder.module.js'
import { MTLLoader } from 'three/examples/jsm/loaders/MTLLoader.js'
import { OBJLoader } from 'three/examples/jsm/loaders/OBJLoader.js'
import { TGALoader } from 'three/examples/jsm/loaders/TGALoader.js'
import { modelUrl, rawUrl } from '../../api/client'
import type { Asset, ModelBundle, ModelCompanion } from '../../api/types'
import { fbxUpCorrection, readFbxAxis } from './fbxAxis'

export { canViewModel, VIEWABLE_MODEL_EXTS } from './modelFormats'

// декодер Draco лежит локально (public/draco) — компрессированные glb грузятся офлайн
let dracoLoader: DRACOLoader | null = null

function makeGltfLoader(manager: THREE.LoadingManager): GLTFLoader {
  const loader = new GLTFLoader(manager)
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

/** Имя файла из URL/пути: отбрасываем query и каталоги, декодируем %xx. */
function basename(url: string): string {
  const seg = (url.split('?')[0].split('#')[0].split(/[\\/]/).pop() ?? '').trim()
  try {
    return decodeURIComponent(seg)
  } catch {
    return seg
  }
}

/**
 * LoadingManager для 3D-загрузчиков: (1) регистрирует TGALoader, чтобы .tga-текстуры (типичные
 * для Unity-ассетов) вообще грузились; (2) если есть bundle — переписывает запрос текстуры по её
 * basename на raw-URL найденного файла. Так текстуры резолвятся независимо от того, какой путь
 * (часто абсолютный путь художника) зашит в FBX и в какой подпапке (Materials/Textures/…) лежат.
 */
function makeManager(sourceId: number, bundle?: ModelBundle): THREE.LoadingManager {
  const manager = new THREE.LoadingManager()
  manager.addHandler(/\.tga$/i, new TGALoader(manager))

  if (bundle && bundle.textures.length > 0) {
    const byName = new Map<string, string>()
    for (const t of bundle.textures) byName.set(basename(t.name).toLowerCase(), t.relPath)
    manager.setURLModifier((url) => {
      if (url.startsWith('data:') || url.startsWith('blob:')) return url
      const rel = byName.get(basename(url).toLowerCase())
      return rel ? rawUrl(sourceId, rel) : url
    })
  }
  return manager
}

type WithAnimations = THREE.Object3D & { animations?: THREE.AnimationClip[] }

/**
 * Загружает модель и возвращает корневой Object3D (с `.animations` — встроенными клипами, если
 * есть). Резолв соседних .bin/.mtl/текстур — относительно path-style URL модели (см. {@link rawUrl});
 * при наличии bundle внешние текстуры (включая .tga) подменяются по имени. Бросает при неизвестном
 * формате или ошибке загрузки.
 */
export async function loadModel(asset: Asset, bundle?: ModelBundle): Promise<THREE.Object3D> {
  const e = asset.ext.toLowerCase()
  const url = modelUrl(asset)
  const manager = makeManager(asset.sourceId, bundle)
  let obj: THREE.Object3D

  if (e === '.glb' || e === '.gltf') {
    // GLTFLoader дожидается всех текстур до resolve — досыпать ничего не нужно
    const gltf = await makeGltfLoader(manager).loadAsync(url)
    obj = gltf.scene
    ;(obj as WithAnimations).animations = gltf.animations ?? []
    sanitizeMaterials(obj)
    await applyBundleTextures(obj, bundle, asset.sourceId, manager)
    return obj
  }

  if (e === '.fbx') {
    obj = await loadFbx(url, manager)
  } else if (e === '.obj') {
    const objLoader = new OBJLoader(manager)
    // .mtl лежит рядом с .obj — подтягиваем материалы/текстуры; нет файла — дефолтный материал
    const mtlUrl = url.replace(/\.obj(\?|$)/i, '.mtl$1')
    try {
      const mtl = new MTLLoader(manager)
      mtl.setResourcePath(dirOf(url))
      const materials = await mtl.loadAsync(mtlUrl)
      materials.preload()
      objLoader.setMaterials(materials)
    } catch {
      /* нет .mtl — грузим только геометрию */
    }
    obj = await objLoader.loadAsync(url)
  } else {
    throw new Error(`Unsupported model format: ${asset.ext}`)
  }

  // FBX/OBJ грузят внешние текстуры асинхронно уже после resolve loadAsync; на localhost
  // успех/404 приходят за десятки мс — небольшой запас, потом чиним материалы
  await new Promise((r) => setTimeout(r, 300))
  sanitizeMaterials(obj)
  await applyBundleTextures(obj, bundle, asset.sourceId, manager)
  return obj
}

/**
 * Грузит FBX и доворачивает его под Y-up three.js по объявленной в файле оси. FBXLoader не
 * применяет UpAxis сам (Z-up модели из 3ds Max/Maya могут приехать повёрнутыми), а наружу ось
 * не отдаёт — поэтому читаем её прямо из буфера. Буфер качаем один раз и парсим через
 * FBXLoader.parse (loadAsync внутри делает ровно то же — fetch + parse), так что лишнего запроса
 * нет. Текстуры по-прежнему резолвятся через manager (URLModifier бандла), path — каталог модели.
 */
async function loadFbx(url: string, manager: THREE.LoadingManager): Promise<THREE.Object3D> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`FBX fetch failed: ${res.status} ${res.statusText}`)
  const buffer = await res.arrayBuffer()

  const path = THREE.LoaderUtils.extractUrlBase(url)
  const obj = new FBXLoader(manager).parse(buffer, path) as unknown as THREE.Object3D

  const correction = fbxUpCorrection(readFbxAxis(buffer))
  if (correction) {
    // premultiply — доворот в мировой системе поверх собственного трансформа корня
    obj.quaternion.premultiply(correction)
    obj.updateMatrixWorld(true)
  }
  return obj
}

/**
 * Грузит внешний анимационный FBX и возвращает его первый клип (треки ссылаются на кости по имени,
 * поэтому клип ретаргетится на скелет меша из того же рига). Меш аним-файла освобождается —
 * нужен только сам {@link THREE.AnimationClip}. Возвращает null, если клипов в файле нет.
 */
export async function loadAnimationClip(
  sourceId: number,
  relPath: string,
  bundle?: ModelBundle,
): Promise<THREE.AnimationClip | null> {
  const fbx = await new FBXLoader(makeManager(sourceId, bundle)).loadAsync(rawUrl(sourceId, relPath))
  const clip = (fbx as WithAnimations).animations?.[0] ?? null
  disposeObject(fbx as unknown as THREE.Object3D)
  return clip
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

type StdMat = THREE.MeshStandardMaterial & Record<string, unknown>
type TextureSlot = 'map' | 'normalMap' | 'metalnessMap' | 'roughnessMap' | 'aoMap' | 'emissiveMap'

/**
 * Слоты PBR-материала и суффиксы имён файлов, по которым текстура к ним привязывается.
 * Порядок важен: специфичные слоты раньше, базовый цвет (map) — последним (его суффиксы и
 * «нет суффикса» — самый общий случай). Однобуквенные суффиксы (n/m/r/…) в конце своих списков.
 */
const TEXTURE_SLOTS: { slot: TextureSlot; srgb: boolean; suffixes: string[] }[] = [
  { slot: 'normalMap', srgb: false, suffixes: ['normal', 'nrm', 'norm', 'nor', 'nm', 'n'] },
  { slot: 'metalnessMap', srgb: false, suffixes: ['metallic', 'metalness', 'metal', 'orm', 'ms', 'mr', 'm'] },
  { slot: 'roughnessMap', srgb: false, suffixes: ['roughness', 'rough', 'smoothness', 'gloss', 'spec', 'r', 's'] },
  { slot: 'aoMap', srgb: false, suffixes: ['ao', 'occlusion', 'occ', 'o'] },
  { slot: 'emissiveMap', srgb: true, suffixes: ['emission', 'emissive', 'emit', 'glow', 'em', 'e'] },
  { slot: 'map', srgb: true, suffixes: ['basecolor', 'albedo', 'diffuse', 'diff', 'color', 'col', 'base', 'bc', 'ds', 'df', 'd', 'c'] },
]

const SLOT_SRGB = Object.fromEntries(TEXTURE_SLOTS.map((s) => [s.slot, s.srgb])) as Record<TextureSlot, boolean>
const KNOWN_SLOTS = new Set<string>(Object.keys(SLOT_SRGB))

/** Классифицирует текстуру по суффиксу имени: слот PBR + «стем» (имя без суффикса) для матчинга. */
function classifyTexture(fileName: string): { slot: TextureSlot; srgb: boolean; stem: string } {
  const stripped = fileName.replace(/\.[^.]+$/, '').toLowerCase()
  const sep = Math.max(stripped.lastIndexOf('_'), stripped.lastIndexOf('-'), stripped.lastIndexOf(' '))
  const token = sep >= 0 ? stripped.slice(sep + 1) : ''
  for (const def of TEXTURE_SLOTS) {
    if (token && def.suffixes.includes(token)) {
      return { slot: def.slot, srgb: def.srgb, stem: stripped.slice(0, sep) }
    }
  }
  // нет распознанного суффикса → это базовый цвет (типичный одиночный diffuse / атлас)
  return { slot: 'map', srgb: true, stem: stripped }
}

/**
 * Слот текстуры: точный (slot из Unity .mat/.meta) либо эвристический (по суффиксу имени).
 * explicit-кандидаты доверенные — назначаются даже без совпадения имени с материалом.
 */
function resolveSlot(t: ModelCompanion): { slot: TextureSlot; srgb: boolean; stem: string; explicit: boolean } {
  if (t.slot && KNOWN_SLOTS.has(t.slot)) {
    const slot = t.slot as TextureSlot
    return { slot, srgb: SLOT_SRGB[slot], stem: classifyTexture(t.name).stem, explicit: true }
  }
  return { ...classifyTexture(t.name), explicit: false }
}

function loadTexture(
  manager: THREE.LoadingManager,
  sourceId: number,
  relPath: string,
): Promise<THREE.Texture | null> {
  const url = rawUrl(sourceId, relPath)
  const handler = manager.getHandler(url) as { loadAsync(u: string): Promise<THREE.Texture> } | null
  const loader = handler ?? new THREE.TextureLoader(manager)
  return loader.loadAsync(url).catch(() => null)
}

/**
 * Привязывает текстуры из bundle к материалам по конвенции имён (`_DF`→base, `_NM`→normal,
 * `_MS`→metal, `_EM`→emissive…). Заполняет ТОЛЬКО пустые слоты — текстуры, уже разрешённые
 * самим FBX/glTF (как у волка), не трогаются. Нужно для ассетов, где связь материал→текстура
 * живёт вне модели (Unity .mat/.meta) и FBX не несёт ссылок — тогда three.js сам текстуры не найдёт.
 * Стем текстуры матчится с именем материала/меша; при единственном стеме матчинг не требуется.
 */
async function applyBundleTextures(
  root: THREE.Object3D,
  bundle: ModelBundle | undefined,
  sourceId: number,
  manager: THREE.LoadingManager,
): Promise<void> {
  if (!bundle || bundle.textures.length === 0) return

  const classified = bundle.textures.map((t) => ({ ...resolveSlot(t), relPath: t.relPath }))
  const stems = new Set(classified.map((c) => c.stem).filter(Boolean))
  const singleStem = stems.size <= 1

  const cache = new Map<string, Promise<THREE.Texture | null>>()
  const load = (relPath: string) => {
    let p = cache.get(relPath)
    if (!p) {
      p = loadTexture(manager, sourceId, relPath)
      cache.set(relPath, p)
    }
    return p
  }

  const tasks: Promise<void>[] = []
  root.traverse((node) => {
    const mesh = node as THREE.Mesh
    if (!mesh.isMesh) return
    const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
    for (const mat of mats) {
      const m = mat as StdMat
      if (!m) continue
      const key = ((m.name as string) || mesh.name || '').toLowerCase()

      for (const def of TEXTURE_SLOTS) {
        if (m[def.slot]) continue // слот занят — не перетираем (текстуры FBX/glTF в приоритете)
        const cands = classified.filter((c) => c.slot === def.slot)
        if (cands.length === 0) continue
        // точные (Unity) кандидаты в приоритете; эвристические — только при матче имени или единственном стеме
        const explicit = cands.filter((c) => c.explicit)
        const pool = explicit.length > 0 ? explicit : cands
        const pick =
          pool.find((c) => c.stem && key && (key.includes(c.stem) || c.stem.includes(key))) ??
          (explicit.length > 0 || singleStem ? pool[0] : undefined)
        if (!pick) continue

        tasks.push(
          load(pick.relPath).then((tex) => {
            if (!tex || m[def.slot]) return
            tex.colorSpace = def.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace
            tex.wrapS = THREE.RepeatWrapping
            tex.wrapT = THREE.RepeatWrapping
            ;(m as Record<string, unknown>)[def.slot] = tex
            // вернули диффуз — снимаем clay-заглушку/тёмный цвет, чтобы текстура не тонировалась
            if (def.slot === 'map' && m.color?.setHex) m.color.setHex(0xffffff)
            // emissiveMap множится на emissive-цвет: при чёрном (дефолт) карта не видна — белим
            if (def.slot === 'emissiveMap' && m.emissive?.getHex?.() === 0x000000) m.emissive.setHex(0xffffff)
            m.needsUpdate = true
          }),
        )
      }
    }
  })

  await Promise.all(tasks)
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
