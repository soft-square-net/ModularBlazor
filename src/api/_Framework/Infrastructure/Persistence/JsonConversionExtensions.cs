using System.Text.Json;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.ChangeTracking;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using Microsoft.EntityFrameworkCore.Storage.ValueConversion;

namespace soft.square.net.ModularBlazor.Infrastructure.Persistence;

public static class JsonConversionExtensions
{
    /// <summary>
    /// Stores an array/list/object property as a JSON string. Works the same on SQL Server, PostgreSQL and
    /// MySQL (no provider-specific collection support needed).
    /// </summary>
    public static PropertyBuilder<T> HasJsonConversion<T>(this PropertyBuilder<T> builder) where T : class
    {
        var converter = new ValueConverter<T, string>(v => ToJson(v), v => FromJson<T>(v));
        var comparer = new ValueComparer<T>(
            (a, b) => ToJson(a) == ToJson(b),
            v => ToJson(v).GetHashCode(),
            v => FromJson<T>(ToJson(v)));

        builder.HasConversion(converter, comparer);
        return builder;
    }

    private static string ToJson<T>(T? value) => JsonSerializer.Serialize(value);

    private static T FromJson<T>(string json) => JsonSerializer.Deserialize<T>(json)!;
}
