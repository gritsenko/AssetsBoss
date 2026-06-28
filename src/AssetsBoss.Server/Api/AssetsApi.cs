using AssetsBoss.Core.Data;
using AssetsBoss.Core.Domain;
using AssetsBoss.Core.Providers;
using AssetsBoss.Core.Thumbnails;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Net.Http.Headers;
using Serilog;

namespace AssetsBoss.Server.Api;

public static class AssetsApi
{
    private static readonly FileExtensionContentTypeProvider ContentTypes = new();

    public static RouteGroupBuilder MapAssetsApi(this RouteGroupBuilder group)
    {
        group.MapGet("/sources/{id:long}/dirs", (long id, string? parent, AssetRepository assets) =>
            assets.GetChildDirs(id, parent ?? ""));

        group.MapGet("/assets", (
            AssetRepository assets,
            long? sourceId, string? dir, bool recursive = false,
            string? kind = null, string? q = null,
            int offset = 0, int limit = 200, bool grouped = false, bool animated = false) =>
        {
            limit = Math.Clamp(limit, 1, 500);
            offset = Math.Max(0, offset);
            var page = assets.Query(new AssetQuery(
                sourceId, dir, recursive, AssetKinds.Parse(kind), q, offset, limit, grouped, animated));
            return new { page.Items, page.Total, offset, limit };
        });

        group.MapGet("/assets/group", (AssetRepository assets, long sourceId, string name, string? dir) =>
            assets.GetAnimGroup(sourceId, dir ?? "", name) is { } detail
                ? Results.Ok(detail)
                : Results.NotFound());

        // Варианты 3D-модели (одно имя, разные расширения в одной папке) — для раскрытия группы
        group.MapGet("/assets/modelgroup", (AssetRepository assets, long sourceId, string name, string? dir) =>
        {
            var variants = assets.GetModelGroup(sourceId, dir ?? "", name);
            return variants.Count > 0
                ? Results.Ok(new { sourceId, dir = dir ?? "", name, variants })
                : Results.NotFound();
        });

        // Companion-файлы 3D-модели (внешние текстуры + анимационные FBX, плюс слоты текстур из
        // Unity .mat/.meta, если есть) — для надёжного резолва текстур и подгрузки анимаций. Только модели.
        group.MapGet("/assets/{id:long}/bundle", async (
            long id, Core.Models.ModelBundleService bundles, CancellationToken ct) =>
        {
            var bundle = await bundles.GetAsync(id, ct);
            return bundle is null ? Results.NotFound() : Results.Ok(bundle);
        });

        // Разнообразное превью папки: N равномерно распределённых ассетов + общий счётчик
        group.MapGet("/assets/folder-preview", (AssetRepository assets, long sourceId, string dir, int limit = 4) =>
        {
            var (items, total) = assets.GetFolderPreview(sourceId, dir, Math.Clamp(limit, 1, 12));
            return new { items, total };
        });

        group.MapGet("/assets/{id:long}", (long id, AssetRepository assets) =>
            assets.GetById(id) is { } asset ? Results.Ok(asset) : Results.NotFound());

        group.MapGet("/assets/{id:long}/content", async (
            long id, AssetRepository assets, SourceRepository sources,
            ProviderRegistry providers, CancellationToken ct) =>
        {
            var asset = assets.GetById(id);
            if (asset is null) return Results.NotFound();
            var src = sources.GetById(asset.SourceId);
            if (src is null) return Results.NotFound();

            var provider = providers.TryGet(src.Scheme);
            if (provider is null) return Results.StatusCode(503);
            var contentType = ContentTypes.TryGetContentType(asset.Name, out var type)
                ? type : "application/octet-stream";

            // локальный файл — zero-copy с поддержкой Range (перемотка аудио)
            if (provider.GetLocalPath(src, asset.RelPath) is { } path)
                return Results.File(path, contentType, enableRangeProcessing: true);

            var stream = await provider.OpenReadAsync(src, asset.RelPath, ct);
            return Results.Stream(stream, contentType, enableRangeProcessing: true);
        });

        // Сырой доступ к файлу по относительному пути внутри источника. Нужен 3D-загрузчикам
        // фронтенда: glTF/OBJ ссылаются на соседние .bin/.mtl/текстуры относительными путями —
        // путь-стайл URL (а не ?id) даёт браузеру разрешать их относительно модели.
        group.MapGet("/sources/{id:long}/raw/{**relPath}", async (
            long id, string relPath, SourceRepository sources,
            ProviderRegistry providers, CancellationToken ct) =>
        {
            var src = sources.GetById(id);
            if (src is null) return Results.NotFound();

            var provider = providers.TryGet(src.Scheme);
            if (provider is null) return Results.StatusCode(503);
            var contentType = ContentTypes.TryGetContentType(Path.GetFileName(relPath), out var type)
                ? type : "application/octet-stream";

            // локальный путь (с защитой от traversal внутри провайдера) — zero-copy с Range
            var local = provider.GetLocalPath(src, relPath);
            if (local is not null)
                return Results.File(local, contentType, enableRangeProcessing: true);
            // провайдер умеет локальные пути, но не разрешил этот — файла нет либо traversal
            if ((provider.Caps & ProviderCaps.LocalPath) != 0)
                return Results.NotFound();

            var stream = await provider.OpenReadAsync(src, relPath, ct);
            return Results.Stream(stream, contentType, enableRangeProcessing: true);
        });

        // Открыть файл ассета в приложении ОС по умолчанию (как двойной клик в проводнике).
        group.MapPost("/assets/{id:long}/open", (
            long id, AssetRepository assets, SourceRepository sources, ProviderRegistry providers) =>
            ShellAction(id, assets, sources, providers, ShellLauncher.OpenInDefaultApp));

        // Показать файл ассета в системном проводнике (открыть его папку и выделить файл).
        group.MapPost("/assets/{id:long}/reveal", (
            long id, AssetRepository assets, SourceRepository sources, ProviderRegistry providers) =>
            ShellAction(id, assets, sources, providers, ShellLauncher.RevealInExplorer));

        group.MapGet("/assets/{id:long}/thumb", async (
            long id, int size, string? rev, HttpContext http,
            AssetRepository assets, SourceRepository sources,
            ProviderRegistry providers, ThumbnailService thumbs,
            CancellationToken ct) =>
        {
            if (!ThumbnailService.AllowedSizes.Contains(size))
                return Results.BadRequest(new { error = $"size must be one of: {string.Join(", ", ThumbnailService.AllowedSizes)}" });

            var asset = assets.GetById(id);
            if (asset is null) return Results.NotFound();
            var src = sources.GetById(asset.SourceId);
            if (src is null) return Results.NotFound();

            // модели сервер не рендерит (нет headless-GL на ARM) — клиент кладёт мастер (512),
            // сервер ужимает из него меньшие размеры; картинки рендерим/кэшируем как раньше
            var thumbProvider = providers.TryGet(src.Scheme);
            if (thumbProvider is null && asset.Kind != AssetKind.Model) return Results.StatusCode(503);
            var result = asset.Kind == AssetKind.Model
                ? await thumbs.GetModelThumbAsync(asset, size, rev, ct)
                : await thumbs.GetOrCreateAsync(asset, src, thumbProvider!, size, ct);
            if (result is null) return Results.NotFound();

            // URL содержит v={mtime} → содержимое по этому URL неизменно
            http.Response.Headers.CacheControl = "public, max-age=31536000, immutable";
            return Results.File(result.FilePath, "image/webp",
                entityTag: new EntityTagHeaderValue($"\"{result.ETag}\""));
        });

        // Клиент рендерит 3D-превью в WebGL и присылает PNG/WebP — сервер перекодирует в webp
        // и кэширует под тем же ключом (с rev), что и GET. Только для моделей: картинки рендерит сам сервер.
        group.MapPost("/assets/{id:long}/thumb", async (
            long id, int size, string? rev, HttpContext http,
            AssetRepository assets, SourceRepository sources, ThumbnailService thumbs, CancellationToken ct) =>
        {
            if (!ThumbnailService.AllowedSizes.Contains(size))
                return Results.BadRequest(new { error = $"size must be one of: {string.Join(", ", ThumbnailService.AllowedSizes)}" });

            // превью — это мелкий webp; режем заведомо огромные тела ещё до декода
            if (http.Request.ContentLength is > 8 * 1024 * 1024)
                return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);

            var asset = assets.GetById(id);
            if (asset is null) return Results.NotFound();
            if (asset.Kind != AssetKind.Model)
                return Results.BadRequest(new { error = "thumb upload allowed only for models" });
            if (sources.GetById(asset.SourceId) is null) return Results.NotFound();

            var result = await thumbs.SaveAsync(asset, size, rev, http.Request.Body, ct);
            return result is null
                ? Results.UnprocessableEntity(new { error = "could not decode uploaded image" })
                : Results.Ok(new { etag = result.ETag });
        });

