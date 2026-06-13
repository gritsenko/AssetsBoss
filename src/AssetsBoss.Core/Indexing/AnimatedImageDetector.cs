using System.Buffers.Binary;

namespace AssetsBoss.Core.Indexing;

/// <summary>
/// Лёгкий снифф «анимированности» одиночной картинки по заголовку, без полного декода:
///   GIF  — ≥2 image-дескрипторов (0x2C);
///   WebP — флаг ANIM в расширенном заголовке VP8X;
///   PNG/APNG — присутствие чанка acTL до первого IDAT.
/// Читаем строго вперёд (поток провайдера может быть не seekable); данные блоков
/// пропускаем seek-ом при возможности, иначе чтением с общим лимитом, чтобы один
/// большой статичный файл не превратился в полный его проход.
/// </summary>
public static class AnimatedImageDetector
{
    /// <summary>Расширения, которые имеет смысл нюхать (остальные картинки заведомо одно-кадровые).</summary>
    public static readonly IReadOnlySet<string> SniffableExts =
        new HashSet<string>(StringComparer.OrdinalIgnoreCase) { ".gif", ".webp", ".apng" };

    /// <summary>Сколько байт максимум прочитать/пропустить, прежде чем сдаться (считаем статикой).</summary>
    private const long ReadBudget = 16 * 1024 * 1024;

    public static bool CanSniff(string ext) => SniffableExts.Contains(ext);

    /// <summary>true — картинка анимированная; false — статичная либо формат не распознан.</summary>
    public static bool Detect(string ext, Stream stream)
    {
        try
        {
            return ext.ToLowerInvariant() switch
            {
                ".gif" => IsAnimatedGif(stream),
                ".webp" => IsAnimatedWebp(stream),
                ".apng" or ".png" => IsAnimatedPng(stream),
                _ => false,
            };
        }
        catch (EndOfStreamException)
        {
            return false; // обрезанный/битый файл — статикой и не перепроверяем
        }
    }

    // ---------- GIF ----------

    private static bool IsAnimatedGif(Stream s)
    {
        Span<byte> head = stackalloc byte[6];
        if (!TryReadExact(s, head)) return false;
        // "GIF87a" / "GIF89a"
        if (head[0] != 'G' || head[1] != 'I' || head[2] != 'F') return false;

        Span<byte> lsd = stackalloc byte[7]; // logical screen descriptor
        ReadExact(s, lsd);
        var packed = lsd[4];
        if ((packed & 0x80) != 0) // global color table
            Skip(s, GlobalTableBytes(packed));

        var images = 0;
        long budget = ReadBudget;
        while (budget > 0)
        {
            var intro = s.ReadByte();
            if (intro < 0 || intro == 0x3B) break; // EOF или Trailer
            budget--;
            switch (intro)
            {
                case 0x2C: // image descriptor
                    if (++images >= 2) return true;
                    SkipImageData(s, ref budget);
                    break;
                case 0x21: // extension — пропускаем метку и блоки
                    s.ReadByte();
                    budget -= SkipSubBlocks(s);
                    break;
                default:
                    return false; // мусор — не доверяем
            }
        }
        return false;
    }

    private static int GlobalTableBytes(byte packed) => 3 * (1 << ((packed & 0x07) + 1));

    /// <summary>Пропускает дескриптор кадра: локальную палитру, код LZW и блоки данных.</summary>
    private static void SkipImageData(Stream s, ref long budget)
    {
        Span<byte> desc = stackalloc byte[9]; // left, top, width, height, packed
        ReadExact(s, desc);
        var packed = desc[8];
        if ((packed & 0x80) != 0)
            Skip(s, GlobalTableBytes(packed)); // локальная палитра — тот же размерный код
        s.ReadByte(); // LZW minimum code size
        budget -= SkipSubBlocks(s);
    }

    /// <summary>Пропускает цепочку sub-blocks (len, data…, 0). Возвращает число прочитанных байт.</summary>
    private static long SkipSubBlocks(Stream s)
    {
        long read = 0;
        while (true)
        {
            var len = s.ReadByte();
            if (len <= 0) return read + 1; // 0-терминатор или EOF
            read += 1 + len;
            Skip(s, len);
        }
    }

    // ---------- WebP ----------

    private static bool IsAnimatedWebp(Stream s)
    {
        Span<byte> head = stackalloc byte[12]; // "RIFF" size "WEBP"
        if (!TryReadExact(s, head)) return false;
        if (head[0] != 'R' || head[1] != 'I' || head[2] != 'F' || head[3] != 'F') return false;
        if (head[8] != 'W' || head[9] != 'E' || head[10] != 'B' || head[11] != 'P') return false;

        Span<byte> chunk = stackalloc byte[8]; // FourCC + size
        if (!TryReadExact(s, chunk)) return false;
        if (chunk[0] != 'V' || chunk[1] != 'P' || chunk[2] != '8' || chunk[3] != 'X')
            return false; // простой VP8/VP8L — статичный

        var flags = s.ReadByte();
        if (flags < 0) return false;
        return (flags & 0x02) != 0; // бит ANIMATION
    }

    // ---------- PNG / APNG ----------

    private static bool IsAnimatedPng(Stream s)
    {
        Span<byte> sig = stackalloc byte[8];
        if (!TryReadExact(s, sig)) return false;
        if (sig[0] != 0x89 || sig[1] != 0x50 || sig[2] != 0x4E || sig[3] != 0x47) return false;

        Span<byte> header = stackalloc byte[8]; // length(4) + type(4)
        long budget = ReadBudget;
        while (budget > 0 && TryReadExact(s, header))
        {
            var length = BinaryPrimitives.ReadUInt32BigEndian(header);
            // acTL обязан стоять до IDAT — встретили IDAT раньше → не APNG
            if (IsType(header, 'I', 'D', 'A', 'T')) return false;
            if (IsType(header, 'a', 'c', 'T', 'L')) return true;
            Skip(s, length + 4); // данные чанка + CRC
            budget -= length + 12;
        }
        return false;
    }

    private static bool IsType(ReadOnlySpan<byte> header, char a, char b, char c, char d) =>
        header[4] == a && header[5] == b && header[6] == c && header[7] == d;

    // ---------- общие помощники ----------

    private static void Skip(Stream s, long count)
    {
        if (count <= 0) return;
        if (s.CanSeek)
        {
            s.Seek(count, SeekOrigin.Current);
            return;
        }
        Span<byte> scratch = stackalloc byte[4096];
        while (count > 0)
        {
            var n = s.Read(scratch[..(int)Math.Min(scratch.Length, count)]);
            if (n <= 0) return; // EOF — дальше нечего пропускать
            count -= n;
        }
    }

    private static void ReadExact(Stream s, Span<byte> buffer)
    {
        if (!TryReadExact(s, buffer)) throw new EndOfStreamException();
    }

    private static bool TryReadExact(Stream s, Span<byte> buffer)
    {
        var offset = 0;
        while (offset < buffer.Length)
        {
            var n = s.Read(buffer[offset..]);
            if (n <= 0) return false;
            offset += n;
        }
        return true;
    }
}
