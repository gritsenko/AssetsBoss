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
    int Limit);

public sealed record AssetPage(IReadOnlyList<Asset> Items, int Total);

public sealed record DirNode(string Path, string Name, bool HasChildren);

public sealed class AssetRepository(Db db)
{
    private const string AssetColumns =
        """
        a.id, a.source_id AS sourceId, a.rel_path AS relPath, a.parent_dir AS parentDir,
        a.name, a.ext, a.kind, a.size, a.mtime, a.width, a.height
        """;

    public Asset? GetById(long id)
    {
        using var conn = db.Open();
        return conn.QuerySingleOrDefault<Asset>(
            $"SELECT {AssetColumns} FROM assets a WHERE a.id = @id", new { id });
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
        var total = conn.ExecuteScalar<int>($"SELECT COUNT(*) FROM {from} {where}", p);

        p.Add("limit", q.Limit);
        p.Add("offset", q.Offset);
        var order = fts is not null ? "ORDER BY rank, a.name" : "ORDER BY a.name";
        var items = conn.Query<Asset>(
            $"SELECT {AssetColumns} FROM {from} {where} {order} LIMIT @limit OFFSET @offset", p).ToList();

        return new AssetPage(items, total);
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
