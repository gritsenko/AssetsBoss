namespace AssetsBoss.Server;

public sealed class FolderBrowserService(Func<Task<string?>>? browse)
{
    public bool IsAvailable => browse is not null;
    public Task<string?> BrowseAsync() => browse?.Invoke() ?? Task.FromResult<string?>(null);
}
