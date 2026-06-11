# AssetsBoss — статус реализации

Дата фиксации: 2026-06-12. План: `C:\Users\igor\.claude\plans\sequential-cooking-clarke.md`.

## Сделано и проверено вживую

### M0 — каркас ✅
- `AssetsBoss.slnx` + 4 проекта на net10.0 (Core / Server / Desktop / Core.Tests), `Directory.Build.props`.
- Vite 8 + React 19 + TS + Tailwind 4, прокси `/api` → 5210, `/api/health` отвечает.
- `.vscode/launch.json` (compound Server + Edge), `tasks.json`, `.gitignore`, `README.md`.

### M1 — индекс и навигация ✅
- Схема SQLite (`Data/Schema.sql`): sources / assets / dirs / FTS5 + триггеры / tags(+asset_tags, схема на будущее). Миграции через `PRAGMA user_version` в `Db.cs`.
- `IAssetProvider` + `LocalFolderProvider` (свой DFS-обход с try-catch на каталог, FileSystemWatcher → «грязный флаг»), `ProviderRegistry`.
- `IndexScanner` (diff new/changed/missing, батчи по 5000, инкрементальная сборка `dirs`), `ScanService` (очередь + статусы), `WatcherService` (дебаунс 2 с → rescan).
- API: sources CRUD + scan, `/scan/status`, `/sources/{id}/dirs`, `/assets` (пагинация + total).
- **Проверено:** скан `C:\GameDevAssets` (187 650 файлов) за **14 с**; дерево папок и навигация мгновенные.

### M2 — миниатюры ✅
- `ThumbnailService` (ImageSharp **3.1.12** — 4.x требует платный ключ на сборке; WebP, семафор, нормализованный SHA1-ключ, atomic write), `/assets/{id}/thumb`.
- **Проверено:** генерация ~160 мс, cache hit **6 мс**, conditional GET → **304**, `Cache-Control: immutable`. Сетка с `@tanstack/react-virtual` скроллит 187k без фризов.

### M3 — поиск, фильтры, аудио, watcher ✅
- FTS5-поиск с санитизацией ввода (debounce 250 мс), фильтр по типу, рекурсивный режим.
- `DetailPanel`: `<img>` для картинок, `<audio controls>` для аудио, заглушка для 3D.
- `/assets/{id}/content` с `enableRangeProcessing` (Range → **HTTP 206**).
- **Проверено:** поиск «sword» — total за **96 мс**; аудио играет, перемотка работает; добавленный файл индексируется за ~10 с, удалённый исчезает за ~4 с.

### Тесты ✅
- xUnit, **39 passed**: ext→kind, FTS-санитизация (кавычки/минусы/звёздочки/юникод), ключ миниатюр (регистр/слэши), diff сканера (add/update/remove, case-rename, dirs+FTS-синхронизация).

## Осталось доделать

### M4 — Photino-упаковка 🔧 (в процессе, прерван последний publish)
- Код готов: `Desktop/Program.cs` (Kestrel на `127.0.0.1:0` + Photino-окно, MessageBox при отсутствии WebView2), MSBuild-таргет `BuildFrontend` в `AssetsBoss.Desktop.csproj`.
- **Грабли, на которые наступили:** `npm ci` сносит `node_modules` и падает с `EPERM`, пока запущен Vite dev-сервер → таргет переписан на `npm ci` только при отсутствии `node_modules`. Также `node_modules` повреждался (пропадал `tsc`) — лечится `npm install`.
- **Что доделать:**
  1. Прогнать `dotnet publish src/AssetsBoss.Desktop -c Release -r win-x64 --self-contained true -o publish` (желательно при остановленном Vite).
  2. Убедиться, что в `publish/` есть `AssetsBoss.exe` и `wwwroot/index.html`.
  3. Запустить exe из чистого каталога, проверить открытие окна и работу без dev-серверов (финальная верификация из плана).

### Post-MVP (заложено архитектурой, не делалось)
- three.js-вьюер для 3D (контент уже отдаётся через `/content`).
- PSD-декодер в `ThumbnailService` (сейчас PSD/SVG показываются иконкой-заглушкой).
- UI тегов (таблицы `tags`/`asset_tags` уже в схеме).
- Cloud-провайдер (новая реализация `IAssetProvider`).
- Фоновая прегенерация миниатюр; SSE вместо polling для статуса скана.

## Замечания по окружению
- ImageSharp зафиксирован на 3.1.x — **не обновлять до 4.x** без коммерческого ключа Six Labors (иначе сборка падает). Запасной вариант — SkiaSharp, замена локализована в `ThumbnailService`.
- Dev-серверы на момент фиксации запущены в фоне (порт 5210 — backend, 5173 — Vite). Перед `npm ci`/publish их лучше останавливать.
