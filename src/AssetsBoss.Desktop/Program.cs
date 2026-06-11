using System.Drawing;
using System.Runtime.InteropServices;
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
        });
        app.Start();
        var url = app.Urls.First();

        new PhotinoWindow()
            .SetTitle("AssetsBoss")
            .SetUseOsDefaultSize(false)
            .SetSize(new Size(1440, 920))
            .Center()
            .SetDevToolsEnabled(true)
            .Load(url)
            .WaitForClose();

        app.StopAsync().GetAwaiter().GetResult();
    }

    [DllImport("user32.dll", CharSet = CharSet.Unicode)]
    private static extern int MessageBox(IntPtr hWnd, string text, string caption, uint type);
}
