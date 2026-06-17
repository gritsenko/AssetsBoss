import * as THREE from 'three'

/**
 * Ось «вверх», объявленная в GlobalSettings FBX. three.js всегда Y-up, а FBXLoader (0.180)
 * читает из GlobalSettings только AmbientColor/UnitScaleFactor и НЕ применяет UpAxis — поэтому
 * Z-up модели (3ds Max и т.п.) могут приехать повёрнутыми. Эти значения нужны, чтобы довернуть.
 *
 * upAxis: 0=X, 1=Y, 2=Z. sign: +1/-1. original: исходная ось до экспортной конвертации
 * (-1 — неизвестно). Любое поле — null, если в файле его нет.
 */
export interface FbxAxis {
  upAxis: number | null
  upAxisSign: number | null
  original: number | null
}

const FBX_BINARY_MAGIC = 'Kaydara FBX Binary'

function isAscii(u8: Uint8Array): boolean {
  // бинарный FBX начинается с "Kaydara FBX Binary"; всё прочее считаем ASCII-вариантом
  if (u8.length < FBX_BINARY_MAGIC.length) return true
  for (let i = 0; i < FBX_BINARY_MAGIC.length; i++) {
    if (u8[i] !== FBX_BINARY_MAGIC.charCodeAt(i)) return true
  }
  return false
}

/**
 * Читает целочисленные свойства осей из GlobalSettings прямо из буфера FBX — без подключения
 * SDK. Работает и для бинарного (7400/7500), и для ASCII FBX. Возвращает null-поля, если ось
 * в файле не объявлена (кривой экспорт) — тогда остаётся только ручная коррекция.
 */
export function readFbxAxis(arrayBuffer: ArrayBuffer): FbxAxis {
  const u8 = new Uint8Array(arrayBuffer)
  return isAscii(u8) ? readAscii(u8) : readBinary(arrayBuffer, u8)
}

/**
 * Бинарный FBX: свойства GlobalSettings лежат как записи Properties70 — имя-строка (тип 'S'),
 * затем 3 строки-дескриптора (type/label/flags) и значение с однобайтовым кодом типа. Ищем
 * именно строковое обрамление имени, поэтому код не зависит от версии заголовков нод.
 */
function readBinary(arrayBuffer: ArrayBuffer, u8: Uint8Array): FbxAxis {
  const dv = new DataView(arrayBuffer)
  const enc = new TextEncoder()

  function findIntProp(name: string): number | null {
    const nb = enc.encode(name)
    const len = nb.length
    for (let i = 0; i + 5 + len <= u8.length; i++) {
      if (u8[i] !== 0x53) continue // 'S' — строковое свойство (имя)
      if (dv.getUint32(i + 1, true) !== len) continue // точное совпадение длины имени
      let ok = true
      for (let j = 0; j < len; j++) {
        if (u8[i + 5 + j] !== nb[j]) {
          ok = false
          break
        }
      }
      if (!ok) continue

      // пропускаем 3 строки-дескриптора (type, label, flags)
      let off = i + 5 + len
      let bad = false
      for (let k = 0; k < 3; k++) {
        if (u8[off] !== 0x53) {
          bad = true
          break
        }
        off += 5 + dv.getUint32(off + 1, true)
      }
      if (bad) continue // не похоже на P-запись — случайное совпадение байт, ищем дальше

      const tc = String.fromCharCode(u8[off++])
      if (tc === 'I') return dv.getInt32(off, true)
      if (tc === 'Y') return dv.getInt16(off, true)
      if (tc === 'L') return Number(dv.getBigInt64(off, true))
      return null
    }
    return null
  }

  return {
    upAxis: findIntProp('UpAxis'),
    upAxisSign: findIntProp('UpAxisSign'),
    original: findIntProp('OriginalUpAxis'),
  }
}

/** ASCII FBX: `P: "UpAxis", "int", "Integer", "", 1` — берём последнее число в записи свойства. */
function readAscii(u8: Uint8Array): FbxAxis {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(u8)
  const read = (name: string): number | null => {
    const re = new RegExp(`"${name}"\\s*,\\s*"[^"]*"\\s*,\\s*"[^"]*"\\s*,\\s*"[^"]*"\\s*,\\s*(-?\\d+)`)
    const m = re.exec(text)
    return m ? Number(m[1]) : null
  }
  return {
    upAxis: read('UpAxis'),
    upAxisSign: read('UpAxisSign'),
    original: read('OriginalUpAxis'),
  }
}

/**
 * Кватернион доворота из системы координат FBX в Y-up three.js. null — коррекция не нужна
 * (уже Y-up) или ось не определена. Покрываем частые случаи: Z-up (3ds Max → -90° вокруг X)
 * и X-up. Знак оси (UpAxisSign=-1) инвертирует доворот.
 */
export function fbxUpCorrection(axis: FbxAxis): THREE.Quaternion | null {
  const { upAxis, upAxisSign } = axis
  if (upAxis === null || upAxis === 1) return null // Y-up — нативно для three.js

  const sign = upAxisSign === -1 ? -1 : 1
  const half = (sign * Math.PI) / 2

  if (upAxis === 2) {
    // Z вверх → доворот вокруг X переводит +Z в +Y
    return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -half)
  }
  if (upAxis === 0) {
    // X вверх (редко) → доворот вокруг Z переводит +X в +Y
    return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), half)
  }
  return null
}
