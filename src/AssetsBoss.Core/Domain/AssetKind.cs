namespace AssetsBoss.Core.Domain;

public enum AssetKind
{
    Other = 0,
    Image = 1,
    Audio = 2,
    Model = 3,
}

public static class AssetKinds
{
    private static readonly Dictionary<string, AssetKind> ByExt = new(StringComparer.OrdinalIgnoreCase)
    {
        [".png"] = AssetKind.Image,
        [".jpg"] = AssetKind.Image,
        [".jpeg"] = AssetKind.Image,
        [".bmp"] = AssetKind.Image,
        [".gif"] = AssetKind.Image,
        [".webp"] = AssetKind.Image,
        [".tga"] = AssetKind.Image,
        [".svg"] = AssetKind.Image,
        [".psd"] = AssetKind.Image,

        [".wav"] = AssetKind.Audio,
        [".ogg"] = AssetKind.Audio,
        [".mp3"] = AssetKind.Audio,
        [".flac"] = AssetKind.Audio,
        [".aiff"] = AssetKind.Audio,
        [".m4a"] = AssetKind.Audio,

        [".obj"] = AssetKind.Model,
        [".fbx"] = AssetKind.Model,
        [".glb"] = AssetKind.Model,
        [".gltf"] = AssetKind.Model,
        [".stl"] = AssetKind.Model,
        [".dae"] = AssetKind.Model,
        [".blend"] = AssetKind.Model,
        [".3ds"] = AssetKind.Model,
    };

    public static AssetKind FromExtension(string ext) =>
        ByExt.TryGetValue(ext, out var kind) ? kind : AssetKind.Other;

    public static AssetKind? Parse(string? value) => value?.ToLowerInvariant() switch
    {
        "image" => AssetKind.Image,
        "audio" => AssetKind.Audio,
        "model" => AssetKind.Model,
        "other" => AssetKind.Other,
        _ => null,
    };
}
