import type { CSSProperties, ReactNode } from 'react'
import { useHover } from '../hooks/useHover'

/** Ghost square icon button (titlebar / panel headers). */
export function IconButton({
  onClick,
  title,
  children,
  size = 32,
}: {
  onClick?: () => void
  title?: string
  children: ReactNode
  size?: number
}) {
  const { hovered, bind } = useHover()
  return (
    <button
      type="button"
      onClick={onClick}
      title={title}
      {...bind}
      style={{
        width: size,
        height: size,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: hovered ? 'var(--hover)' : 'transparent',
        border: 'none',
        borderRadius: 8,
        cursor: 'pointer',
        color: hovered ? 'var(--ink)' : 'var(--muted)',
        flex: '0 0 auto',
      }}
    >
      {children}
    </button>
  )
}

/** Monospace keycap hint (⌘K, esc, …). */
export function Kbd({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <span
      className="font-mono"
      style={{
        fontSize: 10,
        background: 'var(--bg)',
        border: '1px solid var(--line)',
        borderRadius: 4,
        padding: '1px 5px',
        color: 'var(--faint)',
        ...style,
      }}
    >
      {children}
    </span>
  )
}

/** Small uppercase mono section label used in the sidebar and detail panel. */
export function SectionLabel({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div
      className="font-mono"
      style={{
        fontSize: 9.5,
        letterSpacing: '0.14em',
        color: 'var(--faint)',
        textTransform: 'uppercase',
        ...style,
      }}
    >
      {children}
    </div>
  )
}
