using System.Runtime.CompilerServices;
using AssetsBoss.Core.Domain;

namespace AssetsBoss.Core.Providers;

public sealed class LocalFolderProvider : IAssetProvider
{
    public string Scheme => "local";
    public ProviderCaps Caps => ProviderCaps.Watch | ProviderCaps.LocalPath;

    /// <summary>
    /// Собственный DFS-обход вместо RecurseSubdirectories=true: каждая папка в своём
    /// try-catch, чтобы удаление/переименование каталога посреди скана 187k файлов
    /// не валило всю энумерацию, а лишь пропускало недоступную ветку.
    /// </summary>
    public async IAsyncEnumerable<ProviderItem> EnumerateAsync(
        SourceConfig src, IProgress<string>? currentDir, [EnumeratorCancellation] CancellationToken ct)
    {
        var root = Path.GetFullPath(src.Root);
        var options = new EnumerationOptions
        {
            RecurseSubdirectories = false,
            IgnoreInaccessible = true,
            AttributesToSkip = FileAttributes.ReparsePoint,
        };

        var stack = new Stack<string>();
        stack.Push(root);

        while (stack.Count > 0)
        {
            ct.ThrowIfCancellationRequested();
            var dir = stack.Pop();
            currentDir?.Report(ToRelPath(root, dir));

            var batch = new List<ProviderItem>();
            try
            {
                foreach (var sub in Directory.EnumerateDirectories(dir, "*", options))
                    stack.Push(sub);

                foreach (var file in new DirectoryInfo(dir).EnumerateFiles("*", options))
                    batch.Add(new ProviderItem(
                        ToRelPath(root, file.FullName),
                        file.Length,
                        new DateTimeOffset(file.LastWriteTimeUtc).ToUnixTimeSeconds()));
            }
            catch (DirectoryNotFoundException) { continue; }
            catch (UnauthorizedAccessException) { continue; }
            catch (IOException) { continue; }

            foreach (var item in batch)
                yield return item;

            // отдаём поток другим задачам между каталогами
            if (batch.Count > 1000) await Task.Yield();
        }
    }

    public Task<Stream> OpenReadAsync(SourceConfig src, string relPath, CancellationToken ct)
    {
        var path = GetLocalPath(src, relPath)
            ?? throw new FileNotFoundException(relPath);
        return Task.FromResult<Stream>(File.OpenRead(path));
    }

    public string? GetLocalPath(SourceConfig src, string relPath)
    {
        var root = Path.GetFullPath(src.Root);
        var full = Path.GetFullPath(Path.Combine(root, relPath.Replace('/', Path.DirectorySeparatorChar)));
        // защита от path traversal: итоговый путь обязан остаться под корнем источника
        if (!full.StartsWith(root, StringComparison.OrdinalIgnoreCase)) return null;
        return File.Exists(full) ? full : null;
    }

    public IDisposable? Watch(SourceConfig src, Action onAnyChange)
    {
        var watcher = new FileSystemWatcher(src.Root)
        {
            IncludeSubdirectories = true,
            InternalBufferSize = 64 * 1024,
            NotifyFilter = NotifyFilters.FileName | NotifyFilters.DirectoryName
                         | NotifyFilters.LastWrite | NotifyFilters.Size,
        };
        watcher.Created += (_, _) => onAnyChange();
        watcher.Changed += (_, _) => onAnyChange();
        watcher.Deleted += (_, _) => onAnyChange();
        watcher.Renamed += (_, _) => onAnyChange();
        watcher.Error += (_, _) => onAnyChange(); // переполнение буфера → тоже rescan
        watcher.EnableRaisingEvents = true;
        return watcher;
    }

    private static string ToRelPath(string root, string fullPath)
    {
        var rel = Path.GetRelativePath(root, fullPath);
        return rel == "." ? "" : rel.Replace('\\', '/');
    }
}
