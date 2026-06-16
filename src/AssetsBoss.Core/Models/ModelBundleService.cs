using AssetsBoss.Core.Data;
using AssetsBoss.Core.Domain;
using AssetsBoss.Core.Providers;

namespace AssetsBoss.Core.Models;

/// <summary>
/// Собирает <see cref="ModelBundle"/> для модели: companion-файлы из индекса (текстуры/анимации)
/// плюс точный маппинг слотов текстур из Unity .mat/.meta, если он есть. Чтение .mat/.meta идёт
/// через провайдер, поэтому это сервис (а не чистый репозиторий). Без .mat (Blender-ассеты и т.п.)
/// обогащение пропускается — фронтенд привяжет текстуры эвристикой по именам.
/// </summary>
public sealed class ModelBundleService(
    AssetRepository assets, SourceRepository sources, ProviderRegistry providers)
{
    public async Task<ModelBundle?> GetAsync(long assetId, CancellationToken ct)
    {
        var asset = assets.GetById(assetId);
        if (asset is null || asset.Kind != AssetKind.Model) return null;

        var companions = assets.GetModelCompanions(asset);
        var textures = companions.Textures;

        if (companions.MaterialFiles.Count > 0 && textures.Count > 0)
        {
            var src = sources.GetById(asset.SourceId);
            var provider = src is null ? null : providers.TryGet(src.Scheme);
            if (src is not null && provider is not null)
                textures = await UnityMaterialResolver.ResolveAsync(
                    src, provider, textures, companions.MaterialFiles, ct);
        }

        return new ModelBundle(asset.SourceId, textures, companions.Animations);
    }
}
