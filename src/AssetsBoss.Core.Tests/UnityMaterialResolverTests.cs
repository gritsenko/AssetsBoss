using System.Text;
using AssetsBoss.Core.Domain;
using AssetsBoss.Core.Models;
using AssetsBoss.Core.Providers;

namespace AssetsBoss.Core.Tests;

/// <summary>
/// Привязка слотов текстур из Unity .mat/.meta: материал ссылается на текстуры по GUID,
/// GUID каждой текстуры — в её .meta. Резолвер должен соединить одно с другим.
/// </summary>
public class UnityMaterialResolverTests
{
    private const string DfGuid = "6751b4a5cbbb8c04697f838c1cde574d";
    private const string NmGuid = "bebb234743da46743934442ffef993c4";
    private const string MsGuid = "69299fccf4d827747899b5f489649294";

    private static readonly SourceConfig Src = new(1, "t", "fake", "x", null, 0, null);

    /// <summary>Провайдер поверх словаря relPath→содержимое (читается только через OpenReadAsync).</summary>
    private sealed class FakeProvider(Dictionary<string, string> files) : IAssetProvider
    {
        public string Scheme => "fake";
        public ProviderCaps Caps => ProviderCaps.None;
        public string? GetLocalPath(SourceConfig src, string relPath) => null;
        public IAsyncEnumerable<ProviderItem> EnumerateAsync(SourceConfig src, IProgress<string>? d, CancellationToken ct) =>
            throw new NotSupportedException();
        public Task<Stream?> OpenThumbnailSourceAsync(SourceConfig src, string relPath, CancellationToken ct) =>
            Task.FromResult<Stream?>(null);
        public IDisposable? Watch(SourceConfig src, Action onAnyChange) => null;

        public Task<Stream> OpenReadAsync(SourceConfig src, string relPath, CancellationToken ct) =>
            files.TryGetValue(relPath, out var content)
                ? Task.FromResult<Stream>(new MemoryStream(Encoding.UTF8.GetBytes(content)))
                : throw new FileNotFoundException(relPath);
    }

    private static string Meta(string guid) => $"fileFormatVersion: 2\nguid: {guid}\nTextureImporter:\n  foo: 1\n";

    [Fact]
    public async Task MapsTextureSlots_FromMatAndMeta()
    {
        var mat =
            $$"""
              Material:
                m_Name: wp_nailgun_01
                m_SavedProperties:
                  m_TexEnvs:
                  - _BaseMap:
                      m_Texture: {fileID: 2800000, guid: {{DfGuid}}, type: 3}
                      m_Scale: {x: 1, y: 1}
                  - _BumpMap:
                      m_Texture: {fileID: 2800000, guid: {{NmGuid}}, type: 3}
                  - _MetallicGlossMap:
                      m_Texture: {fileID: 2800000, guid: {{MsGuid}}, type: 3}
                  - _EmissionMap:
                      m_Texture: {fileID: 0}
              """;

        var files = new Dictionary<string, string>
        {
            ["Mat/wp_DF.png.meta"] = Meta(DfGuid),
            ["Mat/wp_NM.png.meta"] = Meta(NmGuid),
            ["Mat/wp_MS.png.meta"] = Meta(MsGuid),
            ["Mat/wp.mat"] = mat,
        };
        var provider = new FakeProvider(files);

        var textures = new List<ModelCompanion>
        {
            new("wp_DF.png", "Mat/wp_DF.png"),
            new("wp_NM.png", "Mat/wp_NM.png"),
            new("wp_MS.png", "Mat/wp_MS.png"),
        };

        var result = await UnityMaterialResolver.ResolveAsync(
            Src, provider, textures, ["Mat/wp.mat"], CancellationToken.None);

        var bySlot = result.ToDictionary(t => t.Name, t => t.Slot);
        Assert.Equal("map", bySlot["wp_DF.png"]);
        Assert.Equal("normalMap", bySlot["wp_NM.png"]);
        Assert.Equal("metalnessMap", bySlot["wp_MS.png"]);
    }

    [Fact]
    public async Task LeavesTexturesUntouched_WhenNoMetaOrMat()
    {
        var provider = new FakeProvider([]); // ни .meta, ни .mat не читаются
        var textures = new List<ModelCompanion> { new("a_DF.png", "a_DF.png") };

        var result = await UnityMaterialResolver.ResolveAsync(
            Src, provider, textures, ["x.mat"], CancellationToken.None);

        Assert.Null(Assert.Single(result).Slot);
    }
}
