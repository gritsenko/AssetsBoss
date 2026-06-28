using AssetsBoss.Core.Data;
using AssetsBoss.Core.Domain;
using Dapper;

namespace AssetsBoss.Core.Tests;

public class AudioWaveformTests : IDisposable
{
    private readonly string _dbFile = Path.Combine(Path.GetTempPath(), $"ab-waveform-{Guid.NewGuid():N}.db");
    private readonly Db _db;
    private readonly AssetRepository _repo;
    private const long AudioId = 1;
    private const long Mtime = 100;

    public AudioWaveformTests()
    {
        _db = new Db(_dbFile);
        _db.Migrate();
        using var conn = _db.Open();
        conn.Execute("INSERT INTO sources(id, name, scheme, root, created_at) VALUES (1, 't', 'fake', 'x', 0)");
        conn.Execute(
            """
            INSERT INTO assets(id, source_id, rel_path, parent_dir, name, ext, kind, size, mtime)
            VALUES (@id, 1, 'sfx/shot.wav', 'sfx', 'shot.wav', '.wav', @kind, 10, @mtime)
            """,
            new { id = AudioId, kind = (int)AssetKind.Audio, mtime = Mtime });
        _repo = new AssetRepository(_db);
    }

    public void Dispose()
    {
        Microsoft.Data.Sqlite.SqliteConnection.ClearAllPools();
        try { File.Delete(_dbFile); } catch { /* windows file lock */ }
    }

    [Fact]
    public void SaveThenGet_RoundTrips()
    {
        var peaks = new byte[] { 0, 64, 128, 255, 32 };
        _repo.SaveWaveform(AudioId, Mtime, 4200, peaks);

        var wf = _repo.GetWaveform(AudioId);
        Assert.NotNull(wf);
        Assert.Equal(Mtime, wf!.Mtime);
        Assert.Equal(4200, wf.DurationMs);
        Assert.Equal(peaks, wf.Peaks);
    }

    [Fact]
    public void Save_SurfacesDurationOnAssetDto()
    {
        _repo.SaveWaveform(AudioId, Mtime, 4200, [1, 2, 3]);

        Assert.Equal(4200, _repo.GetById(AudioId)!.DurationMs);
        var page = _repo.Query(new AssetQuery(1, null, true, null, null, 0, 100));
        Assert.Equal(4200, page.Items.Single(i => i.Id == AudioId).DurationMs);
    }

    [Fact]
    public void StaleMtime_HidesDurationButKeepsRow()
    {
        _repo.SaveWaveform(AudioId, Mtime, 4200, [1, 2, 3]);
        using (var conn = _db.Open())
            conn.Execute("UPDATE assets SET mtime = 200 WHERE id = @id", new { id = AudioId });

        // длительность не подтягивается, пока mtime волны не совпадает с файлом
        Assert.Null(_repo.GetById(AudioId)!.DurationMs);
        // но строка кэша на месте — вызывающий сам решает по mtime, перестраивать ли её
        Assert.Equal(Mtime, _repo.GetWaveform(AudioId)!.Mtime);

        // пересчёт под новый mtime — длительность снова видна
        _repo.SaveWaveform(AudioId, 200, 5000, [4, 5, 6]);
        Assert.Equal(5000, _repo.GetById(AudioId)!.DurationMs);
    }

    [Fact]
    public void Save_IsUpsert()
    {
        _repo.SaveWaveform(AudioId, Mtime, 4200, [1, 2, 3]);
        _repo.SaveWaveform(AudioId, Mtime, 7000, [9, 9]);

        var wf = _repo.GetWaveform(AudioId)!;
        Assert.Equal(7000, wf.DurationMs);
        Assert.Equal(new byte[] { 9, 9 }, wf.Peaks);
    }
}
