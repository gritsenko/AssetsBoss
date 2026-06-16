using System.Drawing;
using System.Runtime.InteropServices;
using System.Windows.Forms;
using AssetsBoss.Server;
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
        var wwwRoot = Path.Combine(AppContext.BaseDirectory, "wwwroot");

        var app = ServerHost.Build(new ServerOptions
        {
            Urls = "http://127.0.0.1:0", // случайный свободный порт, только loopback
            WwwRoot = Directory.Exists(wwwRoot) ? wwwRoot : null,
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
            .SetDevToolsEnabled(true)
            // Сразу показываем нативный сплэш — WebView2 инициализируется в фоне,
            // пользователь видит спиннер, а не белое окно.
            .RegisterWindowCreatedHandler((_, _) => _ = NavigateWhenReady(window!, url))
            .LoadRawString(SplashHtml);

        window.WaitForClose();
        app.StopAsync().GetAwaiter().GetResult();
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
        </body>
        </html>
        """;


    private static Task<string?> BrowseFolder()
    {
        var tcs = new TaskCompletionSource<string?>();
        var thread = new Thread(() =>
        {
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

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int MessageBox(IntPtr hWnd, string text, string caption, uint type);
}
