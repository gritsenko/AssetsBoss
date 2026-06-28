using System.Drawing;
using System.Reflection;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using AssetsBoss.Server;
using Microsoft.Extensions.FileProviders;
using Microsoft.Extensions.Hosting;
using Photino.NET;

namespace AssetsBoss.Desktop;

internal static class Program
{
    [STAThread]
    private static void Main()
    {
        try
        {
            Run();
        }
        catch (Exception ex)
        {
            // типовой случай — отсутствует WebView2 Runtime
            MessageBox(IntPtr.Zero,
                $"Не удалось запустить AssetsBoss:\n\n{ex.Message}\n\n" +
                "Если ошибка связана с WebView2 — установите Evergreen WebView2 Runtime:\n" +
                "https://developer.microsoft.com/microsoft-edge/webview2/",
                "AssetsBoss", 0x10 /* MB_ICONERROR */);
        }
    }

    private static void Run()
    {
        var asm = Assembly.GetExecutingAssembly();

        // Фронтенд встроен в сборку (см. EmbeddedResource в .csproj). На отладочной сборке
        // без встроенного фронта манифеста нет — тогда фолбэк на каталог wwwroot рядом с exe.
        IFileProvider? spa = null;
        try { spa = new ManifestEmbeddedFileProvider(asm, "wwwroot"); }
        catch (InvalidOperationException) { /* нет встроенного манифеста */ }

        var wwwRoot = Path.Combine(AppContext.BaseDirectory, "wwwroot");

        var app = ServerHost.Build(new ServerOptions
        {
            Urls = "http://127.0.0.1:0", // случайный свободный порт, только loopback
            WwwRootProvider = spa,
            WwwRoot = spa is null && Directory.Exists(wwwRoot) ? wwwRoot : null,
            BrowseForFolder = BrowseFolder,
        });
        app.Start();
        var url = app.Urls.First();

        PhotinoWindow? window = null;
        window = new PhotinoWindow()
            .SetTitle("AssetsBoss")
            .SetUseOsDefaultSize(false)
            .SetSize(new Size(1440, 920))
            .Center()
            .SetDevToolsEnabled(true);

        var icon = ExtractWindowIcon(asm);
        if (icon is not null)
            window.SetIconFile(icon);

        // Сразу показываем нативный сплэш — WebView2 инициализируется в фоне,
        // пользователь видит спиннер, а не белое окно.
        //
        // Навигацию на реальный URL запускаем ТОЛЬКО после web-сообщения
        // 'splash-ready' от сплэша. Это единственный надёжный признак, что WebView2
        // полностью инициализирован: раз страница выполнила JS и достучалась до моста —
        // нативный контрол готов принимать Navigate. Раньше навигация шла из
        // WindowCreated, который срабатывает ДО старта цикла сообщений и до готовности
        // WebView2 → гонка и периодический AV 0xC0000005 внутри Photino_NavigateToUrl.
        window
            .RegisterWebMessageReceivedHandler((_, msg) =>
            {
                if (msg == "splash-ready")
                    TryNavigate(window!, url);
            })
            // Подстраховка: если мост почему-то не пришлёт сообщение, всё равно
            // перейдём на приложение — к этому моменту WebView2 гарантированно готов.
            .RegisterWindowCreatedHandler((_, _) =>
                _ = Task.Delay(TimeSpan.FromSeconds(5)).ContinueWith(_ => TryNavigate(window!, url)))
            .LoadRawString(SplashHtml);

        window.WaitForClose();
        app.StopAsync().GetAwaiter().GetResult();
    }

    private static int _navigated;

    // Переход на реальный URL должен случиться ровно один раз — кто из триггеров
    // (web-сообщение сплэша либо страховочный таймер) сработает первым.
    private static void TryNavigate(PhotinoWindow window, string url)
    {
        if (Interlocked.Exchange(ref _navigated, 1) != 0)
            return;
        _ = NavigateWhenReady(window, url);
    }

    // Ждём, пока сервер отдаёт /api/health, затем переходим на настоящий URL.
    // Сплэш идентичен #boot-splash в index.html — переход визуально незаметен.
    private static async Task NavigateWhenReady(PhotinoWindow window, string url)
    {
        using var http = new HttpClient { Timeout = TimeSpan.FromSeconds(30) };
        while (true)
        {
            try
            {
                var r = await http.GetAsync(url + "/api/health").ConfigureAwait(false);
                if (r.IsSuccessStatusCode) break;
            }
            catch { }
            await Task.Delay(50).ConfigureAwait(false);
        }
        window.Load(url);
    }