        // Волна аудио: сервер не декодирует звук (нет нативных x64-only либ на ARM, ср. 3D-превью) —
        // пики и длительность считает клиент через Web Audio API и кэширует здесь.
        group.MapGet("/assets/{id:long}/waveform", (long id, HttpContext http, AssetRepository assets) =>
        {
            var asset = assets.GetById(id);
            if (asset is null || asset.Kind != AssetKind.Audio) return Results.NotFound();

            var wf = assets.GetWaveform(id);
            if (wf is null || wf.Mtime != asset.Mtime) return Results.NotFound();

            // URL содержит v={mtime} → содержимое неизменно; пики (байты 0..255) отдаём как int[]
            http.Response.Headers.CacheControl = "public, max-age=31536000, immutable";
            return Results.Ok(new { durationMs = wf.DurationMs, peaks = Array.ConvertAll(wf.Peaks, b => (int)b) });
        });

        // Клиент декодирует аудио и присылает { durationMs, peaks }; сервер кэширует под mtime файла.
        group.MapPost("/assets/{id:long}/waveform", async (
            long id, HttpContext http, AssetRepository assets, CancellationToken ct) =>
        {
            // волна — это сотни байт; режем заведомо огромные тела ещё до парсинга
            if (http.Request.ContentLength is > 256 * 1024)
                return Results.StatusCode(StatusCodes.Status413PayloadTooLarge);

            var asset = assets.GetById(id);
            if (asset is null) return Results.NotFound();
            if (asset.Kind != AssetKind.Audio)
                return Results.BadRequest(new { error = "waveform upload allowed only for audio" });

            WaveformUpload? upload;
            try { upload = await http.Request.ReadFromJsonAsync<WaveformUpload>(ct); }
            catch { upload = null; }
            if (upload?.Peaks is not { Length: >= 1 and <= 2048 })
                return Results.BadRequest(new { error = "peaks must be an array of 1..2048 values" });
            if (upload.DurationMs < 0)
                return Results.BadRequest(new { error = "durationMs must be non-negative" });

            var peaks = new byte[upload.Peaks.Length];
            for (var i = 0; i < peaks.Length; i++)
                peaks[i] = (byte)Math.Clamp(upload.Peaks[i], 0, 255);

            assets.SaveWaveform(id, asset.Mtime, upload.DurationMs, peaks);
            return Results.NoContent();
        });

