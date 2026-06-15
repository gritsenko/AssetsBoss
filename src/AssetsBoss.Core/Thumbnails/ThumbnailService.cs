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
    public static readonly int[] AllowedSizes = [128, 256, 512, 1024];

    private readonly string _cacheRoot;
    private readonly AssetRepository _assets;
    private readonly ILogger<ThumbnailService> _log;
    private readonly SemaphoreSlim _throttle = new(Math.Max(1, Environment.ProcessorCount - 1));

    private static readonly HashSet<string> DecodableExts = new(StringComparer.OrdinalIgnoreCase)
    {
        ".png", ".jpg", ".jpeg", ".bmp", ".gif", ".webp", ".tga", ".psd",
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

    /// <summary>Канонический размер мастер-превью модели; меньшие сервер ужимает из него.</summary>
    public const int ModelMasterSize = 512;

    /// <summary>
    /// Путь в кэше для (ассет, размер, rev). rev — версия клиентского рендера превью моделей:
    /// её смена даёт новый ключ и инвалидирует старые превью. Для картинок rev=null (ключ как был).
    /// </summary>
    private string CachePath(Asset asset, int size, string? rev, out string key)
    {
        var baseKey = CacheKey(asset.SourceId, asset.RelPath, asset.Mtime, asset.Size);
        key = rev is null
            ? baseKey
            : Convert.ToHexStringLower(SHA1.HashData(Encoding.UTF8.GetBytes(baseKey + "|r" + rev)));
        return Path.Combine(_cacheRoot, size.ToString(), key[..2], key + ".webp");
    }

    /// <summary>
    /// Превью 3D-модели: сервер их не рендерит (нет headless-GL), мастер (512) кладёт клиент
    /// через <see cref="SaveAsync"/>. Точный размер отдаём из кэша; меньший — ужимаем из мастера,
    /// так одного клиентского рендера хватает на все размеры сетки.
    /// </summary>
    public async Task<ThumbResult?> GetModelThumbAsync(Asset asset, int size, string? rev, CancellationToken ct)
    {
        if (!AllowedSizes.Contains(size)) return null;

        var path = CachePath(asset, size, rev, out var key);
        if (File.Exists(path)) return new ThumbResult(path, key);
        if (size >= ModelMasterSize) return null; // мастер крупнее не из чего сделать — рендерит клиент

        var masterPath = CachePath(asset, ModelMasterSize, rev, out _);
        if (!File.Exists(masterPath)) return null;

        await _throttle.WaitAsync(ct);
        try
        {
            if (File.Exists(path)) return new ThumbResult(path, key); // успел другой запрос
            using var image = await Image.LoadAsync(masterPath, ct);
            Downscale(image, size);
            await WriteWebpAsync(image, path, ct);
            return new ThumbResult(path, key);
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception ex)
        {
            _log.LogDebug(ex, "Downscaling model thumb failed for asset {Id}", asset.Id);
            return null;
        }
        finally { _throttle.Release(); }
    }

    /// <summary>
    /// Сохраняет клиентский рендер превью модели (PNG/WebP) как мастер: декодирует, ужимает до size
    /// и перекодирует в WebP — на диск попадает только валидный webp, не сырое тело запроса.
    /// </summary>
    public async Task<ThumbResult?> SaveAsync(Asset asset, int size, string? rev, Stream input, CancellationToken ct)
    {
        if (!AllowedSizes.Contains(size)) return null;

        var path = CachePath(asset, size, rev, out var key);
        await _throttle.WaitAsync(ct); // тот же лимит CPU/LOH, что и у генерации картинок
        try
        {
            using var image = await Image.LoadAsync(input, ct);
            Downscale(image, size);
            await WriteWebpAsync(image, path, ct);
            return new ThumbResult(path, key);
        }
        catch (OperationCanceledException) { throw; }
        catch (Exception ex)
        {
            _log.LogDebug(ex, "Saving uploaded thumbnail failed for asset {Id} ({RelPath})", asset.Id, asset.RelPath);
            return null;
        }
        finally { _throttle.Release(); }
    }

    /// <summary>Ужимает по большей стороне до size (апскейл не делаем).</summary>
    private static void Downscale(Image image, int size)
    {
        var max = Math.Max(image.Width, image.Height);
        if (max <= size) return;
        var scale = (double)size / max;
        image.Mutate(x => x.Resize(
            (int)Math.Max(1, Math.Round(image.Width * scale)),
            (int)Math.Max(1, Math.Round(image.Height * scale))));
    }

    /// <summary>Пишет webp атомарно: tmp на том же томе → File.Move.</summary>
    private static async Task WriteWebpAsync(Image image, string path, CancellationToken ct)
    {
        Directory.CreateDirectory(Path.GetDirectoryName(path)!);
        var tmp = path + "." + Guid.NewGuid().ToString("N")[..8] + ".tmp";
        try
        {
            await using (var output = File.Create(tmp))
                await image.SaveAsync(output, new WebpEncoder { Quality = 80 }, ct);
            File.Move(tmp, path, overwrite: true);
        }
        catch
        {
            try { File.Delete(tmp); } catch { /* best effort */ }
            throw;
        }
    }

    public async Task<ThumbResult?> GetOrCreateAsync(
        Asset asset, SourceConfig src, IAssetProvider provider, int size, CancellationToken ct)
    {
        if (!AllowedSizes.Contains(size) || !CanThumbnail(asset.Ext)) return null;

        var path = CachePath(asset, size, null, out var key);
        if (File.Exists(path)) return new ThumbResult(path, key);

        await _throttle.WaitAsync(ct);
        try
        {
            if (File.Exists(path)) return new ThumbResult(path, key); // другой запрос успел

            // Тяжёлый оригинал ради миниатюры не качаем: если провайдер отдаёт лёгкое превью
            // (бэкендный растр удалённого хранилища) — декодируем его (формат определяется по содержимому,
            // PSD там не бывает); иначе берём оригинал нашим ридером (включая PSD).
            var (image, fromOriginal) = await LoadThumbnailSourceAsync(asset, src, provider, ct);
            using var _ = image;

            // размеры пишем только из оригинала: превью бэкенда может быть ужато и дало бы неверное разрешение
            if (fromOriginal && asset.Width is null)
                _assets.SetDimensions(asset.Id, image.Width, image.Height);

            Downscale(image, size);
            await WriteWebpAsync(image, path, ct);
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

    /// <summary>
    /// Источник пикселей для миниатюры: бэкендное превью провайдера (если есть) либо оригинал.
    /// Превью — готовый растр, его читаем штатным декодером; оригинал может быть PSD — тогда наш ридер.
    /// <c>FromOriginal</c> = декодировали оригинал (можно доверять его размерам).
    /// </summary>
    private static async Task<(Image Image, bool FromOriginal)> LoadThumbnailSourceAsync(
        Asset asset, SourceConfig src, IAssetProvider provider, CancellationToken ct)
    {
        var preview = await provider.OpenThumbnailSourceAsync(src, asset.RelPath, ct);
        if (preview is not null)
        {
            await using (preview)
                return (await Image.LoadAsync(preview, ct), false);
        }

        await using var input = await provider.OpenReadAsync(src, asset.RelPath, ct);
        return (await DecodeAsync(asset.Ext, input, ct), true);
    }

    /// <summary>
    /// PSD декодируем своим ридером (composite-слой) — ImageSharp его не понимает; остальное штатно.
    /// PSD-парсер прыгает по позициям, поэтому буферизуем в память (поток провайдера может быть не seekable).
    /// </summary>
    private static async Task<Image> DecodeAsync(string ext, Stream input, CancellationToken ct)
    {
        if (!ext.Equals(".psd", StringComparison.OrdinalIgnoreCase))
            return await Image.LoadAsync(input, ct);

        using var buffer = new MemoryStream();
        await input.CopyToAsync(buffer, ct);
        buffer.Position = 0;
        return PsdDecoder.Decode(buffer);
    }

    /// <summary>Нормализация перед хэшем: слэши строго '/', нижний регистр (FOO.png == foo.png на Windows).</summary>
    public static string CacheKey(long sourceId, string relPath, long mtime, long fileSize)
    {
        var normalized = relPath.Replace('\\', '/').ToLowerInvariant();
        var raw = $"{sourceId}|{normalized}|{mtime}|{fileSize}";
        return Convert.ToHexStringLower(SHA1.HashData(Encoding.UTF8.GetBytes(raw)));
    }
}
