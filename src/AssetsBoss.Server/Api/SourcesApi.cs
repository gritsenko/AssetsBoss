using AssetsBoss.Core.Data;
using AssetsBoss.Core.Indexing;

namespace AssetsBoss.Server.Api;

public sealed record AddSourceRequest(string Name, string Root);

public static class SourcesApi
{
    public static RouteGroupBuilder MapSourcesApi(this RouteGroupBuilder group)
    {
        group.MapGet("/sources", (SourceRepository sources) => sources.GetAll());

        group.MapPost("/sources", (
            AddSourceRequest req, SourceRepository sources,
            ScanService scans, WatcherService watchers) =>
        {
            if (string.IsNullOrWhiteSpace(req.Root) || !Directory.Exists(req.Root))
                return Results.BadRequest(new { error = $"Папка не найдена: {req.Root}" });

            var name = string.IsNullOrWhiteSpace(req.Name)
                ? Path.GetFileName(Path.TrimEndingDirectorySeparator(req.Root))
                : req.Name.Trim();

            if (sources.GetAll().Any(s => string.Equals(s.Root, req.Root, StringComparison.OrdinalIgnoreCase)))
                return Results.Conflict(new { error = "Эта папка уже добавлена" });

            var src = sources.Add(name, "local", Path.GetFullPath(req.Root));
            scans.EnqueueRescan(src.Id);
            watchers.SyncWatchers();
            return Results.Created($"/api/sources/{src.Id}", src);
        });

        group.MapDelete("/sources/{id:long}", (
            long id, SourceRepository sources, WatcherService watchers) =>
        {
            watchers.StopWatching(id);
            return sources.Delete(id) ? Results.NoContent() : Results.NotFound();
        });

        group.MapPost("/sources/{id:long}/scan", (long id, SourceRepository sources, ScanService scans) =>
        {
            if (sources.GetById(id) is null) return Results.NotFound();
            var queued = scans.EnqueueRescan(id);
            return Results.Ok(new { queued });
        });

        return group;
    }
}
