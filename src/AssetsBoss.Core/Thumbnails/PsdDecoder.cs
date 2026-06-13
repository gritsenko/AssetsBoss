using System.Buffers.Binary;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;

namespace AssetsBoss.Core.Thumbnails;

/// <summary>
/// Минимальный PSD-декодер для миниатюр/превью. Читает только сведённый composite-слой
/// (Photoshop пишет его после секции слоёв при "maximize compatibility") — отдельные слои
/// не разбираются, секция слоёв пропускается по её длине. Достаточно для рендера превью
/// без нативных зависимостей.
///
/// Порт PSD-ридера из Pix2d (PsdFile / RleHelper / BinaryReverseReader) на ImageSharp:
/// разбор заголовка, RLE (PackBits) и таблицы цветов индексированных PSD взяты оттуда,
/// вывод переведён со SkiaSharp SKBitmap на ImageSharp Image&lt;Rgba32&gt;.
/// </summary>
internal static class PsdDecoder
{
    // PSD поддерживает до 30000×30000; ограничиваем, чтобы битый заголовок не выделил гигабайты
    private const int MaxDimension = 30000;

    private enum ColorMode
    {
        Bitmap = 0,
        Grayscale = 1,
        Indexed = 2,
        Rgb = 3,
        Cmyk = 4,
        Multichannel = 7,
        Duotone = 8,
        Lab = 9,
    }

    /// <summary>
    /// Декодирует сведённый слой PSD из <paramref name="stream"/> (должен быть seekable —
    /// парсер прыгает по позициям). Бросает при неподдерживаемом/битом файле.
    /// </summary>
    public static Image<Rgba32> Decode(Stream stream)
    {
        Span<byte> sig = stackalloc byte[4];
        ReadExact(stream, sig);
        if (sig[0] != (byte)'8' || sig[1] != (byte)'B' || sig[2] != (byte)'P' || sig[3] != (byte)'S')
            throw new InvalidDataException("Not a PSD file (bad signature)");

        var version = ReadUInt16(stream);
        if (version != 1)
            throw new InvalidDataException($"Unsupported PSD version {version}");

        stream.Position += 6; // 6 зарезервированных байт
        int channels = ReadUInt16(stream);
        int rows = ReadInt32(stream);
        int cols = ReadInt32(stream);
        int depth = ReadUInt16(stream);
        var colorMode = (ColorMode)ReadUInt16(stream);

        if (channels < 1 || rows < 1 || cols < 1 || rows > MaxDimension || cols > MaxDimension)
            throw new InvalidDataException($"Unsupported PSD dimensions {cols}x{rows}, {channels}ch");
        if (depth != 8 && depth != 16)
            throw new InvalidDataException($"Unsupported PSD bit depth {depth}");

        // Color mode data (палитра для Indexed/Duotone)
        long colorModeLen = ReadUInt32(stream);
        byte[] colorModeData = colorModeLen > 0 ? ReadBytes(stream, (int)colorModeLen) : [];

        // Image resources — для composite не нужны, пропускаем
        long resourcesLen = ReadUInt32(stream);
        stream.Position += resourcesLen;

        // Layer & mask info — пропускаем целиком, нам нужен только сведённый слой
        long layerLen = ReadUInt32(stream);
        stream.Position += layerLen;

        // Сведённый composite
        int compression = ReadUInt16(stream); // 0 = Raw, 1 = RLE
        int bytesPerSample = depth == 16 ? 2 : 1;
        int rowBytes = cols * bytesPerSample;

        var planes = new byte[channels][];
        for (var c = 0; c < channels; c++)
            planes[c] = new byte[rows * rowBytes];

        switch (compression)
        {
            case 0: // Raw — планарно, канал за каналом
                foreach (var plane in planes)
                    ReadExact(stream, plane);
                break;

            case 1: // RLE (PackBits): сначала таблица длин строк (2 байта на строку), затем данные
                stream.Position += (long)rows * channels * 2;
                foreach (var plane in planes)
                    for (var y = 0; y < rows; y++)
                        DecodeRleRow(stream, plane, y * rowBytes, rowBytes);
                break;

            default:
                throw new InvalidDataException($"Unsupported PSD compression {compression}");
        }

        return BuildImage(planes, channels, rows, cols, depth, colorMode, colorModeData);
    }

