using Microsoft.AspNetCore.Routing;
using Microsoft.Extensions.DependencyInjection;

namespace AssetsBoss.Plugins.Abstractions;

/// <summary>
/// Контракт провайдер-плагина. Реализуется во внешней сборке с именем вида
/// <c>AssetsBoss.Provider.*.dll</c>, которая кладётся рядом с хостом и подхватывается
/// в рантайме (<c>PluginLoader</c>). Плагин сам регистрирует свои сервисы (в т.ч.
/// собственный <c>IAssetProvider</c>) и маппит свои HTTP-эндпоинты — ядро не знает
/// ничего о конкретном провайдере.
/// </summary>
public interface IProviderPlugin
{
    /// <summary>Стабильный идентификатор плагина (совпадает со scheme его провайдера).</summary>
    string Id { get; }

    /// <summary>Регистрация DI-сервисов плагина. Вызывается до построения приложения.</summary>
    void ConfigureServices(IServiceCollection services);

    /// <summary>Маппинг эндпоинтов плагина на группу <c>/api</c>. Вызывается после построения приложения.</summary>
    void MapEndpoints(IEndpointRouteBuilder api);
}