    // Inline-сплэш идентичен #boot-splash в index.html:
    // те же цвета, тот же спиннер → переход между двумя состояниями визуально незаметен.
    // prefers-color-scheme подхватывает системную тему как лучшее приближение
    // (пользовательская тема из localStorage недоступна до загрузки приложения).
    private const string SplashHtml = """
        <!DOCTYPE html>
        <html lang="ru">
        <head>
        <meta charset="UTF-8">
        <style>
        html, body {
          height: 100%;
          margin: 0;
          padding: 0;
          background: #f3f1ea;
        }
        @media (prefers-color-scheme: dark) {
          html { background: #16140f; }
          .boot-word { color: #ede7d9 !important; }
        }
        body {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 20px;
          font-family: system-ui, sans-serif;
        }
        .boot-spinner {
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: 3px solid rgba(217, 110, 52, 0.2);
          border-top-color: #d96e34;
          animation: boot-spin 0.8s linear infinite;
        }
        .boot-word {
          font-size: 12px;
          font-weight: 600;
          letter-spacing: 0.2em;
          text-transform: uppercase;
          opacity: 0.55;
          color: #1d1c18;
        }
        @keyframes boot-spin {
          to { transform: rotate(360deg); }
        }
        @media (prefers-reduced-motion: reduce) {
          .boot-spinner { animation-duration: 2.4s; }
        }
        </style>
        </head>
        <body>
        <div class="boot-spinner"></div>
        <div class="boot-word">AssetsBoss</div>
        <script>
          // Сигнал хосту, что WebView2 ожил и исполняет JS → можно навигировать на
          // приложение. Мост Photino (window.external.sendMessage) инжектится не
          // мгновенно, поэтому дожидаемся его появления.
          (function notifyReady() {
            if (window.external && window.external.sendMessage) {
              window.external.sendMessage('splash-ready');
            } else {
              setTimeout(notifyReady, 30);
            }
          })();
        </script>
        </body>
        </html>
        """;


    private static Task<string?> BrowseFolder()
    {
        var tcs = new TaskCompletionSource<string?>();
        var thread = new Thread(() =>
        {
            // Photino делает per-monitor DPI-aware только свой UI-поток, но не процесс.
            // Новый поток наследует awareness процесса (Unaware) → системный диалог
            // выбора папки рендерится через bitmap-масштабирование и выглядит размытым
            // на hi-DPI. Помечаем поток per-monitor v2 aware ДО создания окна диалога.
            SetThreadDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);

            using var dlg = new FolderBrowserDialog
            {
                Description = "Выберите папку с ассетами",
                UseDescriptionForTitle = true,
            };
            tcs.SetResult(dlg.ShowDialog() == DialogResult.OK ? dlg.SelectedPath : null);
        });
        thread.SetApartmentState(ApartmentState.STA);
        thread.Start();
        return tcs.Task;
    }

    /// <summary>
    /// app.ico встроена в exe как Win32-ресурс (ApplicationIcon) и как managed-ресурс.
    /// Photino принимает только путь на диске, поэтому разворачиваем во временный файл.
    /// </summary>
    private static string? ExtractWindowIcon(Assembly asm)
    {
        var resName = asm.GetManifestResourceNames()
            .FirstOrDefault(n => n.EndsWith("app.ico", StringComparison.OrdinalIgnoreCase));
        if (resName is null)
            return null;

        try
        {
            var path = Path.Combine(Path.GetTempPath(), "AssetsBoss.ico");
            using (var rs = asm.GetManifestResourceStream(resName)!)
            using (var fs = File.Create(path))
                rs.CopyTo(fs);
            return path;
        }
        catch
        {
            return null;
        }
    }

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int MessageBox(IntPtr hWnd, string text, string caption, uint type);

    // Псевдо-хэндл per-monitor DPI awareness v2 (Win10 1607+). Применяется к окнам,
    // создаваемым в потоке ПОСЛЕ вызова; awareness процесса не трогаем (своим окном
    // Photino управляет сам).
    private static readonly IntPtr DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2 = new(-4);

    [DllImport("user32.dll")]
    private static extern IntPtr SetThreadDpiAwarenessContext(IntPtr dpiContext);
}
