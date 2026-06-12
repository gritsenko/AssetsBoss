using System.Diagnostics;
using AssetsBoss.Core.Data;
using AssetsBoss.Core.Domain;
using AssetsBoss.Core.Providers;
using Dapper;
using Microsoft.Data.Sqlite;

namespace AssetsBoss.Core.Indexing;

public sealed record ScanResult(int Seen, int Added, int Updated, int Removed, TimeSpan Elapsed);

/// <summary>
/// Diff-скан источника: сравнивает энумерацию провайдера с индексом по (rel_path, size, mtime),
/// пишет изменения батчами в транзакциях. Дерево dirs собирается инкрементально в том же
/// проходе (HashSet цепочек родителей) и синхронизируется одной транзакцией в конце.
/// </summary>
public sealed class IndexScanner(Db db)
{
    private const int BatchSize = 5000;

    public async Task<ScanResult> ScanAsync(
        SourceConfig src, IAssetProvider provider, ScanStatus status, CancellationToken ct)
    {
        var sw = Stopwatch.StartNew();

        using var conn = db.Open();

        var existing = LoadExisting(conn, src.Id);
        var seenKeys = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var allDirs = new HashSet<string>(StringComparer.OrdinalIgnoreCase);

        var pendingNew = new List<ProviderItem>(BatchSize);
        var pendingChanged = new List<(long Id, long Size, long Mtime)>(BatchSize);

        var progress = new Progress<string>(dir => status.CurrentDir = dir);

        await foreach (var item in provider.EnumerateAsync(src, progress, ct))
        {
            status.Seen++;
            seenKeys.Add(item.RelPath);
            AddDirChain(allDirs, GetParentDir(item.RelPath));

            if (existing.TryGetValue(item.RelPath, out var row))
            {
                if (row.Size != item.Size || row.Mtime != item.MtimeUnix)
                {
                    pendingChanged.Add((row.Id, item.Size, item.MtimeUnix));
                    if (pendingChanged.Count >= BatchSize) FlushChanged(conn, pendingChanged, status);
                }
            }
            else
            {
                pendingNew.Add(item);
                if (pendingNew.Count >= BatchSize) FlushNew(conn, src.Id, pendingNew, status);
            }
        }

        FlushNew(conn, src.Id, pendingNew, status);
        FlushChanged(conn, pendingChanged, status);

        var missingIds = existing
            .Where(kv => !seenKeys.Contains(kv.Key))
            .Select(kv => kv.Value.Id)
            .ToList();
        DeleteMissing(conn, missingIds, status);

        SyncDirs(conn, src.Id, allDirs);

        AnimationIndexer.Recompute(conn, src.Id);

        conn.Execute("UPDATE sources SET last_scan_at = @now WHERE id = @id",
            new { id = src.Id, now = DateTimeOffset.UtcNow.ToUnixTimeSeconds() });

        sw.Stop();
        return new ScanResult(status.Seen, status.Added, status.Updated, status.Removed, sw.Elapsed);
    }

    private static Dictionary<string, (long Id, long Size, long Mtime)> LoadExisting(
        SqliteConnection conn, long sourceId)
    {
        var result = new Dictionary<string, (long, long, long)>(StringComparer.OrdinalIgnoreCase);
        foreach (var row in conn.Query<(long Id, string RelPath, long Size, long Mtime)>(
            "SELECT id, rel_path, size, mtime FROM assets WHERE source_id = @sourceId",
            new { sourceId }))
        {
            result[row.RelPath] = (row.Id, row.Size, row.Mtime);
        }
        return result;
    }

    private static void FlushNew(SqliteConnection conn, long sourceId, List<ProviderItem> items, ScanStatus status)
    {
        if (items.Count == 0) return;

        using var tx = conn.BeginTransaction();
        using var cmd = conn.CreateCommand();
        cmd.Transaction = tx;
        cmd.CommandText =
            """
            INSERT INTO assets(source_id, rel_path, parent_dir, name, ext, kind, size, mtime)
            VALUES (@sourceId, @relPath, @parentDir, @name, @ext, @kind, @size, @mtime)
            ON CONFLICT(source_id, rel_path) DO UPDATE SET size = @size, mtime = @mtime
            """;
        var pSource = cmd.Parameters.Add("@sourceId", SqliteType.Integer);
        var pRel = cmd.Parameters.Add("@relPath", SqliteType.Text);
        var pDir = cmd.Parameters.Add("@parentDir", SqliteType.Text);
        var pName = cmd.Parameters.Add("@name", SqliteType.Text);
        var pExt = cmd.Parameters.Add("@ext", SqliteType.Text);
        var pKind = cmd.Parameters.Add("@kind", SqliteType.Integer);
        var pSize = cmd.Parameters.Add("@size", SqliteType.Integer);
        var pMtime = cmd.Parameters.Add("@mtime", SqliteType.Integer);
        pSource.Value = sourceId;

        foreach (var item in items)
        {
            var name = GetFileName(item.RelPath);
            pRel.Value = item.RelPath;
            pDir.Value = GetParentDir(item.RelPath);
            pName.Value = name;
            var ext = Path.GetExtension(name);
            pExt.Value = ext;
            pKind.Value = (int)AssetKinds.FromExtension(ext);
            pSize.Value = item.Size;
            pMtime.Value = item.MtimeUnix;
            cmd.ExecuteNonQuery();
        }

        tx.Commit();
        status.Added += items.Count;
        items.Clear();
    }

