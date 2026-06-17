using System.Text.Json.Serialization;
using AssetsBoss.Core;
using AssetsBoss.Core.Data;
using AssetsBoss.Core.Indexing;
using AssetsBoss.Core.Providers;
using AssetsBoss.Core.Thumbnails;
using AssetsBoss.Server.Api;
using Microsoft.Extensions.FileProviders;
using Scalar.AspNetCore;
using Serilog;
using Serilog.Events;

namespace AssetsBoss.Server;

public sealed record ServerOptions
{
    /// <summary>null → URL из launchSettings/окружения (dev); release передаёт "http://127.0.0.1:0".</summary>
    public string? Urls { get; init; }

    /// <summary>Каталог статики фронтенда на диске; null в dev (фронт отдаёт Vite).</summary>
    public string? WwwRoot { get; init; }

    /// <summary>Открывает системный диалог выбора папки; null в dev-режиме (без окна).</summary>
    public Func<Task<string?>>? BrowseForFolder { get; init; }

    /// <summary>Встроенный (embedded) фронтенд для single-file release; приоритетнее <see cref="WwwRoot"/>.</summary>
    public IFileProvider? WwwRootProvider { get; init; }
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

        var plugins = PluginLoader.Discover();

        builder.Services.AddSingleton(new FolderBrowserService(options.BrowseForFolder));
        builder.Services.AddSingleton(new Db(AppPaths.DbFile));
        builder.Services.AddSingleton<SourceRepository>();
        builder.Services.AddSingleton<AssetRepository>();
        builder.Services.AddSingleton<IAssetProvider, LocalFolderProvider>();
        builder.Services.AddSingleton<ProviderRegistry>();
        builder.Services.AddSingleton<Core.Models.ModelBundleService>();
        builder.Services.AddSingleton<IndexScanner>();
        builder.Services.AddSingleton<ScanService>();
        builder.Services.AddSingleton<WatcherService>();
        builder.Services.AddSingleton(sp => new ThumbnailService(
            AppPaths.ThumbsDir,
            sp.GetRequiredService<AssetRepository>(),
            sp.GetRequiredService<ILogger<ThumbnailService>>()));

        foreach (var plugin in plugins)
            plugin.ConfigureServices(builder.Services);

        var app = builder.Build();

        app.Services.GetRequiredService<Db>().Migrate();

        var api = app.MapGroup("/api");
        api.MapGet("/health", () => new { status = "ok", version = "0.1.0" });
        api.MapSourcesApi();
        api.MapScanApi();
        api.MapAssetsApi();

        foreach (var plugin in plugins)
            plugin.MapEndpoints(api);

        if (app.Environment.IsDevelopment())
        {
            app.MapOpenApi();
            app.MapScalarApiReference();
        }

        // Фронтенд: встроенный (single-file release) приоритетнее каталога на диске.
        var spa = options.WwwRootProvider
                  ?? (options.WwwRoot is not null ? new PhysicalFileProvider(options.WwwRoot) : null);
        if (spa is not null)
        {
            app.UseStaticFiles(new StaticFileOptions { FileProvider = spa });
            // SPA-fallback: любой не-API/не-статичный маршрут отдаёт index.html
            app.MapFallback(async ctx =>
            {
                var index = spa.GetFileInfo("index.html");
                if (!index.Exists)
                {
                    ctx.Response.StatusCode = StatusCodes.Status404NotFound;
                    return;
                }
                ctx.Response.ContentType = "text/html; charset=utf-8";
                await using var stream = index.CreateReadStream();
                await stream.CopyToAsync(ctx.Response.Body);
            });
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
