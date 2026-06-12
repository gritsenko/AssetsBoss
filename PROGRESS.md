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

### M3.5 — группировка анимаций ✅ (2026-06-13)
- Схема v2 (`Data/Migration2.sql`): `assets.anim_group / anim_clip / anim_frame` + частичный индекс.
- `AnimationDetector`: кадр = имя с числовым суффиксом; клип = ≥3 кадров с плотной нумерацией (отсекает grass_512/1024/2048); персонаж = клипы, отличающиеся одним токеном (позиция выбирается голосованием по каталогу): `01_attack_sword` + `01_die_sword` → `01_*_sword`. `AnimationIndexer` — пересчёт после каждого скана (внутри `IndexScanner.ScanAsync`), пишутся только изменившиеся строки.
- API: `/assets?grouped=true` — GROUP BY с обложкой-первым кадром (правило bare columns SQLite c единственным MIN-агрегатом), счётчики frameCount/clipCount; `/assets/group?sourceId&dir&name` — клипы с кадрами.
- UI: модель `Entry` (asset/group/clip/frame, `lib/anim.ts`), раскрытие Unity-style на месте в сетке и списке, выделение по строковым ключам; плеер (клипы-чипы, скраббер, play/pause, 8/12/24 fps, предзагрузка кадров) в DetailPanel и Lightbox (`useFramePlayer`, `AnimPlayer.tsx`); клавиши лайтбокса: Space — play, ←/→ — кадры, ↑/↓ — клипы. Тоггл группировки в тулбаре (persisted, по умолчанию вкл).
- **Проверено вживую:** 187 650 ассетов → 70 099 строк; Murlyko/animations (135 кадров) → 3 группы по 4 клипа; плеер играет, кадр выбора открывается на своей позиции.
- **Грабли:** Dapper не кастует `MIN(anim_frame)` (Int64 без decltype, первая строка NULL) в `int?` → `Asset.AnimFrame` сделан `long?`; StrictMode дважды гоняет эффекты → сброс кадра в `useFramePlayer` через сравнение identity массива, не через first-ref флаг.
- Производительность grouped-страницы на 187k: ~0.5–0.7 с (ungrouped 0.09 с) — при необходимости ускорять вычисляемым ключом группы + индексом.
- Hover-превью: при наведении на карточку/строку группы или клипа кадры зацикленно проигрываются прямо в миниатюре с 20 fps (`useHoverAnim`, состав группы лениво грузится через `useAnimGroup` при первом наведении, кадры предзагружаются); клип гоняет только свои кадры, группа — все клипы подряд. Бейджи без текста: группа — кастомная `AnimIcon` (рамка с плеем), клип — `ClipIcon` (плей в стопке кадров), в гриде и списке. Попутно `AssetThumb.failed` привязан к id ассета (битый кадр не залипает на карточке).
- Доработки по фидбеку: цветная полоса-фон под раскрытой группой и её детьми (сегменты по рядам сетки смыкаются по вертикали, есть и в списке); шевроны ▸ свернуто / ▾ раскрыто; вертикальные отступы сетки (GAP 16, высота подписи 54); компактный режим миниатюр — слайдер до 64 px, ниже порога 120 px подписи/бейджи скрываются, в тулбаре кнопка-тоггл (прыгает 88 ↔ последний обычный размер).

### Тесты ✅
- xUnit, **54 passed**: ext→kind, FTS-санитизация (кавычки/минусы/звёздочки/юникод), ключ миниатюр (регистр/слэши), diff сканера (add/update/remove, case-rename, dirs+FTS-синхронизация), детектор анимаций (разбор суффиксов, кластеризация, разреженные номера) и grouped-запрос (схлопывание, обложка, деградация клипа при удалении кадров).

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
