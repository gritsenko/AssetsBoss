namespace AssetsBoss.Core;

public static class AppPaths
{
    public static string Root { get; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "AssetsBoss");

    public static string DbFile => Path.Combine(Root, "assetsboss.db");
    public static string ThumbsDir => Path.Combine(Root, "thumbs");
    public static string LogsDir => Path.Combine(Root, "logs");

    /// <summary>Корень для приватных каталогов данных провайдер-плагинов.</summary>
    public static string PluginsDir => Path.Combine(Root, "plugins");

    /// <summary>
    /// Каталог данных плагина под конкретный ключ (создаётся при обращении). Используется плагинами для
    /// своих настроек/кэшей/токенов. Пример: <c>PluginDataDir(pluginId, account)</c> разделяет данные
    /// разных аккаунтов одного плагина. Идентификатор и ключ санируются под имена папок.
    /// </summary>
    public static string PluginDataDir(string pluginId, string key)
    {
        static string Safe(string s) => string.Join("_", s.Split(Path.GetInvalidFileNameChars()));
        var dir = Path.Combine(PluginsDir, Safe(pluginId), Safe(key));
        Directory.CreateDirectory(dir);
        return dir;
    }

    public static void EnsureCreated()
    {
        Directory.CreateDirectory(Root);
        Directory.CreateDirectory(ThumbsDir);
        Directory.CreateDirectory(LogsDir);
        Directory.CreateDirectory(PluginsDir);
    }
}
