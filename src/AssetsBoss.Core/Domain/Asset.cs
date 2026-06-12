namespace AssetsBoss.Core.Domain;

public class Asset
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

    /// <summary>Кластер клипов («персонаж») в пределах (source_id, parent_dir); null — не кадр анимации.</summary>
    public string? AnimGroup { get; init; }

    /// <summary>Имя клипа — базовое имя файла без номера кадра.</summary>
    public string? AnimClip { get; init; }

    /// <summary>Номер кадра, разобранный из имени файла. long? — SQLite отдаёт
    /// агрегат MIN(anim_frame) как Int64 без declared type, int? Dapper не кастует.</summary>
    public long? AnimFrame { get; init; }
}

/// <summary>Строка сгруппированной выдачи: для группы — обложка (первый кадр) + счётчики.</summary>
public sealed class AssetListItem : Asset
{
    /// <summary>Сколько кадров схлопнуто в эту строку (1 — обычный ассет).</summary>
    public int FrameCount { get; init; }

    /// <summary>Сколько разных клипов в группе (0 — обычный ассет).</summary>
    public int ClipCount { get; init; }
}
