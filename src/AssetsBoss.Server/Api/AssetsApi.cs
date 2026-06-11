using AssetsBoss.Core.Data;
using AssetsBoss.Core.Domain;
using AssetsBoss.Core.Providers;
using AssetsBoss.Core.Thumbnails;
using Microsoft.AspNetCore.StaticFiles;
using Microsoft.Net.Http.Headers;

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
            int offset = 0, int limit = 200) =>
        {
            limit = Math.Clamp(limit, 1, 500);
            offset = Math.Max(0, offset);
            var page = assets.Query(new AssetQuery(
                sourceId, dir, recursive, AssetKinds.Parse(kind), q, offset, limit));
            return new { page.Items, page.Total, offset, limit };
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

            var provider = providers.Get(src.Scheme);
            var contentType = ContentTypes.TryGetContentType(asset.Name, out var type)
                ? type : "application/octet-stream";

            // локальный файл — zero-copy с поддержкой Range (перемотка аудио)
            if (provider.GetLocalPath(src, asset.RelPath) is { } path)
                return Results.File(path, contentType, enableRangeProcessing: true);

            var stream = await provider.OpenReadAsync(src, asset.RelPath, ct);
            return Results.Stream(stream, contentType, enableRangeProcessing: true);
        });

        group.MapGet("/assets/{id:long}/thumb", async (
            long id, int size, HttpContext http,
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

            var result = await thumbs.GetOrCreateAsync(asset, src, providers.Get(src.Scheme), size, ct);
            if (result is null) return Results.NotFound();

            // URL содержит v={mtime} → содержимое по этому URL неизменно
            http.Response.Headers.CacheControl = "public, max-age=31536000, immutable";
            return Results.File(result.FilePath, "image/webp",
                entityTag: new EntityTagHeaderValue($"\"{result.ETag}\""));
        });

        return group;
    }
}
