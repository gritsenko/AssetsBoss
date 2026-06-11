using System.Collections.Concurrent;
using System.Threading.Channels;
using AssetsBoss.Core.Data;
using AssetsBoss.Core.Providers;
using Microsoft.Extensions.Logging;

namespace AssetsBoss.Core.Indexing;

public enum ScanState { Queued, Running, Done, Failed }

public sealed class ScanStatus
{
    public long SourceId { get; init; }
    public ScanState State { get; set; }
    public int Seen { get; set; }
    public int Added { get; set; }
    public int Updated { get; set; }
    public int Removed { get; set; }
    public string? CurrentDir { get; set; }
    public DateTimeOffset? StartedAt { get; set; }
    public DateTimeOffset? FinishedAt { get; set; }
    public double? ElapsedSeconds { get; set; }
    public string? Error { get; set; }
}

/// <summary>
/// Очередь сканов: один скан выполняется в один момент времени, повторная постановка
/// уже стоящего в очереди источника игнорируется. Статусы хранятся в памяти и
/// опрашиваются фронтом через polling.
/// </summary>
public sealed class ScanService : IDisposable
{
    private readonly SourceRepository _sources;
    private readonly IndexScanner _scanner;
    private readonly ProviderRegistry _providers;
    private readonly ILogger<ScanService> _log;

    private readonly Channel<long> _queue = Channel.CreateUnbounded<long>();
    private readonly ConcurrentDictionary<long, ScanStatus> _statuses = new();
    private readonly CancellationTokenSource _cts = new();
    private readonly Task _worker;

    public ScanService(
        SourceRepository sources, IndexScanner scanner,
        ProviderRegistry providers, ILogger<ScanService> log)
    {
        _sources = sources;
        _scanner = scanner;
        _providers = providers;
        _log = log;
        _worker = Task.Run(WorkerLoopAsync);
    }

    public IReadOnlyCollection<ScanStatus> Statuses => _statuses.Values.ToList();

    public bool EnqueueRescan(long sourceId)
    {
        var status = _statuses.GetOrAdd(sourceId, id => new ScanStatus { SourceId = id, State = ScanState.Done });
        lock (status)
        {
            if (status.State is ScanState.Queued or ScanState.Running) return false;
            _statuses[sourceId] = new ScanStatus { SourceId = sourceId, State = ScanState.Queued };
        }
        return _queue.Writer.TryWrite(sourceId);
    }

    private async Task WorkerLoopAsync()
    {
        await foreach (var sourceId in _queue.Reader.ReadAllAsync(_cts.Token))
        {
            var status = _statuses[sourceId];
            var src = _sources.GetById(sourceId);
            if (src is null)
            {
                _statuses.TryRemove(sourceId, out _);
                continue;
            }

            status.State = ScanState.Running;
            status.StartedAt = DateTimeOffset.UtcNow;
            try
            {
                var provider = _providers.Get(src.Scheme);
                var result = await _scanner.ScanAsync(src, provider, status, _cts.Token);
                status.State = ScanState.Done;
                status.ElapsedSeconds = result.Elapsed.TotalSeconds;
                _log.LogInformation(
                    "Scan of '{Name}' done in {Elapsed:F1}s: seen={Seen} added={Added} updated={Updated} removed={Removed}",
                    src.Name, result.Elapsed.TotalSeconds, result.Seen, result.Added, result.Updated, result.Removed);
            }
            catch (OperationCanceledException) when (_cts.IsCancellationRequested)
            {
                status.State = ScanState.Failed;
                status.Error = "cancelled";
                break;
            }
            catch (Exception ex)
            {
                status.State = ScanState.Failed;
                status.Error = ex.Message;
                _log.LogError(ex, "Scan of '{Name}' failed", src.Name);
            }
            finally
            {
                status.CurrentDir = null;
                status.FinishedAt = DateTimeOffset.UtcNow;
            }
        }
    }

    public void Dispose()
    {
        _cts.Cancel();
        _queue.Writer.TryComplete();
        try { _worker.Wait(TimeSpan.FromSeconds(2)); } catch { /* shutdown */ }
        _cts.Dispose();
    }
}
