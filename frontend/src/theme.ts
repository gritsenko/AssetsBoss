import { useCallback, useEffect, useState, type CSSProperties } from 'react'

/**
 * "Studio paper" palette ported verbatim from the AssetBoss design bundle.
 * Warm light theme + warm dark theme, burnt-orange accent (#D96E34).
 * Exposed to the tree as CSS custom properties on the root element so every
 * component reads `var(--ink)` etc. and theme switches are instant.
 */
export interface ThemeTokens {
  bg: string
  card: string
  panel: string
  well: string
  ink: string
  ink2: string
  muted: string
  faint: string
  line: string
  line2: string
  line3: string
  hover: string
  inkBg: string
  inkFg: string
  inkMuted: string
  inkLine: string
  inkHover: string
  inkDanger: string
  undo: string
  dots: string
  danger: string
  dangerB: string
  sh1: string
  sh2: string
  sb: string
}

export const ACCENT = '#D96E34'
export const ACCENT_HOVER = '#C25A24'

export const THEMES: Record<'light' | 'dark', ThemeTokens> = {
  light: {
    bg: '#F3F1EA', card: '#FFFFFF', panel: '#FBFAF5', well: '#ECE9E0',
    ink: '#1D1C18', ink2: '#3D3A32', muted: '#8B8577', faint: '#A89F8D',
    line: 'rgba(29,28,24,0.09)', line2: 'rgba(29,28,24,0.13)', line3: 'rgba(29,28,24,0.24)',
    hover: 'rgba(29,28,24,0.06)', inkBg: '#1D1C18', inkFg: '#F5F2E9',
    inkMuted: 'rgba(245,242,233,0.62)', inkLine: 'rgba(245,242,233,0.18)',
    inkHover: 'rgba(245,242,233,0.12)', inkDanger: '#FF9C7E', undo: '#F09A66',
    dots: '#E2DCCB', danger: '#B3402A', dangerB: 'rgba(179,64,42,0.3)',
    sh1: 'rgba(29,28,24,0.10)', sh2: 'rgba(20,19,16,0.4)', sb: '#D8D3C4',
  },
  dark: {
    bg: '#16140F', card: '#211E18', panel: '#24211A', well: '#1B1914',
    ink: '#EDE7D9', ink2: '#CFC8B8', muted: '#9A937F', faint: '#6E6859',
    line: 'rgba(237,231,217,0.08)', line2: 'rgba(237,231,217,0.14)', line3: 'rgba(237,231,217,0.28)',
    hover: 'rgba(237,231,217,0.06)', inkBg: '#EDE7D9', inkFg: '#1D1C18',
    inkMuted: 'rgba(29,28,24,0.62)', inkLine: 'rgba(29,28,24,0.18)',
    inkHover: 'rgba(29,28,24,0.08)', inkDanger: '#B3402A', undo: '#BC5524',
    dots: '#3A362B', danger: '#E07A5F', dangerB: 'rgba(224,122,95,0.4)',
    sh1: 'rgba(0,0,0,0.45)', sh2: 'rgba(0,0,0,0.7)', sb: '#3B372C',
  },
}

/** Build the `--token` CSS variable bag for an inline style attribute. */
export function themeVars(dark: boolean): CSSProperties {
  const t = THEMES[dark ? 'dark' : 'light']
  const vars: Record<string, string> = {}
  for (const [key, value] of Object.entries(t)) vars[`--${key}`] = value
  return vars as CSSProperties
}

const STORAGE_KEY = 'assetboss-dark'

function readStoredDark(): boolean {
  try {
    return localStorage.getItem(STORAGE_KEY) === '1'
  } catch {
    return false
  }
}

export function useTheme() {
  const [dark, setDark] = useState(readStoredDark)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, dark ? '1' : '0')
    } catch {
      // приватный режим / нет доступа — переключатель всё равно работает в рамках сессии
    }
  }, [dark])

  const toggle = useCallback(() => setDark((d) => !d), [])
  return { dark, setDark, toggle }
}
