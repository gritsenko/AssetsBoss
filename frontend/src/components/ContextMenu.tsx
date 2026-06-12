import { type ReactNode, useEffect, useRef } from 'react'
import { useHover } from '../hooks/useHover'

export interface MenuItem {
  icon?: ReactNode
  label: string
  onClick: () => void
  disabled?: boolean
}

interface Props {
  x: number
  y: number
  items: MenuItem[]
  onClose: () => void
}

const MENU_WIDTH = 196
const ROW_HEIGHT = 33

/**
 * Лёгкое контекстное меню у курсора. Рендерится инлайн (а не через портал),
 * чтобы наследовать CSS-переменные темы с корневого div. Закрывается по клику
 * вне меню, Escape, скроллу и ресайзу окна.
 */
export function ContextMenu({ x, y, items, onClose }: Props) {
  const ref = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    const onPointerDown = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) onClose()
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('mousedown', onPointerDown)
    window.addEventListener('keydown', onKey)
    window.addEventListener('resize', onClose)
    window.addEventListener('scroll', onClose, true)
    return () => {
      window.removeEventListener('mousedown', onPointerDown)
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('resize', onClose)
      window.removeEventListener('scroll', onClose, true)
    }
  }, [onClose])

  // удерживаем меню в пределах окна
  const left = Math.min(x, window.innerWidth - MENU_WIDTH - 8)
  const top = Math.min(y, window.innerHeight - items.length * ROW_HEIGHT - 12)

  return (
    <div
      ref={ref}
      className="ab-fade"
      onContextMenu={(e) => e.preventDefault()}
      style={{
        position: 'fixed',
        left,
        top,
        zIndex: 90,
        minWidth: MENU_WIDTH,
        background: 'var(--panel)',
        border: '1px solid var(--line2)',
        borderRadius: 10,
        padding: 5,
        boxShadow: '0 14px 40px var(--sh2)',
      }}
    >
      {items.map((item, i) => (
        <Row key={i} item={item} onClose={onClose} />
      ))}
    </div>
  )
}

function Row({ item, onClose }: { item: MenuItem; onClose: () => void }) {
  const { hovered, bind } = useHover()
  const interactive = !item.disabled
  return (
    <button
      type="button"
      disabled={item.disabled}
      onClick={() => {
        if (!interactive) return
        item.onClick()
        onClose()
      }}
      {...bind}
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 9,
        width: '100%',
        border: 'none',
        background: hovered && interactive ? 'var(--hover)' : 'transparent',
        borderRadius: 7,
        padding: '7px 10px',
        cursor: interactive ? 'pointer' : 'default',
        fontSize: 12.5,
        fontWeight: 500,
        color: interactive ? 'var(--ink2)' : 'var(--faint)',
        textAlign: 'left',
      }}
    >
      {item.icon && (
        <span style={{ display: 'flex', flex: '0 0 auto', color: 'var(--muted)' }}>{item.icon}</span>
      )}
      {item.label}
    </button>
  )
}
