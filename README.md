# AssetsBoss

Лёгкий браузер локальных игровых ассетов: подключаемые папки-источники, SQLite-индекс
с полнотекстовым поиском (FTS5), кэш миниатюр, аудио-превью. Бекенд — ASP.NET Core
(.NET 10), фронтенд — React 19 + Vite + Tailwind 4, релизная обёртка — Photino.NET.

<img width="2008" height="1432" alt="image" src="https://github.com/user-attachments/assets/c8af6b25-d19f-4e30-928f-7ba4efcff33e" />

## Архитектура

Один и тот же Kestrel (только `127.0.0.1`) обслуживает API в dev и release:

- **dev** — два процесса: `dotnet watch` (API, порт 5210) + Vite (UI, порт 5173, прокси `/api` → 5210);
- **release** — Photino-окно открывает `http://127.0.0.1:{случайный порт}`, Kestrel дополнительно отдаёт статику фронтенда из `wwwroot`.

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

```powershell
dotnet publish src/AssetsBoss.Desktop -c Release -r win-x64 --self-contained -o publish
```

Таргет `BuildFrontend` сам выполнит `npm ci && npm run build` и положит фронтенд в
`publish\wwwroot`. Запуск — `publish\AssetsBoss.exe` (нужен WebView2 Runtime,
на Windows 11 предустановлен).

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
