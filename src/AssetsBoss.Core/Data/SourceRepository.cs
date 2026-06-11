using AssetsBoss.Core.Domain;
using Dapper;

namespace AssetsBoss.Core.Data;

public sealed class SourceRepository(Db db)
{
    public IReadOnlyList<SourceConfig> GetAll()
    {
        using var conn = db.Open();
        return conn.Query<SourceConfig>(
            """
            SELECT id, name, scheme, root, config_json AS configJson,
                   created_at AS createdAt, last_scan_at AS lastScanAt
            FROM sources ORDER BY name
            """).ToList();
    }

    public SourceConfig? GetById(long id)
    {
        using var conn = db.Open();
        return conn.QuerySingleOrDefault<SourceConfig>(
            """
            SELECT id, name, scheme, root, config_json AS configJson,
                   created_at AS createdAt, last_scan_at AS lastScanAt
            FROM sources WHERE id = @id
            """, new { id });
    }

    public SourceConfig Add(string name, string scheme, string root)
    {
        using var conn = db.Open();
        var now = DateTimeOffset.UtcNow.ToUnixTimeSeconds();
        var id = conn.ExecuteScalar<long>(
            """
            INSERT INTO sources(name, scheme, root, created_at)
            VALUES (@name, @scheme, @root, @now);
            SELECT last_insert_rowid();
            """, new { name, scheme, root, now });
        return new SourceConfig(id, name, scheme, root, null, now, null);
    }

    public bool Delete(long id)
    {
        using var conn = db.Open();
        return conn.Execute("DELETE FROM sources WHERE id = @id", new { id }) > 0;
    }

    public void TouchLastScan(long id)
    {
        using var conn = db.Open();
        conn.Execute("UPDATE sources SET last_scan_at = @now WHERE id = @id",
            new { id, now = DateTimeOffset.UtcNow.ToUnixTimeSeconds() });
    }
}
