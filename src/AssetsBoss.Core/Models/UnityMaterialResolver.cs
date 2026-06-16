using System.Text.RegularExpressions;
using AssetsBoss.Core.Domain;
using AssetsBoss.Core.Providers;

namespace AssetsBoss.Core.Models;

/// <summary>
/// Точная привязка текстур к PBR-слотам по данным Unity: материал (.mat, YAML) ссылается на
/// текстуры по GUID, а GUID каждой текстуры лежит в её <c>.meta</c>. Связав одно с другим, получаем
/// authoritative-маппинг (например <c>_BaseMap</c> → diffuse, <c>_BumpMap</c> → normal), который
/// надёжнее эвристики по именам и корректно работает для нестандартных названий файлов.
/// </summary>
public static partial class UnityMaterialResolver
{
    [GeneratedRegex(@"^guid:\s*([0-9a-fA-F]{32})", RegexOptions.Multiline)]
    private static partial Regex GuidRegex();

    // `- _PropName:` затем строкой ниже `m_Texture: {fileID: N, guid: <hex>, type: T}`.
    // guid опционален: при fileID 0 (нет текстуры) его нет — такие записи пропускаем.
    [GeneratedRegex(@"-\s+(_[A-Za-z0-9]+):\s*[\r\n]+\s*m_Texture:\s*\{fileID:\s*\d+(?:,\s*guid:\s*([0-9a-fA-F]{32}))?")]
    private static partial Regex TexEnvRegex();

    /// <summary>Unity-свойство шейдера → PBR-слот three.js (имена слотов совпадают с фронтендом).</summary>
    private static readonly Dictionary<string, string> PropToSlot = new(StringComparer.OrdinalIgnoreCase)
    {
        ["_BaseMap"] = "map",
        ["_MainTex"] = "map",
        ["_BaseColorMap"] = "map",
        ["_Diffuse"] = "map",
        ["_BumpMap"] = "normalMap",
        ["_NormalMap"] = "normalMap",
        ["_DetailNormalMap"] = "normalMap",
        ["_MetallicGlossMap"] = "metalnessMap",
        ["_MetallicMap"] = "metalnessMap",
        ["_MaskMap"] = "metalnessMap",
        ["_SpecGlossMap"] = "roughnessMap",
        ["_OcclusionMap"] = "aoMap",
        ["_EmissionMap"] = "emissiveMap",
        ["_EmissiveColorMap"] = "emissiveMap",
    };

    /// <summary>
    /// Возвращает текстуры с проставленным <see cref="ModelCompanion.Slot"/> там, где его удалось
    /// определить из .mat/.meta. Остальные текстуры — без изменений (фронтенд решит эвристикой).
    /// При отсутствии данных (нет .meta с GUID или нет связей) возвращает исходный список.
    /// </summary>
    public static async Task<IReadOnlyList<ModelCompanion>> ResolveAsync(
        SourceConfig src,
        IAssetProvider provider,
        IReadOnlyList<ModelCompanion> textures,
        IReadOnlyList<string> materialFiles,
        CancellationToken ct)
    {
        // GUID → текстура (GUID берём из .meta рядом с файлом текстуры)
        var byGuid = new Dictionary<string, ModelCompanion>(StringComparer.OrdinalIgnoreCase);
        foreach (var tex in textures)
        {
            var meta = await ReadTextAsync(provider, src, tex.RelPath + ".meta", ct);
            var m = meta is null ? Match.Empty : GuidRegex().Match(meta);
            if (m.Success) byGuid[m.Groups[1].Value] = tex;
        }
        if (byGuid.Count == 0) return textures;

        // relPath текстуры → слот (объединение по всем .mat в области поиска)
        var slotByRel = new Dictionary<string, string>(StringComparer.OrdinalIgnoreCase);
        foreach (var mat in materialFiles)
        {
            var text = await ReadTextAsync(provider, src, mat, ct);
            if (text is null) continue;
            foreach (Match e in TexEnvRegex().Matches(text))
            {
                var guid = e.Groups[2].Value;
                if (guid.Length == 0) continue;
                if (!PropToSlot.TryGetValue(e.Groups[1].Value, out var slot)) continue;
                if (byGuid.TryGetValue(guid, out var tex)) slotByRel.TryAdd(tex.RelPath, slot);
            }
        }
        if (slotByRel.Count == 0) return textures;

        return textures
            .Select(t => slotByRel.TryGetValue(t.RelPath, out var slot) ? t with { Slot = slot } : t)
            .ToList();
    }

    private static async Task<string?> ReadTextAsync(
        IAssetProvider provider, SourceConfig src, string relPath, CancellationToken ct)
    {
        try
        {
            if (provider.GetLocalPath(src, relPath) is { } path)
                return await File.ReadAllTextAsync(path, ct);
            await using var s = await provider.OpenReadAsync(src, relPath, ct);
            using var reader = new StreamReader(s);
            return await reader.ReadToEndAsync(ct);
        }
        catch
        {
            return null; // .meta/.mat отсутствует или нечитаем — просто без обогащения
        }
    }
}
