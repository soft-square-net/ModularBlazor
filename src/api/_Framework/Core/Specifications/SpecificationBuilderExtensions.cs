using System.ComponentModel.DataAnnotations.Schema;
using System.Linq.Expressions;
using System.Reflection;
using Ardalis.Specification;
using soft.square.net.ModularBlazor.Core.Pagination;

namespace soft.square.net.ModularBlazor.Core.Specifications;

/// <summary>Filter, order and page helpers for Ardalis specifications. Property names come from the client, so only real, readable, mapped properties are used.</summary>
public static class SpecificationBuilderExtensions
{
    private sealed record Holder(string Value);

    /// <summary>Applies the keyword search of a filter.</summary>
    public static ISpecificationBuilder<T> SearchBy<T>(this ISpecificationBuilder<T> query, BaseFilter? filter)
        where T : class
        => filter is null ? query : query.SearchByKeyword(filter.Keyword, filter.SearchFields);

    /// <summary>Case-insensitive "contains" over the given text properties (all text properties when none are given).</summary>
    public static ISpecificationBuilder<T> SearchByKeyword<T>(this ISpecificationBuilder<T> query, string? keyword,
        string[]? fields = null) where T : class
    {
        if (string.IsNullOrWhiteSpace(keyword)) return query;

        var properties = typeof(T).GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .Where(p => p.PropertyType == typeof(string) && IsMapped(p))
            .Where(p => fields is not { Length: > 0 } || fields.Contains(p.Name, StringComparer.OrdinalIgnoreCase))
            .ToList();
        if (properties.Count == 0) return query;

        var contains = typeof(string).GetMethod(nameof(string.Contains), [typeof(string)])!;
        var toLower = typeof(string).GetMethod(nameof(string.ToLower), Type.EmptyTypes)!;

        // The keyword is read from a holder so EF sends it as a parameter, not a literal.
        var term = Expression.Property(Expression.Constant(new Holder(keyword.Trim().ToLower())), nameof(Holder.Value));
        var parameter = Expression.Parameter(typeof(T), "x");

        Expression? body = null;
        foreach (var property in properties)
        {
            var access = Expression.Property(parameter, property);
            var match = Expression.AndAlso(
                Expression.NotEqual(access, Expression.Constant(null, typeof(string))),
                Expression.Call(Expression.Call(access, toLower), contains, term));
            body = body is null ? match : Expression.OrElse(body, match);
        }

        query.Where(Expression.Lambda<Func<T, bool>>(body!, parameter));
        return query;
    }

    /// <summary>Orders by property names ("Name", "CreatedOnUtc desc"). Unknown names are ignored.</summary>
    public static ISpecificationBuilder<T> OrderByFields<T>(this ISpecificationBuilder<T> query, string[]? orderBy)
        where T : class
    {
        if (orderBy is null || orderBy.Length == 0) return query;

        IOrderedSpecificationBuilder<T>? ordered = null;
        foreach (var clause in orderBy)
        {
            var parts = clause.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
            if (parts.Length == 0) continue;

            var property = typeof(T).GetProperties(BindingFlags.Public | BindingFlags.Instance)
                .FirstOrDefault(p => p.CanRead && IsScalar(p.PropertyType) && IsMapped(p)
                                     && string.Equals(p.Name, parts[0], StringComparison.OrdinalIgnoreCase));
            if (property is null) continue;

            var descending = parts.Length > 1 && parts[1].Equals("desc", StringComparison.OrdinalIgnoreCase);
            var parameter = Expression.Parameter(typeof(T), "x");
            var selector = Expression.Lambda<Func<T, object?>>(
                Expression.Convert(Expression.Property(parameter, property), typeof(object)), parameter);

            ordered = ordered is null
                ? (descending ? query.OrderByDescending(selector) : query.OrderBy(selector))
                : (descending ? ordered.ThenByDescending(selector) : ordered.ThenBy(selector));
        }

        return ordered ?? query;
    }

    /// <summary>Orders (by Id when no order is given, so paging is stable) and applies skip/take.</summary>
    public static ISpecificationBuilder<T> PaginateBy<T>(this ISpecificationBuilder<T> query, PaginationFilter filter)
        where T : class
    {
        var (pageNumber, pageSize) = Normalize(filter);

        query.OrderByFields(filter.OrderBy is { Length: > 0 } ? filter.OrderBy : ["Id"]);
        query.Skip((pageNumber - 1) * pageSize).Take(pageSize);
        return query;
    }

    /// <summary>Page number (at least 1) and page size (1..<see cref="PaginationFilter.MaxPageSize"/>) of a filter.</summary>
    public static (int PageNumber, int PageSize) Normalize(PaginationFilter filter)
    {
        var pageSize = filter.PageSize <= 0 ? PaginationFilter.DefaultPageSize : Math.Min(filter.PageSize, PaginationFilter.MaxPageSize);
        return (Math.Max(filter.PageNumber, 1), pageSize);
    }

    private static bool IsMapped(PropertyInfo property) => property.GetCustomAttribute<NotMappedAttribute>() is null;

    private static bool IsScalar(Type type)
    {
        type = Nullable.GetUnderlyingType(type) ?? type;
        return type.IsPrimitive || type.IsEnum
               || type == typeof(string) || type == typeof(decimal) || type == typeof(Guid)
               || type == typeof(DateTime) || type == typeof(DateTimeOffset);
    }
}
