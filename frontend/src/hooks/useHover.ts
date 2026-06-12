import { useMemo, useState } from 'react'

/**
 * Mirrors the design prototype's `style-hover`: merge a hover style over the base
 * while the pointer is over the element. Inline styles win over Tailwind `hover:`
 * classes, so interactive elements ported from the design use this instead.
 */
export function useHover() {
  const [hovered, setHovered] = useState(false)
  const bind = useMemo(
    () => ({
      onMouseEnter: () => setHovered(true),
      onMouseLeave: () => setHovered(false),
    }),
    [],
  )
  return { hovered, bind }
}
