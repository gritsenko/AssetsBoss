using AssetsBoss.Core.Data;
using AssetsBoss.Core.Domain;
using AssetsBoss.Core.Indexing;
using AssetsBoss.Core.Providers;
using Dapper;

namespace AssetsBoss.Core.Tests;

public class IndexScannerTests : IDisposable
{
    private readonly string _dbFile = Path.Combine(Path.GetTempPath(), $"ab-test-{Guid.NewGuid():N}.db");
    private readonly Db _db;
    private readonly SourceConfig _src;

    public IndexScannerTests()
    {
        _db = new Db(_dbFile);
        _db.Migrate();
        using var conn = _db.Open();
        conn.Execute("INSERT INTO sources(id, name, scheme, root, created_at) VALUES (1, 't', 'fake', 'x', 0)");
        _src = new SourceConfig(1, "t", "fake", "x", null, 0, null);
    }

    public void Dispose()
    {
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        try { File.Delete(_dbFile); } catch { /* windows file lock */ }
    }

    private async Task<ScanStatus> Scan(params ProviderItem[] items)
    {
        var status = new ScanStatus { SourceId = 1, State = ScanState.Running };
        await new IndexScanner(_db).ScanAsync(_src, new FakeProvider(items), status, CancellationToken.None);
        return status;
    }

    [Fact]
    public async Task FirstScan_AddsEverything()
    {
        var status = await Scan(
            new ProviderItem("a/one.png", 10, 100),
            new ProviderItem("a/b/two.wav", 20, 100),
            new ProviderItem("three.txt", 30, 100));

        Assert.Equal(3, status.Added);
        Assert.Equal(0, status.Updated);
        Assert.Equal(0, status.Removed);

        using var conn = _db.Open();
        Assert.Equal(3, conn.ExecuteScalar<int>("SELECT COUNT(*) FROM assets"));
        // дерево dirs: a и a/b (с цепочкой родителей)
        var dirs = conn.Query<string>("SELECT path FROM dirs ORDER BY path").ToList();
        Assert.Equal(["a", "a/b"], dirs);
        // FTS синхронизирован триггером
        Assert.Equal(1, conn.ExecuteScalar<int>(
            "SELECT COUNT(*) FROM assets_fts WHERE assets_fts MATCH '\"two\"*'"));
    }

    [Fact]
    public async Task SecondScan_NoChanges_IsNoop()
    {
        ProviderItem[] items = [new("a/one.png", 10, 100), new("two.txt", 20, 100)];
        await Scan(items);
        var status = await Scan(items);

        Assert.Equal(2, status.Seen);
        Assert.Equal(0, status.Added);
        Assert.Equal(0, status.Updated);
        Assert.Equal(0, status.Removed);
    }

    [Fact]
    public async Task ChangedFile_IsUpdated_AndDimensionsReset()
    {
        await Scan(new ProviderItem("one.png", 10, 100));
        using (var conn = _db.Open())
            conn.Execute("UPDATE assets SET width = 64, height = 64");

        var status = await Scan(new ProviderItem("one.png", 10, 999)); // другой mtime

        Assert.Equal(1, status.Updated);
        using var check = _db.Open();
        var (mtime, width) = check.QuerySingle<(long, int?)>("SELECT mtime, width FROM assets");
        Assert.Equal(999, mtime);
        Assert.Null(width); // размеры пересчитает следующая миниатюра
    }

    [Fact]
    public async Task MissingFile_IsRemoved_WithDirsAndFts()
    {
        await Scan(new ProviderItem("a/one.png", 10, 100), new ProviderItem("two.txt", 20, 100));
        var status = await Scan(new ProviderItem("two.txt", 20, 100));

        Assert.Equal(1, status.Removed);
        using var conn = _db.Open();
        Assert.Equal(1, conn.ExecuteScalar<int>("SELECT COUNT(*) FROM assets"));
        Assert.Equal(0, conn.ExecuteScalar<int>("SELECT COUNT(*) FROM dirs")); // папка 'a' опустела
        Assert.Equal(0, conn.ExecuteScalar<int>(
            "SELECT COUNT(*) FROM assets_fts WHERE assets_fts MATCH '\"one\"*'"));
    }

    [Fact]
    public async Task CaseOnlyRename_TreatedAsSameFile()
    {
        await Scan(new ProviderItem("Sprites/Hero.png", 10, 100));
        var status = await Scan(new ProviderItem("sprites/hero.png", 10, 100));

        Assert.Equal(0, status.Added);
        Assert.Equal(0, status.Removed);
    }

    [Fact]
    public void GetParentDir_Works()
    {
        Assert.Equal("a/b", IndexScanner.GetParentDir("a/b/c.png"));
        Assert.Equal("", IndexScanner.GetParentDir("c.png"));
    }

    [Fact]
    public void AddDirChain_AddsAllAncestors()
    {
        var dirs = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        IndexScanner.AddDirChain(dirs, "a/b/c");
        Assert.Equal(["a", "a/b", "a/b/c"], dirs.Order().ToList());
    }

    private sealed class FakeProvider(ProviderItem[] items) : IAssetProvider
    {
        public string Scheme => "fake";
        public ProviderCaps Caps => ProviderCaps.None;

        public async IAsyncEnumerable<ProviderItem> EnumerateAsync(
            SourceConfig src, IProgress<string>? currentDir,
            [System.Runtime.CompilerServices.EnumeratorCancellation] CancellationToken ct)
        {
            foreach (var item in items)
            {
                yield return item;
            }
            await Task.CompletedTask;
        }

        public Task<Stream> OpenReadAsync(SourceConfig src, string relPath, CancellationToken ct) =>
            throw new NotSupportedException();

        public Task<Stream?> OpenThumbnailSourceAsync(SourceConfig src, string relPath, CancellationToken ct) =>
            Task.FromResult<Stream?>(null);

        public string? GetLocalPath(SourceConfig src, string relPath) => null;
        public IDisposable? Watch(SourceConfig src, Action onAnyChange) => null;
    }
}
