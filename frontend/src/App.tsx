import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Cube,
  FilmStrip,
  FolderPlus,
  GearSix,
  Image as ImageIcon,
  Moon,
  Rows,
  Stack,
  Waveform,
} from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api/client'
import type { Asset, AssetQueryParams } from './api/types'
import { CommandPalette, type PaletteCommand } from './components/CommandPalette'
import { DetailPanel } from './components/DetailPanel'
import { FilterChips } from './components/FilterChips'
import { FolderCards } from './components/FolderCards'
import { Lightbox } from './components/Lightbox'
import { ResultMeta } from './components/ResultMeta'
import { ResultsArea } from './components/ResultsArea'
import { Sidebar } from './components/Sidebar'
import { SettingsModal } from './components/SettingsModal'
import { StatusBar } from './components/StatusBar'
import { TitleBar } from './components/TitleBar'
import { Toolbar, type ViewMode } from './components/Toolbar'
import { useToast } from './hooks/toastContext'
import { useAssets } from './hooks/useAssets'
import { useDebounce } from './hooks/useDebounce'
import { useKindCounts } from './hooks/useKindCounts'
import { usePersistedState } from './hooks/usePersistedState'
import { useScanStatus } from './hooks/useScanStatus'
import { type DisplayKind, KIND_META } from './lib/kind'
import { themeVars, useTheme } from './theme'

