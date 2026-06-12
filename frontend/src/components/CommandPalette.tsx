import { useQuery } from '@tanstack/react-query'
import { MagnifyingGlass } from '@phosphor-icons/react'
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../api/client'
import type { Asset } from '../api/types'
import { ACCENT } from '../theme'
import { useDebounce } from '../hooks/useDebounce'
import { displayKind, KIND_META } from '../lib/kind'
import { Kbd } from './ui'

export interface PaletteCommand {
  id: string
  icon: ReactNode
  label: string
  hint: string
  run: () => void
}

interface PaletteItem {
  key: string
  icon: ReactNode
  label: string
  hint: string
  run: () => void
}

interface Props {
  open: boolean
  onClose: () => void
  commands: PaletteCommand[]
  sourceId: number | undefined
  onOpenAsset: (asset: Asset) => void
}

export function CommandPalette({ open, ...rest }: Props) {
  // монтируем заново на каждое открытие → состояние всегда чистое, без эффектов-сбросов
  if (!open) return null
  return <PaletteInner {...rest} />
}

function PaletteInner({ onClose, commands, sourceId, onOpenAsset }: Omit<Props, 'open'>) {
  const [query, setQuery] = useState('')
  const [idx, setIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const debounced = useDebounce(query.trim(), 200)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  const { data: assetData } = useQuery({
    queryKey: ['palette', sourceId, debounced],
    queryFn: () => api.getAssets({ sourceId, q: debounced }, 0, 6),
    enabled: debounced.length > 0,
  })

  const items = useMemo<PaletteItem[]>(() => {
    const q = query.trim().toLowerCase()
    const cmdItems: PaletteItem[] = commands
      .filter((c) => !q || c.label.toLowerCase().includes(q))
      .map((c) => ({ key: `cmd:${c.id}`, icon: c.icon, label: c.label, hint: c.hint, run: c.run }))

    const assetItems: PaletteItem[] = (debounced ? assetData?.items ?? [] : []).map((a) => {
      const Icon = KIND_META[displayKind(a)].Icon
      return {
        key: `asset:${a.id}`,
        icon: <Icon size={16} />,
        label: a.name,
        hint: a.parentDir,
        run: () => onOpenAsset(a),
      }
    })

    return [...cmdItems, ...assetItems]
  }, [commands, query, debounced, assetData, onOpenAsset])

  const activate = (item: PaletteItem) => {
    item.run()
    onClose()
  }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') return // toggle обрабатывает App
      if (e.key === 'ArrowDown') {
        e.preventDefault()
        setIdx((i) => Math.min(items.length - 1, i + 1))
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        setIdx((i) => Math.max(0, i - 1))
      } else if (e.key === 'Enter') {
        e.preventDefault()
        const item = items[idx]
        if (item) {
          item.run()
          onClose()
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        onClose()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [items, idx, onClose])

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 80 }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(15,14,12,0.45)' }} />
      <div
        className="ab-palette"
        style={{
          position: 'absolute',
          top: 88,
          left: '50%',
          transform: 'translateX(-50%)',
          width: 580,
          maxWidth: 'calc(100vw - 48px)',
          background: 'var(--panel)',
          borderRadius: 14,
          boxShadow: '0 40px 100px var(--sh2)',
          overflow: 'hidden',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            padding: '14px 16px',
            borderBottom: '1px solid var(--line)',
          }}
        >
          <MagnifyingGlass size={17} color="var(--faint)" />
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setIdx(0)
            }}
            placeholder="Search assets and commands…"
            style={{ flex: 1, border: 'none', background: 'transparent', fontSize: 15, color: 'var(--ink)' }}
          />
          <Kbd style={{ background: 'transparent', border: '1px solid var(--line2)' }}>esc</Kbd>
        </div>

        <div style={{ maxHeight: 380, overflowY: 'auto', padding: 6 }}>
          {items.length === 0 && (
            <div style={{ padding: '16px 12px', fontSize: 13, color: 'var(--muted)' }}>No matches</div>
          )}
          {items.map((item, i) => (
            <div
              key={item.key}
              onClick={() => activate(item)}
              onMouseEnter={() => setIdx(i)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 11,
                padding: '9px 12px',
                borderRadius: 8,
                cursor: 'pointer',
                background: i === idx ? 'var(--well)' : 'transparent',
              }}
            >
              <span style={{ display: 'flex', color: i === idx ? ACCENT : 'var(--muted)' }}>{item.icon}</span>
              <span
                style={{
                  flex: 1,
                  fontSize: 13.5,
                  minWidth: 0,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {item.label}
              </span>
              <span className="font-mono" style={{ fontSize: 10, color: 'var(--faint)' }}>
                {item.hint}
              </span>
            </div>
          ))}
        </div>

        <div
          className="font-mono"
          style={{ padding: '9px 16px', borderTop: '1px solid var(--line)', fontSize: 10, color: 'var(--faint)' }}
        >
          ↑↓ navigate · ↵ select · esc close
        </div>
      </div>
    </div>
  )
}
