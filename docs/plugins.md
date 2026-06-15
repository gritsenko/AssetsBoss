# Provider plugins

AssetsBoss supports **provider plugins** — external assemblies that add new asset source kinds
(beyond the built-in local folders) without being part of this repository. A plugin contributes a
backend provider + endpoints and an optional frontend settings section. Plugins are compiled
separately and dropped next to the host; nothing about a specific plugin lives in this repo.

## Backend contract

A plugin is an assembly named `AssetsBoss.Provider.*.dll` placed next to the host binary. It
implements [`IProviderPlugin`](../src/AssetsBoss.Plugins.Abstractions/IProviderPlugin.cs):

```csharp
public interface IProviderPlugin
{
    string Id { get; }
    void ConfigureServices(IServiceCollection services); // register its IAssetProvider, services
    void MapEndpoints(IEndpointRouteBuilder api);         // map its own /api/* endpoints
}
```

On startup `PluginLoader` scans the host directory for matching assemblies, instantiates each
`IProviderPlugin`, calls `ConfigureServices` before the app is built and `MapEndpoints` on the
`/api` group afterwards. A plugin's `IAssetProvider` is picked up by `ProviderRegistry` like any
built-in provider (resolved by its `Scheme`). Plugins store private data under
`AppPaths.PluginDataDir(pluginId, key)` (`%LocalAppData%/AssetsBoss/plugins/<id>/<key>`).

Absence of plugins is normal — the app runs with just the built-in local-folder provider.

## Frontend contract

The frontend exposes an extension seam at [`src/extensions`](../frontend/src/extensions). A plugin's
UI module default-exports a `ProviderExtension` (an `id` + a `SettingsSection` component) and is
placed in the git-ignored `src/extensions/private/<id>/index.tsx`. `src/extensions/index.ts` picks
up everything there via `import.meta.glob`; in a clean checkout the directory is empty, so no
third-party UI is bundled. Plugin modules import host code through the `@/` alias
(e.g. `@/components/settingsKit`, `@/extensions/types`).

## Building and loading a plugin locally

Build the plugin assembly and copy its output DLLs (plus its own dependencies) next to the host
(`src/AssetsBoss.Server/bin/...` for dev, `src/AssetsBoss.Desktop/bin/...` for the app), then link
or copy its frontend module into `frontend/src/extensions/private/<id>`. The plugin's own repo
typically ships a script for this.
