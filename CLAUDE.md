# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

AssetsBoss — a local game-asset browser. Pluggable source folders are indexed into a
SQLite database (FTS5 full-text search), with a thumbnail cache and audio/3D preview.
Backend: ASP.NET Core minimal API (.NET 10). Frontend: React 19 + Vite + Tailwind 4.
Release shell: Photino.NET (WebView2 window). Windows-only.

## Commands

Development (two terminals):

```powershell
dotnet watch --project src/AssetsBoss.Server   # C# API hot reload, http://127.0.0.1:5210
cd frontend; npm run dev                        # Vite HMR, http://localhost:5173 (proxies /api → 5210)
```

- API explorer (Scalar, dev only): http://127.0.0.1:5210/scalar/v1
- VS Code debugger: compound launch config **"Full Stack"** (Server + Edge)
- Backend tests: `dotnet test` (xUnit). Single test: `dotnet test --filter "FullyQualifiedName~AnimationDetectorTests"`
- Frontend lint: `cd frontend; npm run lint` (ESLint). Type-check is part of `npm run build` (`tsc -b`).
- There is **no** frontend test suite — all tests live in `src/AssetsBoss.Core.Tests`.

Release packaging (portable single-file `.exe`, both architectures):

```powershell
pwsh tools/package.ps1                  # win-arm64 + win-x64 → dist/*.zip
pwsh tools/package.ps1 -Rids win-x64    # one RID only
```

The script builds the frontend once (`npm run build`), then self-contained single-file
publishes per RID. **Stop the Vite dev server before packaging** — `npm ci` fails with
`EPERM` while Vite holds `node_modules`.

## Architecture

### Single Kestrel, two front doors

`ServerHost.Build(ServerOptions)` ([src/AssetsBoss.Server/ServerHost.cs](src/AssetsBoss.Server/ServerHost.cs))
is the **shared composition root** — same API and DI graph in both modes. The only
difference is who serves the frontend and on what URL:

- **dev** — `AssetsBoss.Server/Program.cs` is a 3-line entry that calls `ServerHost.Build`
  with defaults; Kestrel runs on 5210, Vite serves the UI and proxies `/api`.
- **release** — `AssetsBoss.Desktop/Program.cs` boots Kestrel on `127.0.0.1:0` (random
  loopback port), opens a Photino window at that URL, and serves the frontend from a
  `ManifestEmbeddedFileProvider` — the built frontend is embedded into the assembly as
  `EmbeddedResource` (globbed from `frontend/dist`), so **there is no `wwwroot/` on disk**.
  `MapFallback` serves `index.html` for SPA routes.

When changing startup, server config, DI registration, or routing, edit **ServerHost.cs** —
not the per-host `Program.cs` files.

### Projects

```
src/AssetsBoss.Core       domain, IAssetProvider, SQLite layer, scanner, thumbnails, animation/model grouping
src/AssetsBoss.Server     minimal-API endpoints (Api/*.cs) + ServerHost; also the dev entry point
src/AssetsBoss.Desktop    Photino release host
src/AssetsBoss.Core.Tests xUnit
frontend/                 Vite + React + TS + Tailwind
```

### Data layer

- Runtime data lives in `%LOCALAPPDATA%\AssetsBoss\`: `assetsboss.db`, `thumbs/`, `logs/`
  (see [AppPaths.cs](src/AssetsBoss.Core/AppPaths.cs)). Logging is Serilog (console + daily rolling file).
- Dapper over `Microsoft.Data.Sqlite`, WAL mode. Migrations are **numbered embedded SQL
  files** (`Schema.sql`, `Migration2.sql`, `Migration3.sql`) applied sequentially, tracked
  by `PRAGMA user_version` ([Db.cs](src/AssetsBoss.Core/Data/Db.cs)). To add a schema change:
  add a new `MigrationN.sql` as `EmbeddedResource` and append it to the `Migrations` array.
- Schema: `sources / assets / dirs / FTS5 (with sync triggers) / tags + asset_tags`.
  Animation grouping columns (`anim_group / anim_clip / anim_frame`) and 3D model grouping
  were added by later migrations.

### Indexing pipeline (Core/Indexing)

`IAssetProvider` (e.g. `LocalFolderProvider`, registered in `ProviderRegistry`) enumerates
files. `IndexScanner` diffs provider state against the DB (new/changed/missing, batched),
rebuilds the `dirs` tree, and at the end runs animation/model grouping. `ScanService` is a
serialized queue exposing scan status; `WatcherService` debounces `FileSystemWatcher` events
(~2s) into rescans. On app start, all sources are re-scanned and watchers synced.

### Animation & model grouping

`assets` rows are collapsed into clips/groups so a 135-frame sprite folder shows as a few
playable groups instead of 135 cards. Detection heuristics live in
`AnimationDetector` / `AnimationIndexer` (recomputed after every scan). The `/api/assets`
endpoint takes `grouped=true` and returns group rows; `/api/assets/group` and
`/api/assets/modelgroup` expand a group into its clips/frames or model variants. Frontend
mirrors this with the `Entry` model in [frontend/src/lib/anim.ts](frontend/src/lib/anim.ts).

### Frontend

All HTTP goes through the typed `api` object in [frontend/src/api/client.ts](frontend/src/api/client.ts);
types in `api/types.ts`. Data fetching uses `@tanstack/react-query`; the asset grid uses
`@tanstack/react-virtual` to handle 100k+ rows. 3D previews are rendered **client-side** with
three.js / `@react-three/fiber` (`lib/three/`, `ModelViewer.tsx`) — the client renders a
master thumbnail and uploads it back to the server's thumb cache (`MODEL_THUMB_REV` busts the
cache key when render code changes).

## Key constraints (do not trip over these)

- **ImageSharp pinned to 3.1.x.** 4.x requires a paid Six Labors license *at build time* —
  do not upgrade without one. Replacement path (SkiaSharp) is isolated to `ThumbnailService`.
- **No x64-only native libraries.** The dev machine is `win-arm64`; packages with native deps
  may fail. This is why 3D thumbnails render client-side rather than server-side.
- **node architecture mismatch.** A version manager (fnm) can shadow the system node with a
  different-arch binary, breaking native bindings (rolldown) during `npm run build`.
  `tools/package.ps1` forces the system node at `%ProgramFiles%\nodejs`.
- **win-arm64 vs win-x64:** the x64 build runs everywhere (emulated on ARM); the arm64 build
  is native but won't run on plain x64 PCs.

## Extending

- **New provider** (cloud, etc.): implement `IAssetProvider`, register in `ServerHost.cs`.
  Scanner and API are untouched. Providers without `Caps.Watch` are rescanned on demand.
- **Tags:** schema (`tags` / `asset_tags`) already exists; only UI and endpoints are missing.
