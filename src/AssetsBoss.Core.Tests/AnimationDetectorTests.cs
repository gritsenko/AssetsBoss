using AssetsBoss.Core.Data;
using AssetsBoss.Core.Domain;
using AssetsBoss.Core.Indexing;
using Dapper;

namespace AssetsBoss.Core.Tests;

public class AnimationDetectorTests
{
    [Theory]
    [InlineData("01_attack_sword_0004", "01_attack_sword", 4)]
    [InlineData("frame12", "frame", 12)]
    [InlineData("Run-03", "run", 3)]
    [InlineData("walk 7", "walk", 7)]
    public void ParseFrame_SplitsBaseAndNumber(string stem, string expectedBase, int expectedFrame)
    {
        var parsed = AnimationDetector.ParseFrame(stem);
        Assert.NotNull(parsed);
        Assert.Equal(expectedBase, parsed.Value.Base);
        Assert.Equal(expectedFrame, parsed.Value.Frame);
    }

    [Theory]
    [InlineData("hero")] // нет числового суффикса
    [InlineData("0001")] // имя из одних цифр
    [InlineData("atlas_123456789")] // слишком длинный хвост — не номер кадра
    public void ParseFrame_RejectsNonFrames(string stem)
    {
        Assert.Null(AnimationDetector.ParseFrame(stem));
    }

    private static List<AnimAssignment> Detect(params string[] names) => DetectIn("dir", names);

    private static List<AnimAssignment> DetectIn(string dir, params string[] names) =>
        AnimationDetector.DetectDirectory(
            dir, names.Select((n, i) => ((long)i + 1, n)).ToList());

    [Fact]
    public void DetectDirectory_ClustersClipsIntoCharacters()
    {
        var names = new[]
        {
            "01_attack_sword_0001.png", "01_attack_sword_0002.png", "01_attack_sword_0003.png",
            "01_die_sword_0001.png", "01_die_sword_0002.png", "01_die_sword_0003.png",
            "02_attack_stuff_0001.png", "02_attack_stuff_0002.png", "02_attack_stuff_0003.png",
            "02_die_stuff_0001.png", "02_die_stuff_0002.png", "02_die_stuff_0003.png",
            "hero.png",
            "wall_01.png", "wall_02.png", // всего 2 кадра — не клип
        };
        var result = Detect(names);

        var byName = names.Zip(result).ToDictionary(x => x.First, x => x.Second);
        Assert.Equal("01_*_sword", byName["01_attack_sword_0001.png"].Group);
        Assert.Equal("01_*_sword", byName["01_die_sword_0003.png"].Group);
        Assert.Equal("02_*_stuff", byName["02_attack_stuff_0001.png"].Group);
        Assert.Equal("01_attack_sword", byName["01_attack_sword_0002.png"].Clip);
        Assert.Equal(2, byName["01_attack_sword_0002.png"].Frame);
        Assert.Null(byName["hero.png"].Group);
        Assert.Null(byName["wall_01.png"].Group);
    }

    [Fact]
    public void DetectDirectory_SingleClipIsItsOwnGroup()
    {
        var result = Detect("explosion_01.png", "explosion_02.png", "explosion_03.png", "explosion_04.png");
        Assert.All(result, a =>
        {
            Assert.Equal("explosion", a.Group);
            Assert.Equal("explosion", a.Clip);
        });
    }

    [Fact]
    public void DetectDirectory_RejectsSparseNumbers()
    {
        // суффиксы разрешений, а не кадры: нумерация слишком разрежена
        var result = Detect("grass_512.png", "grass_1024.png", "grass_2048.png");
        Assert.All(result, a => Assert.Null(a.Group));
    }

    [Fact]
    public void DetectDirectory_MixedCaseAndSeparators()
    {
        var result = Detect("Idle-01.png", "idle-02.png", "IDLE-03.png");
        Assert.All(result, a => Assert.Equal("idle", a.Clip));
    }

    [Fact]
    public void DetectDirectory_FolderOfBareNumbersIsOneClip()
    {
        // папка = клип: имена — одни числа без префикса, имя клипа берётся из каталога
        var names = Enumerable.Range(0, 9).Select(i => $"{i:000}.png").ToArray();
        var result = DetectIn("TurnLeft", names);

        Assert.All(result, a =>
        {
            Assert.Equal("TurnLeft", a.Group);
            Assert.Equal("TurnLeft", a.Clip);
        });
        Assert.Equal(Enumerable.Range(0, 9).ToList(), result.Select(a => a.Frame!.Value).ToList());
    }

    [Fact]
    public void DetectDirectory_BareNumbersCoexistWithLooseFiles()
    {
        // обложка-«нечисло» рядом с числовой последовательностью кадром не считается
        var result = DetectIn("Run", "000.png", "001.png", "002.png", "preview.png");
        var byName = new[] { "000.png", "001.png", "002.png", "preview.png" }.Zip(result)
            .ToDictionary(x => x.First, x => x.Second);
        Assert.Equal("Run", byName["001.png"].Clip);
        Assert.Equal(1, byName["001.png"].Frame);
        Assert.Null(byName["preview.png"].Clip);
    }

