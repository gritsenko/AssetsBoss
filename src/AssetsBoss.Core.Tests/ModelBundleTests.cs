using AssetsBoss.Core.Data;
using AssetsBoss.Core.Domain;
using Dapper;

namespace AssetsBoss.Core.Tests;

/// <summary>
/// Резолв companion-файлов модели (<see cref="AssetRepository.GetModelBundle"/>) на трёх типичных
/// раскладках: Unity-папка на модель с TGA рядом, текстуры в под-папке Materials/, и Blender-экспорт
/// по форматным папкам (общий атлас, встроенные анимации, соседние модели — не клипы).
/// </summary>
public class ModelBundleTests : IDisposable
{
    private readonly string _dbFile = Path.Combine(Path.GetTempPath(), $"ab-bundle-{Guid.NewGuid():N}.db");
    private readonly Db _db;

    public ModelBundleTests()
    {
        _db = new Db(_dbFile);
        _db.Migrate();
        using var conn = _db.Open();
        conn.Execute("INSERT INTO sources(id, name, scheme, root, created_at) VALUES (1, 't', 'fake', 'x', 0)");

        // Unity-волк: меш + TGA рядом (Model/), анимации отдельными FBX (Animations/), риг-хаб
        Insert(conn, 1, "Wolf_grey/Model/animal_wolf_grey.fbx");
        Insert(conn, 2, "Wolf_grey/Model/Wolf_grey_DS.tga");
        Insert(conn, 3, "Wolf_grey/Model/Wolf_grey_N.tga");
        Insert(conn, 4, "Wolf_grey/Model/Wolf_grey_EM.tga");
        Insert(conn, 5, "Wolf_grey/Animations/animal_wolf_greywolf_idle01.fbx");
        Insert(conn, 6, "Wolf_grey/Animations/animal_wolf_greywolf_walk_01.fbx");
        Insert(conn, 7, "Wolf_grey/Animations/animal_wolf_grey_hub.fbx"); // риг-хаб → не клип

        // Оружие: текстуры в под-папке Materials/, анимации в Animations/
        Insert(conn, 10, "wp_nailgun_01/wp_nailgun_01.fbx");
        Insert(conn, 11, "wp_nailgun_01/Materials/wp_nailgun_01_DF.png");
        Insert(conn, 12, "wp_nailgun_01/Materials/wp_nailgun_01_NM.png");
        Insert(conn, 13, "wp_nailgun_01/Animations/wp_nailgun_01_Idle.fbx");
        Insert(conn, 14, "wp_nailgun_01/Animations/wp_nailgun_01_Shot.fbx");

        // Blender-экспорт: форматные папки, общий атлас, соседняя модель Birb (НЕ анимация Alien)
        Insert(conn, 20, "Free/Big/FBX/Alien.fbx");
        Insert(conn, 21, "Free/Big/FBX/Birb.fbx");
        Insert(conn, 22, "Free/Big/Blends/Atlas_Monsters.png");
        Insert(conn, 23, "Free/Big/glTF/Alien.gltf");
    }

    private static void Insert(Microsoft.Data.Sqlite.SqliteConnection conn, long id, string rel)
    {
        var slash = rel.LastIndexOf('/');
        var name = rel[(slash + 1)..];
        var ext = Path.GetExtension(name);
        conn.Execute(
            """
            INSERT INTO assets(id, source_id, rel_path, parent_dir, name, ext, kind, size, mtime)
            VALUES (@id, 1, @rel, @parentDir, @name, @ext, @kind, 10, 100)
            """,
            new
            {
                id,
                rel,
                parentDir = rel[..slash],
                name,
                ext,
                kind = (int)AssetKinds.FromExtension(ext),
            });
    }

    public void Dispose()
    {
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        try { File.Delete(_dbFile); } catch { /* windows file lock */ }
    }

    [Fact]
    public void UnityLayout_FindsSiblingTexturesAndExternalAnimations()
    {
        var repo = new AssetRepository(_db);
        var bundle = repo.GetModelBundle(repo.GetById(1)!);

        // три TGA из соседней Model/ (scope срезал role-папку до Wolf_grey)
        Assert.Equal(
            new[] { "Wolf_grey_DS.tga", "Wolf_grey_N.tga", "Wolf_grey_EM.tga" }.OrderBy(x => x),
            bundle.Textures.Select(t => t.Name).OrderBy(x => x));

        // клипы из Animations/, хаб исключён, сам меш исключён
        Assert.Equal(
            new[] { "animal_wolf_greywolf_idle01.fbx", "animal_wolf_greywolf_walk_01.fbx" }.OrderBy(x => x),
            bundle.Animations.Select(a => a.Name).OrderBy(x => x));
        Assert.DoesNotContain(bundle.Animations, a => a.Name.Contains("_hub"));
        Assert.DoesNotContain(bundle.Animations, a => a.Name == "animal_wolf_grey.fbx");
    }

    [Fact]
    public void SubfolderTextures_AreDiscovered()
    {
        var repo = new AssetRepository(_db);
        var bundle = repo.GetModelBundle(repo.GetById(10)!);

        // текстуры лежат в под-папке Materials/ относительно меша — всё равно находятся
        Assert.Equal(
            new[] { "wp_nailgun_01_DF.png", "wp_nailgun_01_NM.png" }.OrderBy(x => x),
            bundle.Textures.Select(t => t.Name).OrderBy(x => x));
        Assert.Equal(2, bundle.Animations.Count);
    }

    [Fact]
    public void BlenderLayout_SharesAtlas_AndDoesNotMistakeOtherModelsForAnimations()
    {
        var repo = new AssetRepository(_db);
        var bundle = repo.GetModelBundle(repo.GetById(20)!);

        // общий атлас находится через форматные папки (scope = Free/Big)
        Assert.Contains(bundle.Textures, t => t.Name == "Atlas_Monsters.png");
        // соседняя модель Birb — не анимация Alien; встроенные анимации внешних FBX не дают
        Assert.Empty(bundle.Animations);
    }
}
