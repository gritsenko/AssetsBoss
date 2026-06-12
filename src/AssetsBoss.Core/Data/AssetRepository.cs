using System.Text;
using AssetsBoss.Core.Domain;
using Dapper;

namespace AssetsBoss.Core.Data;

public sealed record AssetQuery(
    long? SourceId,
    string? Dir,
    bool Recursive,
    AssetKind? Kind,
    string? Search,
    int Offset,
    int Limit,
    bool Grouped = false);

public sealed record AssetPage(IReadOnlyList<AssetListItem> Items, int Total);

public sealed record DirNode(string Path, string Name, bool HasChildren);

public sealed record AnimClipDto(string Name, IReadOnlyList<Asset> Frames);

public sealed record AnimGroupDetail(long SourceId, string Dir, string Name, IReadOnlyList<AnimClipDto> Clips);

public sealed class AssetRepository(Db db)
{
    private const string AssetColumns =
        """
        a.id, a.source_id AS sourceId, a.rel_path AS relPath, a.parent_dir AS parentDir,
        a.name, a.ext, a.kind, a.size, a.mtime, a.width, a.height,
        a.anim_group AS animGroup, a.anim_clip AS animClip
        """;

    /// <summary>Ключ группировки строки выдачи: группа анимаций или сам ассет.</summary>
    private const string GroupKey =
        "CASE WHEN a.anim_group IS NULL THEN 'i' || a.id" +
        " ELSE 'g' || a.source_id || '|' || a.parent_dir || '|' || a.anim_group END";

    public Asset? GetById(long id)
    {
        using var conn = db.Open();
        return conn.QuerySingleOrDefault<Asset>(
            $"SELECT {AssetColumns}, a.anim_frame AS animFrame FROM assets a WHERE a.id = @id", new { id });
    }

    public AssetPage Query(AssetQuery q)
    {
        var where = new StringBuilder("WHERE 1=1");
        var p = new DynamicParameters();

        var fts = BuildFtsQuery(q.Search);
        var from = "assets a";
        if (fts is not null)
        {
            from = "assets_fts f JOIN assets a ON a.id = f.rowid";
            where.Append(" AND assets_fts MATCH @fts");
            p.Add("fts", fts);
        }

        if (q.SourceId is not null)
        {
            where.Append(" AND a.source_id = @sourceId");
            p.Add("sourceId", q.SourceId);
        }

        if (q.Dir is not null)
        {
            if (q.Recursive)
            {
                if (q.Dir.Length > 0)
                {
                    where.Append(" AND (a.parent_dir = @dir OR a.parent_dir LIKE @dirPrefix ESCAPE '\\')");
                    p.Add("dir", q.Dir);
                    p.Add("dirPrefix", EscapeLike(q.Dir) + "/%");
                }
                // recursive от корня — без фильтра по каталогу
            }
            else
            {
                where.Append(" AND a.parent_dir = @dir");
                p.Add("dir", q.Dir);
            }
        }

        if (q.Kind is not null)
        {
            where.Append(" AND a.kind = @kind");
            p.Add("kind", (int)q.Kind);
        }

        using var conn = db.Open();

        if (q.Grouped)
        {
            // Группа схлопывается в одну строку; единственный MIN-агрегат притягивает
            // остальные колонки к строке первого кадра (правило bare columns SQLite),
            // поэтому обложка группы — её первый кадр. Сортировка по имени обложки.
            var totalGrouped = conn.ExecuteScalar<int>(
                $"SELECT COUNT(DISTINCT {GroupKey}) FROM {from} {where}", p);
            p.Add("limit", q.Limit);
            p.Add("offset", q.Offset);
            var grouped = conn.Query<AssetListItem>(
                $"""
                 SELECT {AssetColumns}, MIN(a.anim_frame) AS animFrame,
                        COUNT(*) AS frameCount, COUNT(DISTINCT a.anim_clip) AS clipCount
                 FROM {from} {where}
                 GROUP BY {GroupKey}
                 ORDER BY a.name LIMIT @limit OFFSET @offset
                 """, p).ToList();
            return new AssetPage(grouped, totalGrouped);
        }

        var total = conn.ExecuteScalar<int>($"SELECT COUNT(*) FROM {from} {where}", p);
        p.Add("limit", q.Limit);
        p.Add("offset", q.Offset);

        var order = fts is not null ? "ORDER BY rank, a.name" : "ORDER BY a.name";
        var items = conn.Query<AssetListItem>(
            $"SELECT {AssetColumns}, a.anim_frame AS animFrame FROM {from} {where} {order} LIMIT @limit OFFSET @offset",
            p).ToList();

        return new AssetPage(items, total);
    }

    /// <summary>Полное содержимое группы анимаций: клипы с кадрами в порядке номеров.</summary>
    public AnimGroupDetail? GetAnimGroup(long sourceId, string dir, string name)
    {
        using var conn = db.Open();
        var frames = conn.Query<Asset>(
            $"""
             SELECT {AssetColumns}, a.anim_frame AS animFrame FROM assets a
             WHERE a.source_id = @sourceId AND a.parent_dir = @dir AND a.anim_group = @name
             ORDER BY a.anim_clip, a.anim_frame, a.name
             """, new { sourceId, dir, name }).ToList();
        if (frames.Count == 0) return null;

        var clips = frames
            .GroupBy(f => f.AnimClip!)
            .Select(g => new AnimClipDto(g.Key, g.ToList()))
            .ToList();
        return new AnimGroupDetail(sourceId, dir, name, clips);
    }

    public IReadOnlyList<DirNode> GetChildDirs(long sourceId, string parent)
    {
        using var conn = db.Open();
        // SQLite отдаёт bool как Int64 — маппим кортежем и конвертируем сами
        return conn.Query<(string Path, string Name, long HasChildren)>(
            """
            SELECT d.path,
                   CASE WHEN instr(d.path, '/') = 0 THEN d.path
                        ELSE substr(d.path, length(d.parent) + 2) END AS name,
                   EXISTS(SELECT 1 FROM dirs c WHERE c.source_id = d.source_id AND c.parent = d.path) AS hasChildren
            FROM dirs d
            WHERE d.source_id = @sourceId AND d.parent = @parent
            ORDER BY d.path
            """, new { sourceId, parent })
            .Select(r => new DirNode(r.Path, r.Name, r.HasChildren != 0))
            .ToList();
    }

    public void SetDimensions(long id, int width, int height)
    {
        using var conn = db.Open();
        conn.Execute("UPDATE assets SET width = @width, height = @height WHERE id = @id",
            new { id, width, height });
    }

    /// <summary>
    /// Жёсткая санитизация пользовательского ввода для FTS5: остаются только буквы,
    /// цифры и пробелы; всё прочее (кавычки, минусы, скобки...) — в пробел, иначе
    /// FTS5 кидает syntax error. Каждый токен — префиксный: "fire"* "sword"*.
    /// Возвращает null, если после чистки искать нечего.
    /// </summary>
    public static string? BuildFtsQuery(string? input)
    {
        if (string.IsNullOrWhiteSpace(input)) return null;

        var cleaned = new StringBuilder(input.Length);
        foreach (var ch in input)
            cleaned.Append(char.IsLetterOrDigit(ch) ? ch : ' ');

        var tokens = cleaned.ToString().Split(' ', StringSplitOptions.RemoveEmptyEntries);
        if (tokens.Length == 0) return null;

        return string.Join(" ", tokens.Select(t => $"\"{t}\"*"));
    }

    private static string EscapeLike(string value) =>
        value.Replace("\\", "\\\\").Replace("%", "\\%").Replace("_", "\\_");
}
