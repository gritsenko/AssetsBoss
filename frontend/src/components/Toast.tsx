import { useCallback, useRef, useState, type ReactNode } from 'react'
import { ToastContext } from '../hooks/toastContext'

interface ToastState {
  id: number
  msg: string
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const seq = useRef(0)

  const showToast = useCallback((msg: string) => {
    clearTimeout(timer.current)
    const id = ++seq.current
    setToast({ id, msg })
    timer.current = setTimeout(() => {
      setToast((cur) => (cur?.id === id ? null : cur))
    }, 3000)
  }, [])

  return (
    <ToastContext.Provider value={showToast}>
      {children}
      {toast && (
        <div
          key={toast.id}
          className="ab-pop"
          style={{
            position: 'fixed',
            bottom: 98,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 60,
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            background: 'var(--inkBg)',
            color: 'var(--inkFg)',
            borderRadius: 10,
            padding: '10px 16px',
            fontSize: 13,
            boxShadow: '0 12px 36px var(--sh2)',
          }}
        >
          <span>{toast.msg}</span>
        </div>
      )}
    </ToastContext.Provider>
  )
}
