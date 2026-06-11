using AssetsBoss.Core.Indexing;

namespace AssetsBoss.Server.Api;

public static class ScanApi
{
    public static RouteGroupBuilder MapScanApi(this RouteGroupBuilder group)
    {
        group.MapGet("/scan/status", (ScanService scans) => scans.Statuses);
        return group;
    }
}