    [Fact]
    public void DetectDirectory_RejectsSparseBareNumbers()
    {
        // числовые имена, но нумерация разрежена — не последовательность кадров
        var result = DetectIn("sizes", "1.png", "512.png", "2048.png");
        Assert.All(result, a => Assert.Null(a.Clip));
    }

    [Fact]
    public void DetectDirectory_BareNumbersNeedEnoughFrames()
    {
        var result = DetectIn("pair", "000.png", "001.png");
        Assert.All(result, a => Assert.Null(a.Clip));
    }
}

public class AnimationQueryTests : IDisposable
{
    private readonly string _dbFile = Path.Combine(Path.GetTempPath(), $"ab-anim-{Guid.NewGuid():N}.db");
    private readonly Db _db;

    public AnimationQueryTests()
    {
        _db = new Db(_dbFile);
        _db.Migrate();
        using var conn = _db.Open();
        conn.Execute("INSERT INTO sources(id, name, scheme, root, created_at) VALUES (1, 't', 'fake', 'x', 0)");

        var names = new[]
        {
            "anim/01_attack_sword_0001.png", "anim/01_attack_sword_0002.png", "anim/01_attack_sword_0003.png",
            "anim/01_die_sword_0001.png", "anim/01_die_sword_0002.png", "anim/01_die_sword_0003.png",
            "anim/hero.png",
            "other/readme.txt",
        };
        foreach (var rel in names)
        {
            var name = rel[(rel.IndexOf('/') + 1)..];
            conn.Execute(
                """
                INSERT INTO assets(source_id, rel_path, parent_dir, name, ext, kind, size, mtime)
                VALUES (1, @rel, @dir, @name, @ext, @kind, 10, 100)
                """,
                new
                {
                    rel,
                    dir = rel[..rel.IndexOf('/')],
                    name,
                    ext = Path.GetExtension(name),
                    kind = (int)AssetKinds.FromExtension(Path.GetExtension(name)),
                });
        }
        AnimationIndexer.Recompute(conn, 1);
    }

    public void Dispose()
    {
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        try { File.Delete(_dbFile); } catch { /* windows file lock */ }
    }

    [Fact]
    public void GroupedQuery_CollapsesSequencesAndKeepsSingles()
    {
        var repo = new AssetRepository(_db);
        var page = repo.Query(new AssetQuery(1, null, true, null, null, 0, 100, Grouped: true));

        // 6 кадров двух клипов → 1 группа; hero.png и readme.txt — отдельные строки
        Assert.Equal(3, page.Total);

        var group = Assert.Single(page.Items, i => i.AnimGroup is not null);
        Assert.Equal("01_*_sword", group.AnimGroup);
        Assert.Equal(6, group.FrameCount);
        Assert.Equal(2, group.ClipCount);
        // обложка — первый кадр первого клипа
        Assert.Equal("01_attack_sword_0001.png", group.Name);

        var single = Assert.Single(page.Items, i => i.Name == "hero.png");
        Assert.Null(single.AnimGroup);
        Assert.Equal(1, single.FrameCount);
    }

    [Fact]
    public void UngroupedQuery_ReturnsEveryFrame()
    {
        var repo = new AssetRepository(_db);
        var page = repo.Query(new AssetQuery(1, null, true, null, null, 0, 100));
        Assert.Equal(8, page.Total);
        var frame = Assert.Single(page.Items, i => i.Name == "01_die_sword_0002.png");
        Assert.Equal("01_*_sword", frame.AnimGroup);
        Assert.Equal("01_die_sword", frame.AnimClip);
        Assert.Equal(2L, frame.AnimFrame);
    }

    [Fact]
    public void GetAnimGroup_ReturnsClipsWithOrderedFrames()
    {
        var repo = new AssetRepository(_db);
        var detail = repo.GetAnimGroup(1, "anim", "01_*_sword");

        Assert.NotNull(detail);
        Assert.Equal(["01_attack_sword", "01_die_sword"], detail.Clips.Select(c => c.Name).ToList());
        Assert.Equal([1L, 2L, 3L], detail.Clips[0].Frames.Select(f => f.AnimFrame).ToList());

        Assert.Null(repo.GetAnimGroup(1, "anim", "nope"));
    }

    [Fact]
    public void Recompute_RemovedFrames_DowngradeClip()
    {
        using var conn = _db.Open();
        conn.Execute("DELETE FROM assets WHERE name IN ('01_die_sword_0002.png', '01_die_sword_0003.png')");
        AnimationIndexer.Recompute(conn, 1);

        // die-клип сжался до 1 кадра → больше не клип; attack остаётся одиночным клипом
        var rows = conn.Query<(string Name, string? Group)>(
            "SELECT name, anim_group FROM assets WHERE source_id = 1 AND parent_dir = 'anim' ORDER BY name").ToList();
        Assert.Null(rows.Single(r => r.Name == "01_die_sword_0001.png").Group);
        Assert.All(rows.Where(r => r.Name.StartsWith("01_attack")),
            r => Assert.Equal("01_attack_sword", r.Group));
    }
}
