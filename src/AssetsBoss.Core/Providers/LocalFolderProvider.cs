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
        // rooted/UNC/drive-qual' или ADS-двоеточие: Path.Combine выкинул бы корень, а ':' открыл бы
        // альтернативный поток — режем такой ввод сразу (legit relPath от индексатора их не содержит)
        if (string.IsNullOrEmpty(relPath) || Path.IsPathRooted(relPath) || relPath.Contains(':'))
            return null;

        var root = Path.GetFullPath(src.Root);
        var rootWithSep = root.EndsWith(Path.DirectorySeparatorChar) ? root : root + Path.DirectorySeparatorChar;
        var full = Path.GetFullPath(Path.Combine(rootWithSep, relPath.Replace('/', Path.DirectorySeparatorChar)));

        // защита от path traversal: итоговый путь строго под корнем (граница по разделителю —
        // иначе sibling-папка с тем же префиксом имени, "assets" vs "assets-secret", проходила бы)
        if (!string.Equals(full, root, StringComparison.OrdinalIgnoreCase)
            && !full.StartsWith(rootWithSep, StringComparison.OrdinalIgnoreCase))
            return null;

        if (!File.Exists(full)) return null;

        // не отдаём reparse-points (symlink/junction): путь к линку под корнем, но цель — вне его.
        // зеркалит политику индексатора (AttributesToSkip = ReparsePoint).
        if ((File.GetAttributes(full) & FileAttributes.ReparsePoint) != 0) return null;

        return full;
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
