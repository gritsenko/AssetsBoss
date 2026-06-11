namespace AssetsBoss.Core.Domain;

public sealed record SourceConfig(
    long Id,
    string Name,
    string Scheme,
    string Root,
    string? ConfigJson,
    long CreatedAt,
    long? LastScanAt);
