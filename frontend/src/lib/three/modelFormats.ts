// Лёгкий модуль БЕЗ импорта three.js — чтобы галерея (AssetThumb) могла спросить
// «эту модель можно смотреть?», не утягивая three в основной бандл. Тяжёлый three
// грузится лениво через ./loadModel (просмотрщик) и ./thumbnailer (генерация превью).

/** Форматы моделей, которые умеет открывать WebGL-просмотрщик. */
export const VIEWABLE_MODEL_EXTS = new Set(['.glb', '.gltf', '.fbx', '.obj'])

export function canViewModel(ext: string): boolean {
  return VIEWABLE_MODEL_EXTS.has(ext.toLowerCase())
}
