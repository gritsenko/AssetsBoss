using System.Buffers.Binary;
using AssetsBoss.Core.Thumbnails;
using SixLabors.ImageSharp;
using SixLabors.ImageSharp.PixelFormats;

namespace AssetsBoss.Core.Tests;

public class PsdDecoderTests
{
    // 2×2 RGBA, row-major (pos = y*cols + x)
    private static readonly byte[] R = [10, 11, 12, 13];
    private static readonly byte[] G = [20, 21, 22, 23];
    private static readonly byte[] B = [30, 31, 32, 33];
    private static readonly byte[] A = [40, 41, 42, 43];

    [Fact]
    public void Decode_RawRgba_ReadsCompositePixels()
    {
        using var image = PsdDecoder.Decode(new MemoryStream(BuildRawPsd()));

        Assert.Equal(2, image.Width);
        Assert.Equal(2, image.Height);
        AssertPixels(image);
    }

    [Fact]
    public void Decode_RleRgba_ReadsCompositePixels()
    {
        using var image = PsdDecoder.Decode(new MemoryStream(BuildRlePsd()));

        Assert.Equal(2, image.Width);
        Assert.Equal(2, image.Height);
        AssertPixels(image);
    }

    [Fact]
    public void Decode_BadSignature_Throws()
    {
        Assert.Throws<InvalidDataException>(
            () => PsdDecoder.Decode(new MemoryStream([0, 1, 2, 3, 4, 5, 6, 7, 8])));
    }

    private static void AssertPixels(Image<Rgba32> image)
    {
        for (var y = 0; y < 2; y++)
        for (var x = 0; x < 2; x++)
        {
            var pos = y * 2 + x;
            Assert.Equal(new Rgba32(R[pos], G[pos], B[pos], A[pos]), image[x, y]);
        }
    }

    /// <summary>2×2, 4 канала, 8 бит, RGB, без сжатия.</summary>
    private static byte[] BuildRawPsd()
    {
        var ms = new MemoryStream();
        WriteHeader(ms, channels: 4, rows: 2, cols: 2);
        WriteBe16(ms, 0); // compression = Raw
        ms.Write(R);
        ms.Write(G);
        ms.Write(B);
        ms.Write(A);
        return ms.ToArray();
    }

    /// <summary>То же, но composite сжат RLE (PackBits): каждая строка — literal-пакет из 2 байт.</summary>
    private static byte[] BuildRlePsd()
    {
        byte[][] planes = [R, G, B, A];
        var ms = new MemoryStream();
        WriteHeader(ms, channels: 4, rows: 2, cols: 2);
        WriteBe16(ms, 1); // compression = RLE

        // таблица длин строк: 4 канала × 2 строки, каждая строка = 3 байта (0x01 + 2 литерала)
        for (var i = 0; i < 4 * 2; i++)
            WriteBe16(ms, 3);

        // данные строк в порядке канал→строка
        foreach (var plane in planes)
            for (var y = 0; y < 2; y++)
            {
                ms.WriteByte(0x01); // literal: следующие 2 байта
                ms.WriteByte(plane[y * 2]);
                ms.WriteByte(plane[y * 2 + 1]);
            }

        return ms.ToArray();
    }

    private static void WriteHeader(Stream s, int channels, int rows, int cols)
    {
        s.Write("8BPS"u8);
        WriteBe16(s, 1); // version
        s.Write(new byte[6]); // reserved
        WriteBe16(s, channels);
        WriteBe32(s, rows);
        WriteBe32(s, cols);
        WriteBe16(s, 8); // depth
        WriteBe16(s, 3); // color mode = RGB
        WriteBe32(s, 0); // color mode data length
        WriteBe32(s, 0); // image resources length
        WriteBe32(s, 0); // layer & mask length
    }

    private static void WriteBe16(Stream s, int value)
    {
        Span<byte> b = stackalloc byte[2];
        BinaryPrimitives.WriteUInt16BigEndian(b, (ushort)value);
        s.Write(b);
    }

    private static void WriteBe32(Stream s, int value)
    {
        Span<byte> b = stackalloc byte[4];
        BinaryPrimitives.WriteInt32BigEndian(b, value);
        s.Write(b);
    }
}
