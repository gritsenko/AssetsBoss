namespace AssetsBoss.Core.Providers;

public sealed class ProviderRegistry
{
    private readonly Dictionary<string, IAssetProvider> _providers;

    public ProviderRegistry(IEnumerable<IAssetProvider> providers)
    {
        _providers = providers.ToDictionary(p => p.Scheme, StringComparer.OrdinalIgnoreCase);
    }

    public IAssetProvider Get(string scheme) =>
        _providers.TryGetValue(scheme, out var p)
            ? p
            : throw new InvalidOperationException($"Unknown provider scheme '{scheme}'");
}
