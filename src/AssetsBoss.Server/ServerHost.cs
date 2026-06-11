using System.Text.Json.Serialization;
using AssetsBoss.Core;
using AssetsBoss.Core.Data;
using AssetsBoss.Core.Indexing;
using AssetsBoss.Core.Providers;
using AssetsBoss.Core.Thumbnails;
using AssetsBoss.Server.Api;
using Scalar.AspNetCore;
using Serilog;
using Serilog.Events;

namespace AssetsBoss.Server;

public sealed record ServerOptions
{
    /// <summary>null → URL из launchSettings/окружения (dev); release передаёт "http://127.0.0.1:0".</summary>
    public string? Urls { get; init; }

    /// <summary>Каталог статики фронтенда; null в dev (фронт отдаёт Vite).</summary>
    public string? WwwRoot { get; init; }
}

/// <summary>
/// Общая сборка WebApplication для dev-запуска (Program.cs) и Photino-хоста (Desktop).
/// API идентичен в обоих режимах; release дополнительно отдаёт статику фронтенда.
/// </summary>
public static class ServerHost
{
    public static WebApplication Build(ServerOptions options)
    {
        AppPaths.EnsureCreated();

        Log.Logger = new LoggerConfiguration()
            .MinimumLevel.Information()
            .MinimumLevel.Override("Microsoft.AspNetCore", LogEventLevel.Warning)
            .WriteTo.Console()
            .WriteTo.File(
                Path.Combine(AppPaths.LogsDir, "assetsboss-.log"),
                rollingInterval: RollingInterval.Day,
                retainedFileCountLimit: 7)
            .CreateLogger();

        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            WebRootPath = options.WwwRoot,
        });
        builder.Host.UseSerilog();

        if (options.Urls is not null)
            builder.WebHost.UseUrls(options.Urls);

        builder.Services.ConfigureHttpJsonOptions(o =>
            o.SerializerOptions.Converters.Add(
                new JsonStringEnumConverter(System.Text.Json.JsonNamingPolicy.CamelCase)));

        builder.Services.AddOpenApi();

        builder.Services.AddSingleton(new Db(AppPaths.DbFile));
        builder.Services.AddSingleton<SourceRepository>();
        builder.Services.AddSingleton<AssetRepository>();
        builder.Services.AddSingleton<IAssetProvider, LocalFolderProvider>();
        builder.Services.AddSingleton<ProviderRegistry>();
        builder.Services.AddSingleton<IndexScanner>();
        builder.Services.AddSingleton<ScanService>();
        builder.Services.AddSingleton<WatcherService>();
        builder.Services.AddSingleton(sp => new ThumbnailService(
            AppPaths.ThumbsDir,
            sp.GetRequiredService<AssetRepository>(),
            sp.GetRequiredService<ILogger<ThumbnailService>>()));

        var app = builder.Build();

        app.Services.GetRequiredService<Db>().Migrate();

        var api = app.MapGroup("/api");
        api.MapGet("/health", () => new { status = "ok", version = "0.1.0" });
        api.MapSourcesApi();
        api.MapScanApi();
        api.MapAssetsApi();

        if (app.Environment.IsDevelopment())
        {
            app.MapOpenApi();
            app.MapScalarApiReference();
        }

        if (options.WwwRoot is not null)
        {
            app.UseStaticFiles();
            app.MapFallbackToFile("index.html");
        }

        // при старте: поднять watcher'ы и догнать индекс ресканом всех источников
        var lifetime = app.Services.GetRequiredService<IHostApplicationLifetime>();
        lifetime.ApplicationStarted.Register(() =>
        {
            var watchers = app.Services.GetRequiredService<WatcherService>();
            var scans = app.Services.GetRequiredService<ScanService>();
            var sources = app.Services.GetRequiredService<SourceRepository>();
            watchers.SyncWatchers();
            foreach (var src in sources.GetAll())
                scans.EnqueueRescan(src.Id);
        });
        lifetime.ApplicationStopping.Register(() =>
        {
            app.Services.GetRequiredService<WatcherService>().Dispose();
            app.Services.GetRequiredService<ScanService>().Dispose();
        });

        return app;
    }
}
