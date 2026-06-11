using AssetsBoss.Core.Domain;

namespace AssetsBoss.Core.Tests;

public class AssetKindsTests
{
    [Theory]
    [InlineData(".png", AssetKind.Image)]
    [InlineData(".PNG", AssetKind.Image)]
    [InlineData(".jpg", AssetKind.Image)]
    [InlineData(".wav", AssetKind.Audio)]
    [InlineData(".OGG", AssetKind.Audio)]
    [InlineData(".fbx", AssetKind.Model)]
    [InlineData(".glb", AssetKind.Model)]
    [InlineData(".txt", AssetKind.Other)]
    [InlineData("", AssetKind.Other)]
    public void FromExtension_MapsCorrectly(string ext, AssetKind expected) =>
        Assert.Equal(expected, AssetKinds.FromExtension(ext));

    [Theory]
    [InlineData("image", AssetKind.Image)]
    [InlineData("Audio", AssetKind.Audio)]
    [InlineData("model", AssetKind.Model)]
    [InlineData("other", AssetKind.Other)]
    [InlineData("bogus", null)]
    [InlineData(null, null)]
    public void Parse_HandlesUserInput(string? input, AssetKind? expected) =>
        Assert.Equal(expected, AssetKinds.Parse(input));
}