    private static void FlushChanged(SqliteConnection conn, List<(long Id, long Size, long Mtime)> items, ScanStatus status)
    {
        if (items.Count == 0) return;

        using var tx = conn.BeginTransaction();
        using var cmd = conn.CreateCommand();
        cmd.Transaction = tx;
        // width/height сбрасываются: файл изменился, размеры пересчитает миниатюра
        cmd.CommandText = "UPDATE assets SET size = @size, mtime = @mtime, width = NULL, height = NULL WHERE id = @id";
        var pId = cmd.Parameters.Add("@id", SqliteType.Integer);
        var pSize = cmd.Parameters.Add("@size", SqliteType.Integer);
        var pMtime = cmd.Parameters.Add("@mtime", SqliteType.Integer);

        foreach (var (id, size, mtime) in items)
        {
            pId.Value = id;
            pSize.Value = size;
            pMtime.Value = mtime;
            cmd.ExecuteNonQuery();
        }

        tx.Commit();
        status.Updated += items.Count;
        items.Clear();
    }

    private static void DeleteMissing(SqliteConnection conn, List<long> ids, ScanStatus status)
    {
        if (ids.Count == 0) return;

        foreach (var chunk in ids.Chunk(BatchSize))
        {
            using var tx = conn.BeginTransaction();
            using var cmd = conn.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = "DELETE FROM assets WHERE id = @id";
            var pId = cmd.Parameters.Add("@id", SqliteType.Integer);
            foreach (var id in chunk)
            {
                pId.Value = id;
                cmd.ExecuteNonQuery();
            }
            tx.Commit();
        }

        status.Removed += ids.Count;
    }

    private static void SyncDirs(SqliteConnection conn, long sourceId, HashSet<string> allDirs)
    {
        var existing = conn.Query<string>(
                "SELECT path FROM dirs WHERE source_id = @sourceId", new { sourceId })
            .ToHashSet(StringComparer.OrdinalIgnoreCase);

        using var tx = conn.BeginTransaction();

        using (var insert = conn.CreateCommand())
        {
            insert.Transaction = tx;
            insert.CommandText = "INSERT OR IGNORE INTO dirs(source_id, path, parent) VALUES (@sourceId, @path, @parent)";
            var pSource = insert.Parameters.Add("@sourceId", SqliteType.Integer);
            var pPath = insert.Parameters.Add("@path", SqliteType.Text);
            var pParent = insert.Parameters.Add("@parent", SqliteType.Text);
            pSource.Value = sourceId;

            foreach (var dir in allDirs.Where(d => !existing.Contains(d)))
            {
                pPath.Value = dir;
                pParent.Value = GetParentDir(dir);
                insert.ExecuteNonQuery();
            }
        }

        using (var delete = conn.CreateCommand())
        {
            delete.Transaction = tx;
            delete.CommandText = "DELETE FROM dirs WHERE source_id = @sourceId AND path = @path";
            var pSource = delete.Parameters.Add("@sourceId", SqliteType.Integer);
            var pPath = delete.Parameters.Add("@path", SqliteType.Text);
            pSource.Value = sourceId;

            foreach (var dir in existing.Where(d => !allDirs.Contains(d)))
            {
                pPath.Value = dir;
                delete.ExecuteNonQuery();
            }
        }

        tx.Commit();
    }

    /// <summary>Добавляет каталог и всю цепочку его родителей ("a/b/c" → a, a/b, a/b/c).</summary>
    internal static void AddDirChain(HashSet<string> dirs, string dir)
    {
        while (dir.Length > 0 && dirs.Add(dir))
            dir = GetParentDir(dir);
    }

    internal static string GetParentDir(string relPath)
    {
        var idx = relPath.LastIndexOf('/');
        return idx < 0 ? "" : relPath[..idx];
    }

    private static string GetFileName(string relPath)
    {
        var idx = relPath.LastIndexOf('/');
        return idx < 0 ? relPath : relPath[(idx + 1)..];
    }
}