    private static Image<Rgba32> BuildImage(
        byte[][] planes, int channels, int rows, int cols, int depth, ColorMode colorMode, byte[] palette)
    {
        // для 16 бит берём старший байт каждого big-endian сэмпла (pos*2) — превью этого достаточно
        var stride = depth == 16 ? 2 : 1;
        byte Sample(int channel, int pos) => planes[channel][pos * stride];

        var image = new Image<Rgba32>(cols, rows);
        image.ProcessPixelRows(accessor =>
        {
            for (var y = 0; y < rows; y++)
            {
                var row = accessor.GetRowSpan(y);
                var baseIdx = y * cols;
                for (var x = 0; x < cols; x++)
                    row[x] = Pixel(baseIdx + x);
            }
        });
        return image;

        Rgba32 Pixel(int pos)
        {
            switch (colorMode)
            {
                case ColorMode.Grayscale:
                case ColorMode.Duotone:
                {
                    var g = Sample(0, pos);
                    var a = channels > 1 ? Sample(1, pos) : (byte)255;
                    return new Rgba32(g, g, g, a);
                }
                case ColorMode.Indexed:
                {
                    int i = Sample(0, pos);
                    byte r = i < palette.Length ? palette[i] : (byte)0;
                    byte g = i + 256 < palette.Length ? palette[i + 256] : (byte)0;
                    byte b = i + 512 < palette.Length ? palette[i + 512] : (byte)0;
                    return new Rgba32(r, g, b, 255);
                }
                case ColorMode.Rgb:
                {
                    var a = channels > 3 ? Sample(3, pos) : (byte)255;
                    return new Rgba32(Sample(0, pos), Sample(1, pos), Sample(2, pos), a);
                }
                case ColorMode.Cmyk:
                    return CmykToRgba(Sample(0, pos), Sample(1, pos), Sample(2, pos), channels > 3 ? Sample(3, pos) : (byte)0);
                case ColorMode.Multichannel:
                    return CmykToRgba(Sample(0, pos), Sample(1, pos), Sample(2, pos), 0);
                case ColorMode.Lab:
                    return LabToRgba(Sample(0, pos), Sample(1, pos), Sample(2, pos));
                default:
                    throw new InvalidDataException($"Unsupported PSD color mode {colorMode}");
            }
        }
    }

    private static void DecodeRleRow(Stream stream, byte[] dest, int startIdx, int count)
    {
        var i = 0;
        while (i < count)
        {
            var header = stream.ReadByte();
            if (header < 0) return; // EOF — оставляем хвост строки нулями
            if (header < 128)
            {
                // literal: следующие (header + 1) байт копируются как есть
                for (var n = header + 1; n != 0 && i < count; n--, i++)
                {
                    var b = stream.ReadByte();
                    if (b < 0) return;
                    dest[startIdx + i] = (byte)b;
                }
            }
            else if (header > 128)
            {
                // run: один байт повторяется (257 - header) раз
                var run = 257 - header;
                var b = stream.ReadByte();
                if (b < 0) return;
                for (; run != 0 && i < count; run--, i++)
                    dest[startIdx + i] = (byte)b;
            }
            // header == 128 — no-op (по спецификации PackBits)
        }
    }

    private static Rgba32 CmykToRgba(byte c, byte m, byte y, byte k)
    {
        // в PSD CMYK хранится инвертированным (0 = полная краска)
        var rr = (c / 255.0) * (k / 255.0);
        var gg = (m / 255.0) * (k / 255.0);
        var bb = (y / 255.0) * (k / 255.0);
        return new Rgba32((byte)Math.Clamp(rr * 255.0, 0, 255),
            (byte)Math.Clamp(gg * 255.0, 0, 255),
            (byte)Math.Clamp(bb * 255.0, 0, 255), 255);
    }

    private static Rgba32 LabToRgba(byte lb, byte ab, byte bb)
    {
        var l = lb / 2.56;
        var a = ab - 128.0;
        var bComp = bb - 128.0;

        var fy = (l + 16.0) / 116.0;
        var fx = a / 500.0 + fy;
        var fz = fy - bComp / 200.0;

        double Pivot(double t) => Math.Pow(t, 3.0) > 0.008856 ? Math.Pow(t, 3.0) : (t - 16.0 / 116.0) / 7.787;

        var x = 95.047 * Pivot(fx) / 100.0;
        var yc = 100.0 * Pivot(fy) / 100.0;
        var z = 108.883 * Pivot(fz) / 100.0;

        var r = x * 3.2406 + yc * -1.5372 + z * -0.4986;
        var g = x * -0.9689 + yc * 1.8758 + z * 0.0415;
        var bl = x * 0.0557 + yc * -0.2040 + z * 1.0570;

        double Gamma(double v) => v > 0.0031308 ? 1.055 * Math.Pow(v, 1.0 / 2.4) - 0.055 : 12.92 * v;

        return new Rgba32(
            (byte)Math.Clamp(Gamma(r) * 255.0, 0, 255),
            (byte)Math.Clamp(Gamma(g) * 255.0, 0, 255),
            (byte)Math.Clamp(Gamma(bl) * 255.0, 0, 255), 255);
    }

    // --- big-endian чтение ---

    private static void ReadExact(Stream stream, Span<byte> buffer)
    {
        var read = 0;
        while (read < buffer.Length)
        {
            var n = stream.Read(buffer[read..]);
            if (n == 0) throw new EndOfStreamException("Unexpected end of PSD stream");
            read += n;
        }
    }

    private static byte[] ReadBytes(Stream stream, int count)
    {
        var buffer = new byte[count];
        ReadExact(stream, buffer);
        return buffer;
    }

    private static ushort ReadUInt16(Stream stream)
    {
        Span<byte> b = stackalloc byte[2];
        ReadExact(stream, b);
        return BinaryPrimitives.ReadUInt16BigEndian(b);
    }

    private static int ReadInt32(Stream stream)
    {
        Span<byte> b = stackalloc byte[4];
        ReadExact(stream, b);
        return BinaryPrimitives.ReadInt32BigEndian(b);
    }

    private static uint ReadUInt32(Stream stream)
    {
        Span<byte> b = stackalloc byte[4];
        ReadExact(stream, b);
        return BinaryPrimitives.ReadUInt32BigEndian(b);
    }
}
