using AssetsBoss.Core.Data;

namespace AssetsBoss.Core.Tests;

public class FtsQueryTests
{
    [Fact]
    public void SimpleTokens_GetPrefixWildcard() =>
        Assert.Equal("\"fire\"* \"sword\"*", AssetRepository.BuildFtsQuery("fire sword"));

    [Theory]
    [InlineData("fire\"sword", "\"fire\"* \"sword\"*")]   // кавычка не роняет запрос
    [InlineData("-fire", "\"fire\"*")]                     // минус (NOT в FTS5) вычищается
    [InlineData("fire*", "\"fire\"*")]
    [InlineData("(fire OR sword)", "\"fire\"* \"OR\"* \"sword\"*")]
    [InlineData("path/to/file", "\"path\"* \"to\"* \"file\"*")]
    [InlineData("snake_case-name", "\"snake\"* \"case\"* \"name\"*")]
    public void SpecialChars_AreSanitized(string input, string expected) =>
        Assert.Equal(expected, AssetRepository.BuildFtsQuery(input));

    [Theory]
    [InlineData(null)]
    [InlineData("")]
    [InlineData("   ")]
    [InlineData("\"*-:()/")]
    public void EmptyOrOnlySpecials_ReturnsNull(string? input) =>
        Assert.Null(AssetRepository.BuildFtsQuery(input));

    [Fact]
    public void UnicodeLetters_Survive() =>
        Assert.Equal("\"меч\"* \"огня\"*", AssetRepository.BuildFtsQuery("меч огня"));
}
