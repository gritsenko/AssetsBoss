using AssetsBoss.Core.Domain;
using AssetsBoss.Core.Providers;
using Dapper;
using Microsoft.Data.Sqlite;

namespace AssetsBoss.Core.Indexing;

/// <summary>
/// Пост-проход после скана: проставляет is_animated одиночным картинкам со сниффабельным
/// расширением (.gif/.webp/.apng), у которых флаг ещё не определён (is_animated IS NULL —
/// новый или изменившийся файл). Открывает файл через провайдера и нюхает заголовок.
/// Нечитаемые/битые считаем статикой (0), чтобы не перепроверять их каждый скан.
/// </summary>
public static class AnimatedImageIndexer
{
    private const int BatchSize = 5000;

    public static async Task<int> RecomputeAsync(
        SqliteConnection conn, SourceConfig src, IAssetProvider provider, CancellationToken ct)
    {
        // lower(ext) — расширение хранится в исходном регистре (".GIF" ≠ ".gif")
        var pending = conn.Query<(long Id, string RelPath, string Ext)>(
            """
            SELECT id, rel_path AS RelPath, ext AS Ext FROM assets
            WHERE source_id = @sourceId AND kind = @kind AND is_animated IS NULL
              AND lower(ext) IN ('.gif', '.webp', '.apng')
            """, new { sourceId = src.Id, kind = (int)AssetKind.Image }).ToList();
        if (pending.Count == 0) return 0;

        var results = new List<(long Id, bool Animated)>(pending.Count);
        foreach (var (id, relPath, ext) in pending)
        {
            ct.ThrowIfCancellationRequested();
            var animated = false;
            try
            {
                await using var stream = await provider.OpenReadAsync(src, relPath, ct);
                animated = AnimatedImageDetector.Detect(ext, stream);
            }
            catch (OperationCanceledException) { throw; }
            catch { /* недоступен/битый — считаем статикой */ }
            results.Add((id, animated));
        }

        foreach (var chunk in results.Chunk(BatchSize))
        {
            using var tx = conn.BeginTransaction();
            using var cmd = conn.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = "UPDATE assets SET is_animated = @v WHERE id = @id";
            var pId = cmd.Parameters.Add("@id", SqliteType.Integer);
            var pV = cmd.Parameters.Add("@v", SqliteType.Integer);
            foreach (var (id, animated) in chunk)
            {
                pId.Value = id;
                pV.Value = animated ? 1 : 0;
                cmd.ExecuteNonQuery();
            }
            tx.Commit();
        }

        return results.Count;
    }
}
