using AssetsBoss.Core.Domain;
using Dapper;
using Microsoft.Data.Sqlite;

namespace AssetsBoss.Core.Indexing;

/// <summary>
/// Пост-проход после скана: пересчитывает anim_group/anim_clip/anim_frame для всех
/// картинок источника по каталогам. Пишутся только реально изменившиеся строки.
/// </summary>
public static class AnimationIndexer
{
    private const int BatchSize = 5000;

    public static int Recompute(SqliteConnection conn, long sourceId)
    {
        var rows = conn.Query<(long Id, string ParentDir, string Name, string? Group, string? Clip, int? Frame)>(
            """
            SELECT id, parent_dir, name, anim_group, anim_clip, anim_frame
            FROM assets WHERE source_id = @sourceId AND kind = @kind
            ORDER BY parent_dir
            """, new { sourceId, kind = (int)AssetKind.Image }).ToList();

        var changed = new List<AnimAssignment>();
        foreach (var dir in rows.GroupBy(r => r.ParentDir))
        {
            var files = dir.Select(r => (r.Id, r.Name)).ToList();
            var stored = dir.ToDictionary(r => r.Id, r => (r.Group, r.Clip, r.Frame));
            var leaf = dir.Key[(dir.Key.LastIndexOf('/') + 1)..]; // имя самого каталога
            foreach (var a in AnimationDetector.DetectDirectory(leaf, files))
            {
                var (group, clip, frame) = stored[a.Id];
                if (group != a.Group || clip != a.Clip || frame != a.Frame)
                    changed.Add(a);
            }
        }

        foreach (var chunk in changed.Chunk(BatchSize))
        {
            using var tx = conn.BeginTransaction();
            using var cmd = conn.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText =
                "UPDATE assets SET anim_group = @group, anim_clip = @clip, anim_frame = @frame WHERE id = @id";
            var pId = cmd.Parameters.Add("@id", SqliteType.Integer);
            var pGroup = cmd.Parameters.Add("@group", SqliteType.Text);
            var pClip = cmd.Parameters.Add("@clip", SqliteType.Text);
            var pFrame = cmd.Parameters.Add("@frame", SqliteType.Integer);

            foreach (var a in chunk)
            {
                pId.Value = a.Id;
                pGroup.Value = (object?)a.Group ?? DBNull.Value;
                pClip.Value = (object?)a.Clip ?? DBNull.Value;
                pFrame.Value = (object?)a.Frame ?? DBNull.Value;
                cmd.ExecuteNonQuery();
            }
            tx.Commit();
        }

        return changed.Count;
    }
}
