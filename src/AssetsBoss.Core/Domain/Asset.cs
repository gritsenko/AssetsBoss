namespace AssetsBoss.Core.Domain;

public sealed class Asset
{
    public long Id { get; init; }
    public long SourceId { get; init; }
    public string RelPath { get; init; } = "";
    public string ParentDir { get; init; } = "";
    public string Name { get; init; } = "";
    public string Ext { get; init; } = "";
    public AssetKind Kind { get; init; }
    public long Size { get; init; }
    public long Mtime { get; init; }
    public int? Width { get; init; }
    public int? Height { get; init; }
}
