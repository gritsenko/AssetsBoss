using System.Reflection;
using AssetsBoss.Plugins.Abstractions;
using Serilog;

namespace AssetsBoss.Server;

/// <summary>
/// Находит и инстанцирует провайдер-плагины: сканит каталог хоста на сборки
/// <c>AssetsBoss.Provider.*.dll</c> и создаёт по одному экземпляру каждого
/// <see cref="IProviderPlugin"/>. Зависимости плагина (клиентские библиотеки и пр.)
/// должны лежать в том же каталоге — их резолвит дефолтный загрузчик.
/// Отсутствие плагинов — штатная ситуация (публичная сборка просто работает без них).
/// </summary>
internal static class PluginLoader
{
    private const string PluginAssemblyPattern = "AssetsBoss.Provider.*.dll";

    public static IReadOnlyList<IProviderPlugin> Discover()
    {
        var baseDir = AppContext.BaseDirectory;
        var plugins = new List<IProviderPlugin>();

        foreach (var dll in Directory.EnumerateFiles(baseDir, PluginAssemblyPattern))
        {
            try
            {
                var asm = Assembly.LoadFrom(dll);
                foreach (var type in asm.GetTypes())
                {
                    if (type is { IsAbstract: false, IsInterface: false }
                        && typeof(IProviderPlugin).IsAssignableFrom(type))
                    {
                        var plugin = (IProviderPlugin)Activator.CreateInstance(type)!;
                        plugins.Add(plugin);
                        Log.Information("Loaded provider plugin '{Id}' from {Dll}", plugin.Id, Path.GetFileName(dll));
                    }
                }
            }
            catch (Exception ex)
            {
                Log.Error(ex, "Failed to load plugin assembly {Dll}", Path.GetFileName(dll));
            }
        }

        return plugins;
    }
}
