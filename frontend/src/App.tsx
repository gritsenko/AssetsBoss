import { useQuery } from '@tanstack/react-query'
import { useMemo, useState } from 'react'
import { api } from './api/client'
import type { Asset, AssetKind, AssetQueryParams, Source } from './api/types'
import { AssetGrid } from './components/AssetGrid'
import { DetailPanel } from './components/DetailPanel'
import { FolderTree } from './components/FolderTree'
import { ScanStatusBar } from './components/ScanStatusBar'
import { SearchBar } from './components/SearchBar'
import { SourcesPanel } from './components/SourcesPanel'
import { TypeFilter } from './components/TypeFilter'
import { useDebounce } from './hooks/useDebounce'
import { useScanStatus } from './hooks/useScanStatus'

export default function App() {
  const [source, setSource] = useState<Source | null>(null)
  const [dir, setDir] = useState<string>('')
  const [recursive, setRecursive] = useState(true)
  const [kind, setKind] = useState<AssetKind | null>(null)
  const [search, setSearch] = useState('')
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null)

  const debouncedSearch = useDebounce(search, 250)

  const { data: scanStatuses } = useScanStatus()
  const { data: sources } = useQuery({ queryKey: ['sources'], queryFn: api.getSources })

  const params: AssetQueryParams = useMemo(
    () => ({
      sourceId: source?.id,
      dir: source ? dir : undefined,
      // поиск всегда рекурсивный по выбранному поддереву
      recursive: recursive || debouncedSearch.length > 0,
      kind: kind ?? undefined,
      q: debouncedSearch || undefined,
    }),
    [source, dir, recursive, kind, debouncedSearch],
  )

  return (
    <div className="flex h-full flex-col bg-zinc-950 text-zinc-100">
      <div className="flex min-h-0 flex-1">
        {/* левый сайдбар */}
        <aside className="flex w-64 shrink-0 flex-col border-r border-zinc-800 bg-zinc-900">
          <div className="border-b border-zinc-800 px-3 py-2">
            <h1 className="text-sm font-bold tracking-wide text-zinc-100">🗂️ AssetsBoss</h1>
          </div>
          <SourcesPanel
            selectedId={source?.id ?? null}
            onSelect={(s) => {
              setSource(s)
              setDir('')
              setSelectedAsset(null)
            }}
          />
          {source && (
            <FolderTree
              sourceId={source.id}
              selectedDir={dir}
              onSelect={(d) => {
                setDir(d)
                setSelectedAsset(null)
              }}
            />
          )}
        </aside>

        {/* центральная часть */}
        <main className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-center gap-3 border-b border-zinc-800 px-3 py-2">
            <SearchBar value={search} onChange={setSearch} />
            <TypeFilter value={kind} onChange={setKind} />
            <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-sm text-zinc-400">
              <input
                type="checkbox"
                checked={recursive || debouncedSearch.length > 0}
                disabled={debouncedSearch.length > 0}
                onChange={(e) => setRecursive(e.target.checked)}
                className="accent-blue-600"
              />
              с подпапками
            </label>
          </div>
          <div className="min-h-0 flex-1">
            <AssetGrid params={params} selectedAsset={selectedAsset} onSelect={setSelectedAsset} />
          </div>
        </main>

        {selectedAsset && (
          <DetailPanel asset={selectedAsset} onClose={() => setSelectedAsset(null)} />
        )}
      </div>

      <ScanStatusBar statuses={scanStatuses} sources={sources} />
    </div>
  )
}
