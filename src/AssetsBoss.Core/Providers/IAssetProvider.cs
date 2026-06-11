using AssetsBoss.Core.Domain;

namespace AssetsBoss.Core.Providers;

[Flags]
public enum ProviderCaps
{
    None = 0,
    /// <summary>Провайдер умеет сообщать «что-то поменялось» (без деталей — реакция всегда rescan).</summary>
    Watch = 1,
    /// <summary>Ассет доступен как физический файл — можно отдавать zero-copy с Range.</summary>
    LocalPath = 2,
}

public sealed record ProviderItem(string RelPath, long Size, long MtimeUnix);

public interface IAssetProvider
{
    string Scheme { get; }
    ProviderCaps Caps { get; }

    /// <summary>Перечисляет все ассеты источника. RelPath — с прямыми слэшами.</summary>
    IAsyncEnumerable<ProviderItem> EnumerateAsync(SourceConfig src, IProgress<string>? currentDir, CancellationToken ct);

    Task<Stream> OpenReadAsync(SourceConfig src, string relPath, CancellationToken ct);

    /// <summary>Физический путь файла, если есть Caps.LocalPath; иначе null.</summary>
    string? GetLocalPath(SourceConfig src, string relPath);

    /// <summary>Подписка на изменения; null, если Caps не содержит Watch.</summary>
    IDisposable? Watch(SourceConfig src, Action onAnyChange);
}
