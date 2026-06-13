using System.Reflection;
using Microsoft.Data.Sqlite;

namespace AssetsBoss.Core.Data;

/// <summary>
/// Фабрика соединений + миграции. Версия схемы хранится в PRAGMA user_version;
/// миграции — нумерованные SQL-блоки, применяются последовательно при старте.
/// </summary>
public sealed class Db
{
    private readonly string _connectionString;

    public Db(string dbFile)
    {
        _connectionString = new SqliteConnectionStringBuilder
        {
            DataSource = dbFile,
            DefaultTimeout = 5,
        }.ToString();
    }

    public SqliteConnection Open()
    {
        var conn = new SqliteConnection(_connectionString);
        conn.Open();
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;";
        cmd.ExecuteNonQuery();
        return conn;
    }

    public void Migrate()
    {
        using var conn = Open();

        using (var walCmd = conn.CreateCommand())
        {
            walCmd.CommandText = "PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;";
            walCmd.ExecuteNonQuery();
        }

        var version = GetUserVersion(conn);
        if (version >= Migrations.Length) return;

        for (var v = version; v < Migrations.Length; v++)
        {
            using var tx = conn.BeginTransaction();
            using var cmd = conn.CreateCommand();
            cmd.Transaction = tx;
            cmd.CommandText = Migrations[v];
            cmd.ExecuteNonQuery();
            cmd.CommandText = $"PRAGMA user_version = {v + 1};";
            cmd.ExecuteNonQuery();
            tx.Commit();
        }
    }

    private static long GetUserVersion(SqliteConnection conn)
    {
        using var cmd = conn.CreateCommand();
        cmd.CommandText = "PRAGMA user_version;";
        return (long)cmd.ExecuteScalar()!;
    }

    private static readonly string[] Migrations =
    [
        LoadEmbedded("Schema.sql"),
        LoadEmbedded("Migration2.sql"),
        LoadEmbedded("Migration3.sql"),
    ];

    private static string LoadEmbedded(string name)
    {
        var assembly = Assembly.GetExecutingAssembly();
        var resource = assembly.GetManifestResourceNames()
            .Single(r => r.EndsWith(name, StringComparison.OrdinalIgnoreCase));
        using var stream = assembly.GetManifestResourceStream(resource)!;
        using var reader = new StreamReader(stream);
        return reader.ReadToEnd();
    }
}
