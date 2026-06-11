namespace AssetsBoss.Core;

public static class AppPaths
{
    public static string Root { get; } = Path.Combine(
        Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
        "AssetsBoss");

    public static string DbFile => Path.Combine(Root, "assetsboss.db");
    public static string ThumbsDir => Path.Combine(Root, "thumbs");
    public static string LogsDir => Path.Combine(Root, "logs");

    public static void EnsureCreated()
    {
        Directory.CreateDirectory(Root);
        Directory.CreateDirectory(ThumbsDir);
        Directory.CreateDirectory(LogsDir);
    }
}
