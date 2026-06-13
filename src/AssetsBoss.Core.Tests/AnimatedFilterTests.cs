using AssetsBoss.Core.Data;
using AssetsBoss.Core.Domain;
using AssetsBoss.Core.Indexing;
using Dapper;

namespace AssetsBoss.Core.Tests;

public class AnimatedFilterTests : IDisposable
{
    private readonly string _dbFile = Path.Combine(Path.GetTempPath(), $"ab-animflag-{Guid.NewGuid():N}.db");
    private readonly Db _db;

    public AnimatedFilterTests()
    {
        _db = new Db(_dbFile);
        _db.Migrate();
        using var conn = _db.Open();
        conn.Execute("INSERT INTO sources(id, name, scheme, root, created_at) VALUES (1, 't', 'fake', 'x', 0)");

        // секвенция кадров (anim_group проставит Recompute) + одиночки разной природы
        var names = new[]
        {
            "anim/run_01.png", "anim/run_02.png", "anim/run_03.png", // → одна группа
            "anim/loading.gif",  // анимированная одиночка → is_animated = 1
            "anim/spinner.gif",  // статичная одиночка → is_animated = 0
            "anim/icon.png",     // статичная картинка, флаг неизвестен (NULL)
            "anim/photo.jpg",    // статичная картинка
        };
        foreach (var rel in names)
        {
            var name = rel[(rel.IndexOf('/') + 1)..];
            conn.Execute(
                """
                INSERT INTO assets(source_id, rel_path, parent_dir, name, ext, kind, size, mtime)
                VALUES (1, @rel, 'anim', @name, @ext, @kind, 10, 100)
                """,
                new
                {
                    rel,
                    name,
                    ext = Path.GetExtension(name),
                    kind = (int)AssetKinds.FromExtension(Path.GetExtension(name)),
                });
        }

        AnimationIndexer.Recompute(conn, 1);
        conn.Execute("UPDATE assets SET is_animated = 1 WHERE name = 'loading.gif'");
        conn.Execute("UPDATE assets SET is_animated = 0 WHERE name = 'spinner.gif'");
    }

    public void Dispose()
    {
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        try { File.Delete(_dbFile); } catch { /* windows file lock */ }
    }

    [Fact]
    public void AnimatedOnly_Grouped_KeepsSequencesAndAnimatedSingles()
    {
        var repo = new AssetRepository(_db);
        var page = repo.Query(new AssetQuery(1, null, true, null, null, 0, 100, Grouped: true, AnimatedOnly: true));

        // run-секвенция схлопывается в группу + анимированный loading.gif; статика отброшена
        Assert.Equal(2, page.Total);
        Assert.Contains(page.Items, i => i.AnimGroup == "run" && i.FrameCount == 3);
        Assert.Contains(page.Items, i => i.Name == "loading.gif");
        Assert.DoesNotContain(page.Items, i => i.Name is "spinner.gif" or "icon.png" or "photo.jpg");
    }

    [Fact]
    public void AnimatedOnly_Ungrouped_ReturnsEveryAnimatedFrame()
    {
        var repo = new AssetRepository(_db);
        var page = repo.Query(new AssetQuery(1, null, true, null, null, 0, 100, AnimatedOnly: true));

        // 3 кадра run + loading.gif
        Assert.Equal(4, page.Total);
        Assert.DoesNotContain(page.Items, i => i.Name is "spinner.gif" or "icon.png" or "photo.jpg");
    }

    [Fact]
    public void WithoutAnimatedFilter_ReturnsEverything()
    {
        var repo = new AssetRepository(_db);
        var page = repo.Query(new AssetQuery(1, null, true, null, null, 0, 100));
        Assert.Equal(7, page.Total);
    }
}
