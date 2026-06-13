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
    bool Grouped = false,
    bool AnimatedOnly = false);

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

    /// <summary>
    /// Папка группы моделей: parent_dir с отрезанным хвостовым сегментом-форматом
    /// (FBX/glTF/OBJ/Blends/"GLTF format"…). Так модели одного имени, разложенные по
    /// подпапкам форматов (типичная раскладка ассет-паков), считаются одной группой;
    /// если форматы лежат прямо в папке — сегмент не режется и группировка идёт по ней.
    /// </summary>
    private static string ModelGroupDir(string expr) =>
        $"""
         CASE
           -- подпапки "<ФОРМАТ> format" (раскладка Kenney): срезаем весь сегмент
           WHEN lower({expr}) LIKE '%/gltf format' THEN substr({expr}, 1, length({expr}) - 12)
           WHEN lower({expr}) LIKE '%/fbx format' OR lower({expr}) LIKE '%/glb format'
             OR lower({expr}) LIKE '%/obj format' OR lower({expr}) LIKE '%/dae format'
             OR lower({expr}) LIKE '%/stl format' OR lower({expr}) LIKE '%/3ds format'
             THEN substr({expr}, 1, length({expr}) - 11)
           -- подпапки-форматы (раскладка Quaternius): FBX/glTF/OBJ/Blends
           WHEN lower({expr}) LIKE '%/blends' THEN substr({expr}, 1, length({expr}) - 7)
           WHEN lower({expr}) LIKE '%/blend' THEN substr({expr}, 1, length({expr}) - 6)
           WHEN lower({expr}) LIKE '%/gltf' THEN substr({expr}, 1, length({expr}) - 5)
           WHEN lower({expr}) LIKE '%/fbx' OR lower({expr}) LIKE '%/glb' OR lower({expr}) LIKE '%/obj'
             OR lower({expr}) LIKE '%/dae' OR lower({expr}) LIKE '%/stl' OR lower({expr}) LIKE '%/3ds'
             THEN substr({expr}, 1, length({expr}) - 4)
           -- те же форматные папки прямо в корне источника
           WHEN lower({expr}) IN ('fbx','glb','gltf','obj','dae','stl','3ds','blend','blends',
                                  'fbx format','glb format','gltf format','obj format','dae format','stl format','3ds format')
             THEN ''
           ELSE {expr}
         END
         """;

    /// <summary>basename файла без расширения, в нижнем регистре (для группировки/сравнения).</summary>
    private const string BaseNameLower = "lower(substr(a.name, 1, length(a.name) - length(a.ext)))";

    /// <summary>
    /// Ключ группировки строки выдачи: последовательность анимации (anim_group),
    /// либо набор 3D-моделей с одинаковым именем и форматной папкой (см. <see cref="ModelGroupDir"/>),
    /// либо сам ассет.
    /// </summary>
    private static readonly string GroupKey =
        $"""
         CASE
           WHEN a.anim_group IS NOT NULL THEN 'a|' || a.source_id || '|' || a.parent_dir || '|' || a.anim_group
           WHEN a.kind = {(int)AssetKind.Model} THEN 'm|' || a.source_id || '|' || ({ModelGroupDir("a.parent_dir")}) || '|' || {BaseNameLower}
           ELSE 'i|' || a.id
         END
         """;

    /// <summary>
    /// Ранг строки внутри группы для выбора «обложки» (единственный MIN в запросе тянет к строке
    /// с минимальным рангом все bare-колонки — правило SQLite): у анимаций обложка — первый кадр,
    /// у моделей — приоритетный формат (GLTF → GLB → FBX → OBJ → прочее).
    /// </summary>
    private static readonly string CoverRank =
        $"""
         CASE
           WHEN a.anim_group IS NOT NULL THEN COALESCE(a.anim_frame, 0)
           WHEN a.kind = {(int)AssetKind.Model} THEN
             (CASE lower(a.ext) WHEN '.gltf' THEN 0 WHEN '.glb' THEN 1 WHEN '.fbx' THEN 2 WHEN '.obj' THEN 3 ELSE 4 END)
           ELSE 0
         END
         """;

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

        // фильтр "анимации": последовательности кадров (anim_group) + анимированные одиночки
        if (q.AnimatedOnly)
            where.Append(" AND (a.anim_group IS NOT NULL OR a.is_animated = 1)");

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
            // MIN(coverRank) — единственный min/max в запросе: bare-колонки (id, name, ext…)
            // притягиваются к строке-обложке (первый кадр анимации / приоритетный формат модели)
            var grouped = conn.Query<AssetListItem>(
                $"""
                 SELECT {AssetColumns}, a.anim_frame AS animFrame,
                        COUNT(*) AS frameCount, COUNT(DISTINCT a.anim_clip) AS clipCount,
                        MIN({CoverRank}) AS coverRank
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

    /// <summary>
    /// Варианты 3D-модели: все файлы kind=model с тем же basename и той же группной папкой
    /// (см. <see cref="ModelGroupDir"/>), что и у переданного варианта (<paramref name="dir"/> —
    /// parent_dir любого члена, обычно обложки). Порядок — по приоритету формата (обложка первой).
    /// </summary>
    public IReadOnlyList<Asset> GetModelGroup(long sourceId, string dir, string name)
    {
        using var conn = db.Open();
        return conn.Query<Asset>(
            $"""
             SELECT {AssetColumns}, a.anim_frame AS animFrame FROM assets a
             WHERE a.source_id = @sourceId AND a.kind = {(int)AssetKind.Model}
               AND ({ModelGroupDir("a.parent_dir")}) = ({ModelGroupDir("@dir")})
               AND {BaseNameLower} = lower(@name)
             ORDER BY {CoverRank}, a.name
             """, new { sourceId, dir, name }).ToList();
    }

    /// <summary>
    /// Разнообразная выборка ассетов папки (рекурсивно) для коллажа-превью: вместо первых N
    /// по имени (которые оказываются соседними кадрами одного клипа) берём N равномерно
    /// распределённых по имени — так в превью попадают разные клипы/подпапки/ассеты.
    /// </summary>
    public (IReadOnlyList<AssetListItem> Items, int Total) GetFolderPreview(long sourceId, string dir, int limit)
    {
        using var conn = db.Open();
        var prefix = EscapeLike(dir) + "/%";
        var scope = new { sourceId, dir, prefix };

        var total = conn.ExecuteScalar<int>(
            """
            SELECT COUNT(*) FROM assets
            WHERE source_id = @sourceId AND (parent_dir = @dir OR parent_dir LIKE @prefix ESCAPE '\')
            """, scope);
        if (total == 0) return ([], 0);

        // шаг сэмплирования: каждый stride-й по имени → выборка «растянута» на всю папку
        var stride = total > limit ? total / limit : 1;
        var items = conn.Query<AssetListItem>(
            $"""
             WITH scope AS (
                 SELECT {AssetColumns}, a.anim_frame AS animFrame,
                        ROW_NUMBER() OVER (ORDER BY a.rel_path) - 1 AS rn
                 FROM assets a
                 WHERE a.source_id = @sourceId AND (a.parent_dir = @dir OR a.parent_dir LIKE @prefix ESCAPE '\')
             )
             SELECT * FROM scope WHERE rn % @stride = 0 ORDER BY rn LIMIT @limit
             """, new { sourceId, dir, prefix, stride, limit }).ToList();

        return (items, total);
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
