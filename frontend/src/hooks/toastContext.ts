import { createContext, useContext } from 'react'

export const ToastContext = createContext<(msg: string) => void>(() => {})

/** Show a transient toast message from anywhere under the ToastProvider. */
export function useToast() {
  return useContext(ToastContext)
}