export default function App() {
  const showToast = useToast()
  const queryClient = useQueryClient()
  const { dark, setDark, toggle: toggleTheme } = useTheme()

  // постоянные настройки
  const [view, setView] = usePersistedState<ViewMode>('assetboss-view', 'grid')
  const [thumbMin, setThumbMin] = usePersistedState('assetboss-thumb', 216)
  const [showExt, setShowExt] = usePersistedState('assetboss-showext', true)
  const [panelOpen, setPanelOpen] = usePersistedState('assetboss-panel', true)

  // фильтры / навигация
  const [activeSourceId, setActiveSourceId] = useState<number | undefined>(undefined)
  const [dir, setDir] = useState('')
  const [kind, setKind] = useState<DisplayKind | null>(null)
  const [query, setQuery] = useState('')
  const debouncedSearch = useDebounce(query.trim(), 250)

  // выделение / детали / оверлеи
  const [selected, setSelected] = useState<Set<number>>(() => new Set())
  const [anchorId, setAnchorId] = useState<number | null>(null) // якорь для shift-выделения
  const [primaryId, setPrimaryId] = useState<number | null>(null) // активный ассет в панели деталей
  const [lightboxId, setLightboxId] = useState<number | null>(null) // полноэкранный просмотр
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  const columnsRef = useRef(1)

  const { data: sources } = useQuery({ queryKey: ['sources'], queryFn: api.getSources })
  const { data: scanStatuses } = useScanStatus()
  const counts = useKindCounts(activeSourceId)

  const serverKind = kind ? KIND_META[kind].serverKind : null
  const clientFilter = kind ? KIND_META[kind].clientFilter : undefined

  const params: AssetQueryParams = useMemo(
    () => ({
      sourceId: activeSourceId,
      dir: activeSourceId !== undefined ? dir : undefined,
      recursive: true,
      kind: serverKind ?? undefined,
      q: debouncedSearch || undefined,
    }),
    [activeSourceId, dir, serverKind, debouncedSearch],
  )

  const assetsQuery = useAssets(params)
  const flat = useMemo(
    () => assetsQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [assetsQuery.data],
  )
  const items = useMemo(() => (clientFilter ? flat.filter(clientFilter) : flat), [flat, clientFilter])
  const serverTotal = assetsQuery.data?.pages[0]?.total ?? 0
  const total = clientFilter ? items.length : serverTotal

  // ---------- выделение ----------
  const clearSelection = useCallback(() => {
    setSelected(new Set())
    setPrimaryId(null)
    setAnchorId(null)
  }, [])

  /** Одиночное выделение + установка активного ассета (показываем его в панели). */
  const selectOnly = useCallback((id: number) => {
    setSelected(new Set([id]))
    setAnchorId(id)
    setPrimaryId(id)
  }, [])

  /** Клик по ассету: plain — один, Ctrl/Cmd — переключить, Shift — диапазон от якоря. */
  const handleSelect = useCallback(
    (asset: Asset, e: React.MouseEvent) => {
      e.stopPropagation() // не даём клику всплыть до фона (он сбрасывает выделение)
      const id = asset.id
      if (e.shiftKey && anchorId !== null) {
        const ids = items.map((a) => a.id)
        const a = ids.indexOf(anchorId)
        const b = ids.indexOf(id)
        if (a !== -1 && b !== -1) {
          const [lo, hi] = a <= b ? [a, b] : [b, a]
          setSelected(new Set(ids.slice(lo, hi + 1)))
          setPrimaryId(id)
        } else {
          selectOnly(id)
        }
      } else if (e.metaKey || e.ctrlKey) {
        setSelected((prev) => {
          const next = new Set(prev)
          if (next.has(id)) next.delete(id)
          else next.add(id)
          return next
        })
        setAnchorId(id)
        setPrimaryId(id)
      } else {
        selectOnly(id)
      }
    },
    [items, anchorId, selectOnly],
  )

  /** Двойной клик: полноэкранный просмотр. */
  const openLightbox = useCallback(
    (asset: Asset) => {
      selectOnly(asset.id)
      setLightboxId(asset.id)
    },
    [selectOnly],
  )

  // ---------- навигация / фильтры ----------
  const selectKind = useCallback(
    (next: DisplayKind | null) => {
      setKind(next)
      setDir('') // выбор раздела Library сбрасывает папку (как в дизайне)
      clearSelection()
    },
    [clearSelection],
  )

  const selectDir = useCallback(
    (next: string) => {
      setDir(next)
      setKind(null)
      setQuery('')
      clearSelection()
    },
    [clearSelection],
  )

  /** Перейти в папку ассета (показать его «соседей»), сохранив его выделенным. */
  const goToFolder = useCallback((asset: Asset) => {
    setActiveSourceId(asset.sourceId)
    setDir(asset.parentDir)
    setKind(null)
    setQuery('')
    setLightboxId(null)
    setSelected(new Set([asset.id]))
    setAnchorId(asset.id)
    setPrimaryId(asset.id)
  }, [])

  const selectSource = useCallback(
    (id: number | undefined) => {
      setActiveSourceId(id)
      setDir('')
      setKind(null)
      setQuery('')
      clearSelection()
      setLightboxId(null)
    },
    [clearSelection],
  )

  const clearFilters = useCallback(() => {
    setKind(null)
    setDir('')
    setQuery('')
    clearSelection()
  }, [clearSelection])

  // ---------- источники ----------
  const addMutation = useMutation({
    mutationFn: (path: string) => api.addSource('', path),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] })
      queryClient.invalidateQueries({ queryKey: ['scan-status'] })
      queryClient.invalidateQueries({ queryKey: ['count'] })
    },
  })
  const addSource = useCallback(
    async (path: string): Promise<string | null> => {
      try {
        await addMutation.mutateAsync(path)
        showToast('Folder added — indexing started')
        return null
      } catch (e) {
        return (e as Error).message
      }
    },
    [addMutation, showToast],
  )

  const deleteMutation = useMutation({
    mutationFn: api.deleteSource,
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['sources'] })
      queryClient.invalidateQueries({ queryKey: ['assets'] })
      queryClient.invalidateQueries({ queryKey: ['dirs'] })
      queryClient.invalidateQueries({ queryKey: ['count'] })
      if (activeSourceId === id) selectSource(undefined)
      showToast('Source removed from index')
    },
  })

  const scanMutation = useMutation({
    mutationFn: api.triggerScan,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['scan-status'] })
      showToast('Rescan queued')
    },
  })

  // ---------- клавиатура ----------
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null
      const inInput = target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA'

      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen((o) => !o)
        return
      }
      if (paletteOpen) return // палитра обрабатывает стрелки/Enter/Esc сама

      if (e.key === 'Escape') {
        if (settingsOpen) setSettingsOpen(false)
        else if (lightboxId !== null) setLightboxId(null)
        else if (selected.size > 0) clearSelection()
        if (inInput) target?.blur()
        return
      }
      if (inInput) return

      // полноэкранный просмотр открыт — стрелки листают соседние ассеты
      if (lightboxId !== null) {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault()
          const idx = items.findIndex((a) => a.id === lightboxId)
          if (idx !== -1) {
            const ni =
              e.key === 'ArrowRight'
                ? Math.min(items.length - 1, idx + 1)
                : Math.max(0, idx - 1)
            const asset = items[ni]
            setLightboxId(asset.id)
            selectOnly(asset.id)
          }
        }
        return
      }

      if (!items.length) return

      const ids = items.map((a) => a.id)
      if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault()
        const cols = view === 'grid' ? Math.max(1, columnsRef.current) : 1
        const cur = ids.indexOf(primaryId ?? -1)
        let next = cur
        if (cur === -1) next = 0
        else if (e.key === 'ArrowRight') next = cur + 1
        else if (e.key === 'ArrowLeft') next = cur - 1
        else if (e.key === 'ArrowDown') next = cur + cols
        else if (e.key === 'ArrowUp') next = cur - cols
        next = Math.max(0, Math.min(ids.length - 1, next))
        selectOnly(items[next].id)
      } else if (e.key === 'Enter' && primaryId !== null) {
        e.preventDefault()
        const asset = items.find((a) => a.id === primaryId)
        if (asset) setLightboxId(asset.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paletteOpen, settingsOpen, lightboxId, selected, primaryId, items, view, clearSelection, selectOnly])

  // ---------- производные значения ----------
  const activeSource = sources?.find((s) => s.id === activeSourceId)
  const primaryAsset = useMemo(
    () => (primaryId !== null ? items.find((a) => a.id === primaryId) ?? null : null),
    [items, primaryId],
  )
  const panelSourceRoot = sources?.find((s) => s.id === primaryAsset?.sourceId)?.root

  const lightboxIndex = useMemo(
    () => (lightboxId !== null ? items.findIndex((a) => a.id === lightboxId) : -1),
    [items, lightboxId],
  )
  const lightboxAsset = lightboxIndex >= 0 ? items[lightboxIndex] : null

  const scanning = scanStatuses?.find(
    (s) =>
      (s.state === 'running' || s.state === 'queued') &&
      (activeSourceId === undefined || s.sourceId === activeSourceId),
  )

  const leftText = scanning
    ? `Indexing… ${scanning.seen.toLocaleString()} files`
    : selected.size > 1
      ? `${selected.size} selected`
      : counts.all === undefined
        ? '…'
        : `${total.toLocaleString()} of ${counts.all.toLocaleString()} assets`

  const sourcePath = activeSource
    ? activeSource.root
    : sources && sources.length > 0
      ? 'All sources'
      : 'No folders added'

  const showFolderCards = activeSourceId !== undefined && !debouncedSearch && kind === null

  const commands: PaletteCommand[] = useMemo(
    () => [
      { id: 'all', icon: <Stack size={16} />, label: 'Go to All assets', hint: 'view', run: () => selectKind(null) },
      { id: 'img', icon: <ImageIcon size={16} />, label: 'Show images', hint: 'filter', run: () => selectKind('image') },
      { id: 'vid', icon: <FilmStrip size={16} />, label: 'Show video', hint: 'filter', run: () => selectKind('video') },
      { id: 'mdl', icon: <Cube size={16} />, label: 'Show 3D models', hint: 'filter', run: () => selectKind('model') },
      { id: 'aud', icon: <Waveform size={16} />, label: 'Show audio', hint: 'filter', run: () => selectKind('audio') },
      {
        id: 'view',
        icon: <Rows size={16} />,
        label: 'Toggle list view',
        hint: 'view',
        run: () => setView((v) => (v === 'grid' ? 'list' : 'grid')),
      },
      { id: 'theme', icon: <Moon size={16} />, label: 'Toggle dark theme', hint: 'view', run: toggleTheme },
      { id: 'settings', icon: <GearSix size={16} />, label: 'Open settings', hint: 'action', run: () => setSettingsOpen(true) },
      { id: 'add', icon: <FolderPlus size={16} />, label: 'Add folder…', hint: 'action', run: () => setSettingsOpen(true) },
    ],
    [selectKind, setView, toggleTheme],
  )

  return (
    <div
      style={{
        height: '100vh',
        display: 'flex',
        flexDirection: 'column',
        fontFamily: 'var(--font-sans)',
        color: 'var(--ink)',
        background: 'var(--bg)',
        userSelect: 'none',
        transition: 'background 0.25s ease, color 0.25s ease',
        ...themeVars(dark),
      }}
    >
      <TitleBar
        dark={dark}
        onToggleTheme={toggleTheme}
        onOpenPalette={() => setPaletteOpen(true)}
        onOpenSettings={() => setSettingsOpen(true)}
        onAddFolder={() => setSettingsOpen(true)}
      />

      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <Sidebar
          activeKind={kind}
          folderActive={activeSourceId !== undefined && dir !== ''}
          onSelectKind={selectKind}
          counts={counts}
          sources={sources}
          activeSourceId={activeSourceId}
          onSelectSource={selectSource}
          onRescanSource={(id) => scanMutation.mutate(id)}
          onRemoveSource={(id) => deleteMutation.mutate(id)}
          activeDir={dir}
          onSelectDir={selectDir}
        />

        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          <Toolbar
            query={query}
            onQueryChange={setQuery}
            view={view}
            onViewChange={setView}
            panelOpen={panelOpen}
            onTogglePanel={() => setPanelOpen((o) => !o)}
          />
          <FilterChips activeKind={kind} onSelectKind={selectKind} />
          <ResultMeta
            dir={dir}
            hasSourceScope={activeSourceId !== undefined}
            onNavigate={selectDir}
            count={total}
            approxNote={clientFilter ? 'filtered on device' : null}
          />
          <ResultsArea
            items={items}
            total={total}
            hasMore={assetsQuery.hasNextPage}
            isLoading={assetsQuery.isLoading}
            isLoadingMore={assetsQuery.isFetchingNextPage}
            loadMore={() => assetsQuery.fetchNextPage()}
            view={view}
            thumbMin={thumbMin}
            showExt={showExt}
            dark={dark}
            selectedIds={selected}
            onSelect={handleSelect}
            onOpen={openLightbox}
            onGoToFolder={goToFolder}
            onBackgroundClick={clearSelection}
            onClearFilters={clearFilters}
            onColumns={(n) => {
              columnsRef.current = n
            }}
            folders={
              showFolderCards && activeSourceId !== undefined ? (
                <FolderCards sourceId={activeSourceId} dir={dir} onOpenFolder={selectDir} />
              ) : undefined
            }
          />
          <StatusBar
            leftText={leftText}
            view={view}
            thumbMin={thumbMin}
            onThumbMin={setThumbMin}
            sourcePath={sourcePath}
          />
        </div>

        {panelOpen && (
          <DetailPanel
            asset={primaryAsset}
            sourceRoot={panelSourceRoot}
            dark={dark}
            selectedCount={selected.size}
            onClose={() => setPanelOpen(false)}
            onOpenFullscreen={(asset) => setLightboxId(asset.id)}
            onGoToFolder={goToFolder}
          />
        )}
      </div>

      {lightboxAsset && (
        <Lightbox
          key={lightboxAsset.id}
          asset={lightboxAsset}
          hasPrev={lightboxIndex > 0}
          hasNext={lightboxIndex >= 0 && lightboxIndex < items.length - 1}
          onPrev={() => {
            const a = items[lightboxIndex - 1]
            if (a) {
              setLightboxId(a.id)
              selectOnly(a.id)
            }
          }}
          onNext={() => {
            const a = items[lightboxIndex + 1]
            if (a) {
              setLightboxId(a.id)
              selectOnly(a.id)
            }
          }}
          dark={dark}
          onClose={() => setLightboxId(null)}
          onGoToFolder={goToFolder}
        />
      )}

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={commands}
        sourceId={activeSourceId}
        onOpenAsset={openLightbox}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        dark={dark}
        setDark={setDark}
        thumbMin={thumbMin}
        setThumbMin={setThumbMin}
        showExt={showExt}
        setShowExt={setShowExt}
        sources={sources}
        addSource={addSource}
        removeSource={(id: number) => deleteMutation.mutate(id)}
      />
    </div>
  )
}
