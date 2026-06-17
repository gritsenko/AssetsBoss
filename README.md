# AssetsBoss

Лёгкий браузер локальных игровых ассетов: подключаемые папки-источники, SQLite-индекс
с полнотекстовым поиском (FTS5), кэш миниатюр, аудио-превью. Бекенд — ASP.NET Core
(.NET 10), фронтенд — React 19 + Vite + Tailwind 4, релизная обёртка — Photino.NET.

<img width="2008" height="1432" alt="image" src="https://github.com/user-attachments/assets/c8af6b25-d19f-4e30-928f-7ba4efcff33e" />

## Архитектура

Один и тот же Kestrel (только `127.0.0.1`) обслуживает API в dev и release:

- **dev** — два процесса: `dotnet watch` (API, порт 5210) + Vite (UI, порт 5173, прокси `/api` → 5210);
- **release** — Photino-окно открывает `http://127.0.0.1:{случайный порт}`, Kestrel дополнительно отдаёт фронтенд, встроенный в сборку (`ManifestEmbeddedFileProvider`), — отдельной папки `wwwroot` на диске нет.

```
src/AssetsBoss.Core                 домен, IAssetProvider, SQLite-индекс, сканер, миниатюры
src/AssetsBoss.Plugins.Abstractions контракт провайдер-плагинов (IProviderPlugin)
src/AssetsBoss.Server               minimal API (dev-вход + библиотека для Desktop) + загрузчик плагинов
src/AssetsBoss.Desktop              Photino-хост (release)
src/AssetsBoss.Core.Tests
frontend/                           Vite + React + TS + Tailwind
```

Данные в рантайме: `%LOCALAPPDATA%\AssetsBoss\` — `assetsboss.db`, `thumbs\`, `logs\`.

## Разработка

Два терминала:

```powershell
dotnet watch --project src/AssetsBoss.Server    # hot reload C#
cd frontend; npm run dev                         # Vite HMR → http://localhost:5173
```

- API-обозреватель (Scalar): http://127.0.0.1:5210/scalar/v1
- Дебаггер VS Code: compound «Full Stack» (Server + Edge)
- Тесты: `dotnet test`

## Сборка релиза

Упаковка в портативные single-file `.exe` под обе архитектуры — одним скриптом:

```powershell
pwsh tools/package.ps1                 # win-arm64 + win-x64
pwsh tools/package.ps1 -Rids win-x64   # только нужная арка
```

Скрипт собирает фронтенд один раз (`npm run build`), затем делает self-contained
single-file publish под каждый RID и кладёт zip в `dist\`. Результат — **один**
`AssetsBoss.exe`: внутрь упакованы рантайм .NET, managed-DLL, нативные DLL Photino,
иконка и весь фронтенд (встроен как `EmbeddedResource` glob'ом по `frontend\dist` —
новые файлы фронтенда подхватываются автоматически, ручной список не нужен).
Комплект `AssetsBoss-<версия>-<rid>.zip` = единственный `AssetsBoss.exe`.

Распаковал → запустил `AssetsBoss.exe`, установка не нужна (нужен лишь WebView2
Runtime — на Windows 11 предустановлен). Версия/продукт берутся из `<Version>` в
`AssetsBoss.Desktop.csproj`.

> **Архитектура.** Машина разработки — `win-arm64` (см. `dotnet --info`). x64-сборка
> работает на любых Windows-ПК (на ARM64 — через эмуляцию), arm64-сборка нативна,
> но не запустится на обычных x64-ПК.
>
> **node.** Скрипт принудительно берёт системный node (`%ProgramFiles%\nodejs`):
> менеджер версий в профиле (fnm) может подставить node другой архитектуры, чем
> установленные нативные биндинги сборщика (rolldown), и `npm run build` падает на
> загрузке `.node` не той арки.

Ручной publish без скрипта (фронтенд нужно собрать заранее — `npm run build` в
`frontend`, иначе встраивать будет нечего и publish упадёт с ошибкой об отсутствии
`dist`):

```powershell
npm --prefix frontend run build
dotnet publish src/AssetsBoss.Desktop -c Release -r win-arm64 --self-contained -o publish/win-arm64
```

Иконку (`src/AssetsBoss.Desktop/app.ico`) при изменении логотипа пересобрать из
`frontend/public/favicon.svg` скриптом `tools/gen-icon.mjs` (нужны `@resvg/resvg-js`,
ставятся во временную папку — см. комментарий в скрипте).

## Расширение

- **Новый провайдер** (облако и т.п.): реализовать `IAssetProvider`; сканер и API не меняются,
  провайдер без `Caps.Watch` ресканится по кнопке. Встроенный провайдер регистрируется в DI
  (`ServerHost.cs`); внешний поставляется отдельной сборкой через контракт `IProviderPlugin`
  и подхватывается в рантайме — см. [docs/plugins.md](docs/plugins.md).
- **3D-превью**: `/api/assets/{id}/content` уже отдаёт байты — добавить three.js-вьюер
  в `DetailPanel`.
- **Теги**: таблицы `tags`/`asset_tags` уже в схеме, нужен только UI и пара эндпоинтов.

## Лицензии зависимостей

SixLabors.ImageSharp 3.1.x — Split License (бесплатно для личного/OSS использования).
ImageSharp 4.x требует коммерческий ключ уже на этапе сборки — не обновлять без него;
запасной вариант — SkiaSharp, замена локализована в `ThumbnailService`.
