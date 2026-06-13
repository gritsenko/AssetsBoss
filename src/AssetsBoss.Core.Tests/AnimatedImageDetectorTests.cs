using AssetsBoss.Core.Indexing;

namespace AssetsBoss.Core.Tests;

public class AnimatedImageDetectorTests
{
    private static bool Detect(string ext, byte[] bytes) =>
        AnimatedImageDetector.Detect(ext, new MemoryStream(bytes));

    // ---------- GIF ----------

    private static readonly byte[] GifHeader =
    [
        (byte)'G', (byte)'I', (byte)'F', (byte)'8', (byte)'9', (byte)'a',
        0x01, 0x00, 0x01, 0x00, 0x00, 0x00, 0x00, // LSD: 1x1, без глобальной палитры
    ];

    // дескриптор кадра 1x1 + минимальная цепочка LZW-блоков
    private static readonly byte[] GifFrame =
    [
        0x2C, 0x00, 0x00, 0x00, 0x00, 0x01, 0x00, 0x01, 0x00, 0x00, // image descriptor
        0x02,             // LZW minimum code size
        0x02, 0xAA, 0xBB, // sub-block: длина 2 + данные
        0x00,             // терминатор блоков
    ];

    [Fact]
    public void Gif_TwoFrames_IsAnimated()
    {
        var bytes = GifHeader.Concat(GifFrame).Concat(GifFrame).ToArray();
        Assert.True(Detect(".gif", bytes));
    }

    [Fact]
    public void Gif_SingleFrame_IsStatic()
    {
        var bytes = GifHeader.Concat(GifFrame).Append((byte)0x3B).ToArray(); // + trailer
        Assert.False(Detect(".gif", bytes));
    }

    // ---------- WebP ----------

    private static byte[] Webp(string fourCc, byte? vp8xFlags = null)
    {
        var b = new List<byte>();
        b.AddRange("RIFF"u8.ToArray());
        b.AddRange([0x20, 0x00, 0x00, 0x00]); // размер файла (не проверяется)
        b.AddRange("WEBP"u8.ToArray());
        b.AddRange(System.Text.Encoding.ASCII.GetBytes(fourCc));
        b.AddRange([0x0A, 0x00, 0x00, 0x00]); // размер чанка
        if (vp8xFlags is { } f) b.Add(f);
        return b.ToArray();
    }

    [Fact]
    public void Webp_Vp8xWithAnimFlag_IsAnimated()
    {
        Assert.True(Detect(".webp", Webp("VP8X", 0x02)));
    }

    [Fact]
    public void Webp_Vp8xWithoutAnimFlag_IsStatic()
    {
        Assert.False(Detect(".webp", Webp("VP8X", 0x10))); // только alpha-флаг
    }

    [Fact]
    public void Webp_SimpleVp8_IsStatic()
    {
        Assert.False(Detect(".webp", Webp("VP8 ")));
    }

    // ---------- PNG / APNG ----------

    private static readonly byte[] PngSig = [0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A];

    private static byte[] Chunk(string type, int dataLen)
    {
        var b = new List<byte>();
        b.AddRange([(byte)(dataLen >> 24), (byte)(dataLen >> 16), (byte)(dataLen >> 8), (byte)dataLen]);
        b.AddRange(System.Text.Encoding.ASCII.GetBytes(type));
        b.AddRange(new byte[dataLen]); // данные
        b.AddRange(new byte[4]);       // CRC
        return b.ToArray();
    }

    [Fact]
    public void Png_WithAcTlBeforeIdat_IsAnimated()
    {
        var bytes = PngSig
            .Concat(Chunk("IHDR", 13))
            .Concat(Chunk("acTL", 8))
            .Concat(Chunk("IDAT", 4))
            .ToArray();
        Assert.True(Detect(".png", bytes));
        Assert.True(Detect(".apng", bytes));
    }

    [Fact]
    public void Png_NoAcTl_IsStatic()
    {
        var bytes = PngSig
            .Concat(Chunk("IHDR", 13))
            .Concat(Chunk("IDAT", 4))
            .ToArray();
        Assert.False(Detect(".png", bytes));
    }

    // ---------- общее ----------

    [Theory]
    [InlineData(".png")]
    [InlineData(".jpg")]
    [InlineData(".tga")]
    public void UnsniffableExtensions_AreNotSniffable(string ext)
    {
        Assert.False(AnimatedImageDetector.CanSniff(ext));
    }

    [Theory]
    [InlineData(".gif")]
    [InlineData(".webp")]
    [InlineData(".apng")]
    public void SniffableExtensions(string ext)
    {
        Assert.True(AnimatedImageDetector.CanSniff(ext));
    }

    [Fact]
    public void Truncated_Input_IsStatic()
    {
        Assert.False(Detect(".gif", [(byte)'G', (byte)'I', (byte)'F']));
        Assert.False(Detect(".webp", "RIFF"u8.ToArray()));
        Assert.False(Detect(".png", PngSig));
    }
}
