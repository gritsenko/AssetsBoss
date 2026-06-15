import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Cube,
  FilmReel,
  FilmStrip,
  FolderPlus,
  GearSix,
  Image as ImageIcon,
  Moon,
  Rows,
  Stack,
  TreeStructure,
  Waveform,
} from '@phosphor-icons/react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api } from './api/client'
import type {
  AnimGroupDetail,
  Asset,
  AssetQueryParams,
  GroupRef,
  ModelGroupDetail,
  ModelGroupRef,
} from './api/types'
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
import { assetEntry, buildEntries, type Entry, isAnimEntry } from './lib/anim'
import { type DisplayKind, KIND_META } from './lib/kind'
import { themeVars, useTheme } from './theme'

/** Ниже этого размера миниатюр сетка переходит в компактный режим без подписей. */
const COMPACT_THRESHOLD = 120
const COMPACT_SIZE = 88

export default function App() {
  const showToast = useToast()
  const queryClient = useQueryClient()
  const { dark, setDark, toggle: toggleTheme } = useTheme()

  // постоянные настройки
  const [view, setView] = usePersistedState<ViewMode>('assetboss-view', 'grid')
  const [thumbMin, setThumbMin] = usePersistedState('assetboss-thumb', 216)
  const [showExt, setShowExt] = usePersistedState('assetboss-showext', true)
  const [panelOpen, setPanelOpen] = usePersistedState('assetboss-panel', true)
  const [groupAnims, setGroupAnims] = usePersistedState('assetboss-groupanims', true)
  // включать ли ассеты из подпапок; off — только прямое содержимое выбранной папки
  const [recursive, setRecursive] = usePersistedState('assetboss-recursive', true)

  // Три взаимоисключающих режима выдачи: icons | grid | list. icons и grid — одна
  // и та же сетка миниатюр, разница лишь в подписях и регулируется зумом: ниже
  // порога — режим иконок (без подписей), на/выше — обычная плитка.
  const compact = view === 'icons'
  const lastRegularThumb = useRef(216)

  // Переключение режима кнопками тулбара. Держим зум согласованным с режимом:
  // в icons опускаем миниатюры под порог, в grid — поднимаем к последнему «обычному».
  const changeView = useCallback(
    (next: ViewMode) => {
      if (next === view) return
      if (next === 'icons') {
        if (thumbMin >= COMPACT_THRESHOLD) lastRegularThumb.current = thumbMin
        setThumbMin(COMPACT_SIZE)
      } else if (next === 'grid' && thumbMin < COMPACT_THRESHOLD) {
        setThumbMin(lastRegularThumb.current >= COMPACT_THRESHOLD ? lastRegularThumb.current : 216)
      }
      setView(next)
    },
    [view, thumbMin, setView, setThumbMin],
  )

  // Зум-слайдер сам переключает icons↔grid при переходе через порог (в list зум скрыт).
  const handleThumbMin = useCallback(
    (value: number) => {
      setThumbMin(value)
      setView((v) => (v === 'list' ? v : value < COMPACT_THRESHOLD ? 'icons' : 'grid'))
    },
    [setThumbMin, setView],
  )

  // На старте сверяем режим иконок/плитки с сохранённым зумом (миграция старого стейта).
  useEffect(() => {
    setView((v) => (v === 'list' ? v : thumbMin < COMPACT_THRESHOLD ? 'icons' : 'grid'))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // фильтры / навигация
  const [activeSourceId, setActiveSourceId] = useState<number | undefined>(undefined)
  const [dir, setDir] = useState('')
  const [kind, setKind] = useState<DisplayKind | null>(null)
  const [query, setQuery] = useState('')
  const debouncedSearch = useDebounce(query.trim(), 250)

  // выделение / детали / оверлеи — ключи строк выдачи (Entry.key)
  const [selected, setSelected] = useState<Set<string>>(() => new Set())
  const [anchorKey, setAnchorKey] = useState<string | null>(null) // якорь для shift-выделения
  const [primaryKey, setPrimaryKey] = useState<string | null>(null) // активная строка в панели деталей
  const [lightbox, setLightbox] = useState<Entry | null>(null) // полноэкранный просмотр
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)

  // раскрытые группы анимаций (ключ → адрес группы) и клипы
  const [expandedGroups, setExpandedGroups] = useState<Map<string, GroupRef>>(() => new Map())
  const [expandedClips, setExpandedClips] = useState<Set<string>>(() => new Set())
  // раскрытые группы 3D-моделей (ключ → адрес группы)
  const [expandedModelGroups, setExpandedModelGroups] = useState<Map<string, ModelGroupRef>>(() => new Map())

  const columnsRef = useRef(1)

  const { data: sources } = useQuery({ queryKey: ['sources'], queryFn: api.getSources })
  const { data: scanStatuses } = useScanStatus()
  const counts = useKindCounts(activeSourceId)

  const serverKind = kind ? KIND_META[kind].serverKind : null
  const serverAnimated = kind ? KIND_META[kind].serverAnimated : undefined
  const clientFilter = kind ? KIND_META[kind].clientFilter : undefined

  const params: AssetQueryParams = useMemo(
    () => ({
      sourceId: activeSourceId,
      dir: activeSourceId !== undefined ? dir : undefined,
      // off — только прямое содержимое выбранной папки, без обхода подпапок
      recursive,
      kind: serverKind ?? undefined,
      animated: serverAnimated || undefined,
      q: debouncedSearch || undefined,
      grouped: groupAnims,
    }),
    [activeSourceId, dir, recursive, serverKind, serverAnimated, debouncedSearch, groupAnims],
  )

  const assetsQuery = useAssets(params)
  const flat = useMemo(
    () => assetsQuery.data?.pages.flatMap((p) => p.items) ?? [],
    [assetsQuery.data],
  )
  const items = useMemo(() => (clientFilter ? flat.filter(clientFilter) : flat), [flat, clientFilter])
  const serverTotal = assetsQuery.data?.pages[0]?.total ?? 0
  const total = clientFilter ? items.length : serverTotal

  // детали раскрытых групп (кэшируются react-query, общие с панелью/лайтбоксом)
  const groupRefs = useMemo(() => [...expandedGroups.entries()], [expandedGroups])
  const groupDetails = useQueries({
    queries: groupRefs.map(([, ref]) => ({
      queryKey: ['animGroup', ref.sourceId, ref.dir, ref.name],
      queryFn: () => api.getAnimGroup(ref),
      staleTime: 5 * 60_000,
    })),
    combine: (results) => {
      const m = new Map<string, AnimGroupDetail | undefined>()
      groupRefs.forEach(([key], i) => m.set(key, results[i]?.data))
      return m
    },
  })

  // детали раскрытых групп моделей (варианты-форматы)
  const modelGroupRefs = useMemo(() => [...expandedModelGroups.entries()], [expandedModelGroups])
  const modelGroupDetails = useQueries({
    queries: modelGroupRefs.map(([, ref]) => ({
      queryKey: ['modelGroup', ref.sourceId, ref.dir, ref.name],
      queryFn: () => api.getModelGroup(ref),
      staleTime: 5 * 60_000,
    })),
    combine: (results) => {
      const m = new Map<string, ModelGroupDetail | undefined>()
      modelGroupRefs.forEach(([key], i) => m.set(key, results[i]?.data))
      return m
    },
  })

  const entries = useMemo(
    () => buildEntries(items, groupDetails, expandedClips, modelGroupDetails),
    [items, groupDetails, expandedClips, modelGroupDetails],
  )
  // раскрытия добавляют строки поверх серверного total (дети есть только у загруженных страниц)
  const displayTotal = total + entries.length - items.length

  // ---------- выделение ----------
  const clearSelection = useCallback(() => {
    setSelected(new Set())
    setPrimaryKey(null)
    setAnchorKey(null)
  }, [])

  /** Одиночное выделение + установка активной строки (показываем её в панели). */
  const selectOnly = useCallback((key: string) => {
    setSelected(new Set([key]))
    setAnchorKey(key)
    setPrimaryKey(key)
  }, [])

  /** Клик по строке: plain — одна, Ctrl/Cmd — переключить, Shift — диапазон от якоря. */
  const handleSelect = useCallback(
    (entry: Entry, e: React.MouseEvent) => {
      e.stopPropagation() // не даём клику всплыть до фона (он сбрасывает выделение)
      const key = entry.key
      if (e.shiftKey && anchorKey !== null) {
        const keys = entries.map((x) => x.key)
        const a = keys.indexOf(anchorKey)
        const b = keys.indexOf(key)
        if (a !== -1 && b !== -1) {
          const [lo, hi] = a <= b ? [a, b] : [b, a]
          setSelected(new Set(keys.slice(lo, hi + 1)))
          setPrimaryKey(key)
        } else {
          selectOnly(key)
        }
      } else if (e.metaKey || e.ctrlKey) {
        setSelected((prev) => {
          const next = new Set(prev)
          if (next.has(key)) next.delete(key)
          else next.add(key)
          return next
        })
        setAnchorKey(key)
        setPrimaryKey(key)
      } else {
        selectOnly(key)
      }
    },
    [entries, anchorKey, selectOnly],
  )

  /** Двойной клик / Enter: полноэкранный просмотр (для групп — плеер). */
  const openLightbox = useCallback(
    (entry: Entry) => {
      selectOnly(entry.key)
      setLightbox(entry)
    },
    [selectOnly],
  )

  /** Раскрытие группы до клипов / клипа до кадров / группы моделей до форматов (на месте). */
  const toggleExpand = useCallback((entry: Entry) => {
    if (entry.type === 'group') {
      setExpandedGroups((prev) => {
        const next = new Map(prev)
        if (next.has(entry.key)) next.delete(entry.key)
        else next.set(entry.key, entry.ref)
        return next
      })
    } else if (entry.type === 'clip') {
      setExpandedClips((prev) => {
        const next = new Set(prev)
        if (next.has(entry.key)) next.delete(entry.key)
        else next.add(entry.key)
        return next
      })
    } else if (entry.type === 'modelgroup') {
      setExpandedModelGroups((prev) => {
        const next = new Map(prev)
        if (next.has(entry.key)) next.delete(entry.key)
        else next.set(entry.key, entry.ref)
        return next
      })
    }
  }, [])

  const toggleGroupAnims = useCallback(() => {
    setGroupAnims((g) => !g)
    setExpandedGroups(new Map())
    setExpandedClips(new Set())
    setExpandedModelGroups(new Map())
    clearSelection()
  }, [setGroupAnims, clearSelection])

  // ---------- навигация / фильтры ----------
  const selectKind = useCallback(
    (next: DisplayKind | null) => {
      setKind(next)
      // фильтр по типу применяется к текущей папке, не сбрасывая её на все ассеты
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
    setLightbox(null)
    const key = `a:${asset.id}`
    setSelected(new Set([key]))
    setAnchorKey(key)
    setPrimaryKey(key)
  }, [])

  const selectSource = useCallback(
    (id: number | undefined) => {
      setActiveSourceId(id)
      setDir('')
      setKind(null)
      setQuery('')
      clearSelection()
      setLightbox(null)
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

  const renameMutation = useMutation({
    mutationFn: ({ id, name }: { id: number; name: string }) => api.renameSource(id, name),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['sources'] })
    },
  })
  const renameSource = useCallback(
    async (id: number, name: string): Promise<string | null> => {
      try {
        await renameMutation.mutateAsync({ id, name })
        showToast('Source renamed')
        return null
      } catch (e) {
        return (e as Error).message
      }
    },
    [renameMutation, showToast],
  )

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
        else if (lightbox !== null) setLightbox(null)
        else if (selected.size > 0) clearSelection()
        if (inInput) target?.blur()
        return
      }
      if (inInput) return

      // полноэкранный просмотр открыт: анимации обрабатывают клавиши сами
      // (Space/стрелки в Lightbox), для остального стрелки листают соседние строки
      if (lightbox !== null) {
        if (isAnimEntry(lightbox)) return
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault()
          const idx = entries.findIndex((x) => x.key === lightbox.key)
          if (idx !== -1) {
            const ni =
              e.key === 'ArrowRight'
                ? Math.min(entries.length - 1, idx + 1)
                : Math.max(0, idx - 1)
            openLightbox(entries[ni])
          }
        }
        return
      }

      if (!entries.length) return

      const keys = entries.map((x) => x.key)
      if (['ArrowRight', 'ArrowLeft', 'ArrowDown', 'ArrowUp'].includes(e.key)) {
        e.preventDefault()
        const cols = view !== 'list' ? Math.max(1, columnsRef.current) : 1
        const cur = keys.indexOf(primaryKey ?? '')
        let next = cur
        if (cur === -1) next = 0
        else if (e.key === 'ArrowRight') next = cur + 1
        else if (e.key === 'ArrowLeft') next = cur - 1
        else if (e.key === 'ArrowDown') next = cur + cols
        else if (e.key === 'ArrowUp') next = cur - cols
        next = Math.max(0, Math.min(keys.length - 1, next))
        selectOnly(keys[next])
      } else if (e.key === 'Enter' && primaryKey !== null) {
        e.preventDefault()
        const entry = entries.find((x) => x.key === primaryKey)
        if (entry) setLightbox(entry)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [paletteOpen, settingsOpen, lightbox, selected, primaryKey, entries, view, clearSelection, selectOnly, openLightbox])

  // ---------- производные значения ----------
  const activeSource = sources?.find((s) => s.id === activeSourceId)
  const primaryEntry = useMemo(
    () => (primaryKey !== null ? entries.find((x) => x.key === primaryKey) ?? null : null),
    [entries, primaryKey],
  )
  const panelSourceRoot = sources?.find((s) => s.id === primaryEntry?.asset.sourceId)?.root

  const lightboxIndex = useMemo(
    () => (lightbox !== null ? entries.findIndex((x) => x.key === lightbox.key) : -1),
    [entries, lightbox],
  )

  const scanning = scanStatuses?.find(
    (s) =>
      (s.state === 'running' || s.state === 'queued') &&
      (activeSourceId === undefined || s.sourceId === activeSourceId),
  )

  const scanningSourceIds = useMemo(
    () =>
      new Set(
        scanStatuses
          ?.filter((s) => s.state === 'running' || s.state === 'queued')
          .map((s) => s.sourceId),
      ),
    [scanStatuses],
  )

  const leftText = scanning
    ? `Indexing… ${scanning.seen.toLocaleString()} files${
        scanning.currentDir ? ` · ${scanning.currentDir}` : ''
      }`
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
      { id: 'anim-filter', icon: <FilmReel size={16} />, label: 'Show animations', hint: 'filter', run: () => selectKind('animation') },
      { id: 'vid', icon: <FilmStrip size={16} />, label: 'Show video', hint: 'filter', run: () => selectKind('video') },
      { id: 'mdl', icon: <Cube size={16} />, label: 'Show 3D models', hint: 'filter', run: () => selectKind('model') },
      { id: 'aud', icon: <Waveform size={16} />, label: 'Show audio', hint: 'filter', run: () => selectKind('audio') },
      {
        id: 'anim',
        icon: <FilmStrip size={16} />,
        label: 'Toggle animation grouping',
        hint: 'view',
        run: toggleGroupAnims,
      },
      {
        id: 'view',
        icon: <Rows size={16} />,
        label: 'Toggle list view',
        hint: 'view',
        run: () =>
          changeView(view === 'list' ? (thumbMin < COMPACT_THRESHOLD ? 'icons' : 'grid') : 'list'),
      },
      {
        id: 'recursive',
        icon: <TreeStructure size={16} />,
        label: 'Toggle including subfolders',
        hint: 'view',
        run: () => setRecursive((r) => !r),
      },
      { id: 'theme', icon: <Moon size={16} />, label: 'Toggle dark theme', hint: 'view', run: toggleTheme },
      { id: 'settings', icon: <GearSix size={16} />, label: 'Open settings', hint: 'action', run: () => setSettingsOpen(true) },
      { id: 'add', icon: <FolderPlus size={16} />, label: 'Add folder…', hint: 'action', run: () => setSettingsOpen(true) },
    ],
    [selectKind, changeView, view, thumbMin, setRecursive, toggleTheme, toggleGroupAnims],
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
          scanningSourceIds={scanningSourceIds}
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
            onViewChange={changeView}
            groupAnims={groupAnims}
            onToggleGroupAnims={toggleGroupAnims}
            recursive={recursive}
            onToggleRecursive={() => setRecursive((r) => !r)}
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
            entries={entries}
            displayTotal={displayTotal}
            hasMore={assetsQuery.hasNextPage}
            isLoading={assetsQuery.isLoading}
            isLoadingMore={assetsQuery.isFetchingNextPage}
            loadMore={() => assetsQuery.fetchNextPage()}
            view={view}
            thumbMin={thumbMin}
            showExt={showExt}
            compact={compact}
            dark={dark}
            selectedKeys={selected}
            onSelect={handleSelect}
            onOpen={openLightbox}
            onToggleExpand={toggleExpand}
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
            indexing={!!scanning}
            view={view}
            thumbMin={thumbMin}
            onThumbMin={handleThumbMin}
            sourcePath={sourcePath}
          />
        </div>

        {panelOpen && (
          <DetailPanel
            entry={primaryEntry}
            sourceRoot={panelSourceRoot}
            dark={dark}
            selectedCount={selected.size}
            onClose={() => setPanelOpen(false)}
            onOpenFullscreen={(entry) => setLightbox(entry)}
            onGoToFolder={goToFolder}
          />
        )}
      </div>

      {lightbox && (
        <Lightbox
          key={lightbox.key}
          entry={lightbox}
          hasPrev={lightboxIndex > 0}
          hasNext={lightboxIndex >= 0 && lightboxIndex < entries.length - 1}
          onPrev={() => {
            const x = entries[lightboxIndex - 1]
            if (x) openLightbox(x)
          }}
          onNext={() => {
            const x = entries[lightboxIndex + 1]
            if (x) openLightbox(x)
          }}
          dark={dark}
          onClose={() => setLightbox(null)}
          onGoToFolder={goToFolder}
        />
      )}

      <CommandPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        commands={commands}
        sourceId={activeSourceId}
        onOpenAsset={(asset) => openLightbox(assetEntry(asset))}
      />

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        dark={dark}
        setDark={setDark}
        thumbMin={thumbMin}
        setThumbMin={handleThumbMin}
        showExt={showExt}
        setShowExt={setShowExt}
        sources={sources}
        addSource={addSource}
        removeSource={(id: number) => deleteMutation.mutate(id)}
        renameSource={renameSource}
        showToast={showToast}
      />
    </div>
  )
}