        return group;
    }

    /// <summary>
    /// Резолвит локальный путь файла ассета и выполняет над ним действие оболочки ОС
    /// (открыть/показать). Действие требует физического файла на этой машине — удалённые
    /// провайдеры без <see cref="ProviderCaps.LocalPath"/> не поддержаны.
    /// </summary>
    private static IResult ShellAction(
        long id, AssetRepository assets, SourceRepository sources,
        ProviderRegistry providers, Action<string> action)
    {
        var asset = assets.GetById(id);
        if (asset is null) return Results.NotFound();
        var src = sources.GetById(asset.SourceId);
        if (src is null) return Results.NotFound();

        var provider = providers.TryGet(src.Scheme);
        if (provider is null) return Results.StatusCode(503);

        var path = provider.GetLocalPath(src, asset.RelPath);
        if (path is null)
            return Results.UnprocessableEntity(new { error = "Файл недоступен локально" });

        try
        {
            action(path);
        }
        catch (Exception ex)
        {
            Log.Warning(ex, "Не удалось выполнить действие ОС над {Path}", path);
            return Results.Json(
                new { error = "Не удалось открыть файл средствами системы" },
                statusCode: StatusCodes.Status500InternalServerError);
        }

        return Results.NoContent();
    }

    /// <summary>Тело POST /waveform: длительность (мс) и пики 0..255 (по столбику на элемент).</summary>
    private sealed record WaveformUpload(long DurationMs, int[] Peaks);
}
