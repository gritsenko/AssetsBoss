using AssetsBoss.Core.Thumbnails;

namespace AssetsBoss.Core.Tests;

public class ThumbnailKeyTests
{
    [Fact]
    public void CaseInsensitive_OnWindowsPaths() =>
        Assert.Equal(
            ThumbnailService.CacheKey(1, "Textures/FOO.png", 100, 200),
            ThumbnailService.CacheKey(1, "textures/foo.png", 100, 200));

    [Fact]
    public void SlashesNormalized() =>
        Assert.Equal(
            ThumbnailService.CacheKey(1, @"textures\foo.png", 100, 200),
            ThumbnailService.CacheKey(1, "textures/foo.png", 100, 200));

    [Fact]
    public void DifferentMtime_DifferentKey() =>
        Assert.NotEqual(
            ThumbnailService.CacheKey(1, "a.png", 100, 200),
            ThumbnailService.CacheKey(1, "a.png", 101, 200));

    [Fact]
    public void DifferentSource_DifferentKey() =>
        Assert.NotEqual(
            ThumbnailService.CacheKey(1, "a.png", 100, 200),
            ThumbnailService.CacheKey(2, "a.png", 100, 200));

    [Fact]
    public void KeyIsLowercaseHex() =>
        Assert.Matches("^[0-9a-f]{40}$", ThumbnailService.CacheKey(1, "a.png", 100, 200));
}
