using System.Diagnostics;

namespace AssetsBoss.Server;

/// <summary>
/// Нативные действия оболочки ОС над файлом ассета: открыть в приложении по умолчанию
/// и показать в проводнике. Сервер слушает только loopback, поэтому «запустить на сервере»
/// = «запустить на машине пользователя» в обоих режимах (dev и Photino-release). Windows-only.
/// </summary>
public static class ShellLauncher
{
    /// <summary>Открывает файл в ассоциированном приложении ОС (как двойной клик в проводнике).</summary>
    public static void OpenInDefaultApp(string path)
    {
        // UseShellExecute=true обязателен: иначе ОС не подберёт обработчик по типу файла
        using var _ = Process.Start(new ProcessStartInfo(path) { UseShellExecute = true });
    }

    /// <summary>Открывает проводник на папке файла и выделяет сам файл.</summary>
    public static void RevealInExplorer(string path)
    {
        // explorer.exe сам разбирает кавычки; форма /select,"путь" открывает каталог и
        // выделяет в нём файл. Запятая после /select обязательна.
        using var _ = Process.Start(new ProcessStartInfo("explorer.exe")
        {
            Arguments = $"/select,\"{path}\"",
            UseShellExecute = false,
        });
    }
}
