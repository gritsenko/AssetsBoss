using AssetsBoss.Core.Domain;
using AssetsBoss.Core.Providers;

namespace AssetsBoss.Core.Tests;

public sealed class LocalFolderProviderTests : IDisposable
{
    private readonly string _base = Path.Combine(Path.GetTempPath(), "ab-lfp-" + Guid.NewGuid().ToString("N")[..8]);
    private readonly string _root;
    private readonly LocalFolderProvider _provider = new();

    public LocalFolderProviderTests()
    {
        _root = Path.Combine(_base, "assets");
        Directory.CreateDirectory(Path.Combine(_root, "models"));
        File.WriteAllText(Path.Combine(_root, "models", "texture.png"), "ok");

        // sibling-папка с тем же префиксом имени + секрет снаружи корня
        Directory.CreateDirectory(Path.Combine(_base, "assets-secret"));
        File.WriteAllText(Path.Combine(_base, "assets-secret", "config.ini"), "SECRET");
    }

    private SourceConfig Src => new(1, "t", "local", _root, null, 0, null);

    [Fact]
    public void Resolves_FileInsideRoot()
    {
        var p = _provider.GetLocalPath(Src, "models/texture.png");
        Assert.NotNull(p);
        Assert.Equal("ok", File.ReadAllText(p!));
    }

    [Theory]
    [InlineData("../assets-secret/config.ini")]   // sibling-prefix escape (forward slashes)
    [InlineData("..\\assets-secret\\config.ini")] // sibling-prefix escape (backslashes, the %5C exploit)
    [InlineData("../../Windows/win.ini")]          // climb out entirely
    public void Blocks_TraversalOutsideRoot(string relPath)
    {
        Assert.Null(_provider.GetLocalPath(Src, relPath));
    }

    [Fact]
    public void Blocks_RootedAndDriveQualifiedInput()
    {
        // абсолютный путь выкинул бы корень из Path.Combine
        Assert.Null(_provider.GetLocalPath(Src, "/etc/passwd"));
        Assert.Null(_provider.GetLocalPath(Src, "C:\\Windows\\win.ini"));
        // ':' — альтернативный поток NTFS
        Assert.Null(_provider.GetLocalPath(Src, "models/texture.png:stream"));
    }

    [Fact]
    public void Returns_NullForMissingFile()
    {
        Assert.Null(_provider.GetLocalPath(Src, "models/nope.png"));
    }

    public void Dispose()
    {
        try { Directory.Delete(_base, recursive: true); } catch { /* best effort */ }
    }
}
