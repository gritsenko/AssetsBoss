import { useEffect, useState } from 'react'

/** useState backed by localStorage. Falls back to the default if storage is unavailable. */
export function usePersistedState<T>(key: string, initial: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key)
      return raw === null ? initial : (JSON.parse(raw) as T)
    } catch {
      return initial
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value))
    } catch {
      // нет доступа к storage — состояние живёт в рамках сессии
    }
  }, [key, value])

  return [value, setValue]
}
