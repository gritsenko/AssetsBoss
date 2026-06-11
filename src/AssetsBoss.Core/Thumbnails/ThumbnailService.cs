using System.Security.Cryptography;
using System.Text;
using AssetsBoss.Core.Data;
using AssetsBoss.Core.Domain;
using AssetsBoss.Core.Providers;
using Microsoft.Extensions.Logging;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.Formats.Webp;
using SixLabors.ImageSharp.Memory;
using SixLabors.ImageSharp.Processing;

namespace AssetsBoss.Core.Thumbnails;

public sealed record ThumbResult(string FilePath, string ETag);

/// <summary>
/// On-demand миниатюры с диск-кэшем: thumbs\{size}\{ab}\{sha1}.webp.
/// Ключ — SHA1(sourceId|relPath|mtime|size файла), relPath нормализован
/// (нижний регистр, прямые слэши) — Windows case-insensitive.
/// </summary>
public sealed class ThumbnailService
{
    public static readonly int[] AllowedSizes = [128, 256, 512];

    private readonly string _cacheRoot;
    private readonly AssetRepository _assets;
    private readonly ILogger<ThumbnailService> _log;
    private readonly SemaphoreSlim _throttle = new(Math.Max(1, Environment.ProcessorCount - 1));

    private static readonly HashSet<string> DecodableExts = new(StringComparer.OrdinalIgnoreCase)
    {
        ".png", ".jpg", ".jpeg", ".bmp", ".gif", ".webp", ".tga",
    };

    static ThumbnailService()
    {
        // декод больших PNG пачками давит на LOH — ограничиваем пул аллокатора
        Configuration.Default.MemoryAllocator = MemoryAllocator.Create(new MemoryAllocatorOptions
        {
            MaximumPoolSizeMegabytes = 256,
        });
    }

    public ThumbnailService(string cacheRoot, AssetRepository assets, ILogger<ThumbnailService> log)
    {
        _cacheRoot = cacheRoot;
        _assets = assets;
        _log = log;
    }

    public static bool CanThumbnail(string ext) => DecodableExts.Contains(ext);

    public async Task<ThumbResult?> GetOrCreateAsync(
        Asset asset, SourceConfig src, IAssetProvider provider, int size, CancellationToken ct)
    {
        if (!AllowedSizes.Contains(size) || !CanThumbnail(asset.Ext)) return null;

        var key = CacheKey(asset.SourceId, asset.RelPath, asset.Mtime, asset.Size);
        var path = Path.Combine(_cacheRoot, size.ToString(), key[..2], key + ".webp");
        if (File.Exists(path)) return new ThumbResult(path, key);

        await _throttle.WaitAsync(ct);
        try
        {
            if (File.Exists(path)) return new ThumbResult(path, key); // другой запрос успел

            await using var input = await provider.OpenReadAsync(src, asset.RelPath, ct);
            using var image = await Image.LoadAsync(input, ct);

            if (asset.Width is null)
                _assets.SetDimensions(asset.Id, image.Width, image.Height);

            var max = Math.Max(image.Width, image.Height);
            if (max > size)
            {
                var scale = (double)size / max;
                image.Mutate(x => x.Resize(
                    (int)Math.Max(1, Math.Round(image.Width * scale)),
                    (int)Math.Max(1, Math.Round(image.Height * scale))));
            }

            Directory.CreateDirectory(Path.GetDirectoryName(path)!);
            var tmp = path + "." + Guid.NewGuid().ToString("N")[..8] + ".tmp";
            try
            {
                await using (var output = File.Create(tmp))
                    await image.SaveAsync(output, new WebpEncoder { Quality = 80 }, ct);
                File.Move(tmp, path, overwrite: true); // атомарная публикация в кэш
            }
            catch
            {
                try { File.Delete(tmp); } catch { /* best effort */ }
                throw;
            }

            return new ThumbResult(path, key);
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception ex)
        {
            _log.LogDebug(ex, "Thumbnail failed for asset {Id} ({RelPath})", asset.Id, asset.RelPath);
            return null;
        }
        finally
        {
            _throttle.Release();
        }
    }

    /// <summary>Нормализация перед хэшем: слэши строго '/', нижний регистр (FOO.png == foo.png на Windows).</summary>
    public static string CacheKey(long sourceId, string relPath, long mtime, long fileSize)
    {
        var normalized = relPath.Replace('\\', '/').ToLowerInvariant();
        var raw = $"{sourceId}|{normalized}|{mtime}|{fileSize}";
        return Convert.ToHexStringLower(SHA1.HashData(Encoding.UTF8.GetBytes(raw)));
    }
}
