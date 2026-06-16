namespace AssetsBoss.Core.Domain;

/// <summary>
/// Companion-файл модели (текстура или анимационный клип): имя файла + путь в источнике.
/// <see cref="Slot"/> — PBR-слот текстуры (map/normalMap/…), если он точно определён из Unity
/// .mat/.meta; null — слот неизвестен, фронтенд определит эвристикой по имени. Slot — init-свойство
/// (не параметр конструктора), чтобы Dapper маппил по 2-арг конструктору, не требуя колонки Slot.
/// </summary>
public sealed record ModelCompanion(string Name, string RelPath)
{
    public string? Slot { get; init; }
}

/// <summary>
/// «Bundle» 3D-модели: связанные с ней файлы, найденные по индексу источника — внешние текстуры
/// и внешние анимационные FBX. Используется фронтендом для надёжного резолва текстур по имени
/// (независимо от раскладки) и ленивой подгрузки анимационных клипов.
/// </summary>
public sealed record ModelBundle(
    long SourceId,
    IReadOnlyList<ModelCompanion> Textures,
    IReadOnlyList<ModelCompanion> Animations);
