using System.Collections.Concurrent;
using AssetsBoss.Core.Data;
using AssetsBoss.Core.Providers;
using Microsoft.Extensions.Logging;

namespace AssetsBoss.Core.Indexing;

/// <summary>
/// Держит по watcher'у на каждый источник с Caps.Watch. Любое событие (включая Error
/// при переполнении буфера) — только «грязный флаг»: дебаунс 2 с тишины → rescan.
/// </summary>
public sealed class WatcherService : IDisposable
{
    private static readonly TimeSpan Debounce = TimeSpan.FromSeconds(2);

    private readonly SourceRepository _sources;
    private readonly ProviderRegistry _providers;
    private readonly ScanService _scans;
    private readonly ILogger<WatcherService> _log;

    private readonly ConcurrentDictionary<long, (IDisposable Watcher, Timer Timer)> _watchers = new();

    public WatcherService(
        SourceRepository sources, ProviderRegistry providers,
        ScanService scans, ILogger<WatcherService> log)
    {
        _sources = sources;
        _providers = providers;
        _scans = scans;
        _log = log;
    }

    /// <summary>Поднимает watcher'ы для всех источников; вызывается при старте и после CRUD источников.</summary>
    public void SyncWatchers()
    {
        var sources = _sources.GetAll();
        var alive = new HashSet<long>(sources.Select(s => s.Id));

        foreach (var id in _watchers.Keys.Where(id => !alive.Contains(id)))
            StopWatching(id);

        foreach (var src in sources)
        {
            if (_watchers.ContainsKey(src.Id)) continue;

            var provider = _providers.Get(src.Scheme);
            if (!provider.Caps.HasFlag(ProviderCaps.Watch)) continue;

            try
            {
                var timer = new Timer(_ =>
                {
                    _log.LogDebug("Watcher debounce fired for source {Id}, enqueue rescan", src.Id);
                    _scans.EnqueueRescan(src.Id);
                });
                var watcher = provider.Watch(src, () => timer.Change(Debounce, Timeout.InfiniteTimeSpan));
                if (watcher is null)
                {
                    timer.Dispose();
                    continue;
                }
                _watchers[src.Id] = (watcher, timer);
                _log.LogInformation("Watching source '{Name}' ({Root})", src.Name, src.Root);
            }
            catch (Exception ex)
            {
                _log.LogWarning(ex, "Failed to watch source '{Name}'", src.Name);
            }
        }
    }

    public void StopWatching(long sourceId)
    {
        if (_watchers.TryRemove(sourceId, out var entry))
        {
            entry.Watcher.Dispose();
            entry.Timer.Dispose();
        }
    }

    public void Dispose()
    {
        foreach (var id in _watchers.Keys.ToList())
            StopWatching(id);
    }
}
