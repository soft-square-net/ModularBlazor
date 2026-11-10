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

    /// <summary>Applies the keyword search and the column filters of a filter.</summary>
    public static ISpecificationBuilder<T> SearchBy<T>(this ISpecificationBuilder<T> query, BaseFilter? filter)
        where T : class
        => filter is null ? query : query.SearchByKeyword(filter.Keyword, filter.SearchFields).FilterBy(filter.Filters);

    /// <summary>
    /// Column filters ("Field|op|value", see <see cref="BaseFilter.Filters"/>), combined with AND. Only real, readable,
    /// mapped scalar properties are used; values are converted to the property's type with the invariant culture and
    /// sent as parameters. Anything that does not fit is skipped.
    /// </summary>
    public static ISpecificationBuilder<T> FilterBy<T>(this ISpecificationBuilder<T> query, string[]? filters)
        where T : class
    {
        if (filters is not { Length: > 0 }) return query;

        foreach (var text in filters.Take(MaxFilters))
        {
            if (!FilterClause.TryParse(text, out var clause)) continue;
            var predicate = BuildPredicate<T>(clause);
            if (predicate is not null) query.Where(predicate);
        }

        return query;
    }

    private const int MaxFilters = 20;
    private const int MaxInValues = 50;

    private sealed class ValueHolder<TValue>(TValue value)
    {
        public TValue Value { get; } = value;
    }

    private static Expression<Func<T, bool>>? BuildPredicate<T>(FilterClause clause) where T : class
    {
        var property = typeof(T).GetProperties(BindingFlags.Public | BindingFlags.Instance)
            .FirstOrDefault(p => p.CanRead && IsScalar(p.PropertyType) && IsMapped(p)
                                 && string.Equals(p.Name, clause.Field, StringComparison.OrdinalIgnoreCase));
        if (property is null) return null;

        var parameter = Expression.Parameter(typeof(T), "x");
        var access = Expression.Property(parameter, property);
        var type = property.PropertyType;
        var underlying = Nullable.GetUnderlyingType(type) ?? type;
        var canBeNull = !type.IsValueType || Nullable.GetUnderlyingType(type) is not null;
        var isText = underlying == typeof(string);

        Expression? body = clause.Operator switch
        {
            "isnull" => canBeNull ? Expression.Equal(access, Expression.Constant(null, type)) : null,
            "notnull" => canBeNull ? Expression.NotEqual(access, Expression.Constant(null, type)) : null,
            "contains" or "startswith" or "endswith" => isText ? TextMatch(access, clause.Operator, clause.Value) : null,
            "eq" => EqualTo(access, type, underlying, clause.Value),
            "neq" => EqualTo(access, type, underlying, clause.Value) is { } eq ? Expression.Not(eq) : null,
            "gt" or "gte" or "lt" or "lte" => Compare(access, type, underlying, clause.Operator, clause.Value),
            "in" => In(access, type, underlying, clause.Value),
            _ => null
        };

        return body is null ? null : Expression.Lambda<Func<T, bool>>(body, parameter);
    }

    // Case-insensitive contains / starts with / ends with on a text property (null never matches).
    private static Expression TextMatch(MemberExpression access, string op, string value)
    {
        var method = op switch
        {
            "startswith" => typeof(string).GetMethod(nameof(string.StartsWith), [typeof(string)])!,
            "endswith" => typeof(string).GetMethod(nameof(string.EndsWith), [typeof(string)])!,
            _ => typeof(string).GetMethod(nameof(string.Contains), [typeof(string)])!
        };
        var toLower = typeof(string).GetMethod(nameof(string.ToLower), Type.EmptyTypes)!;
        var term = Expression.Property(Expression.Constant(new Holder(value.Trim().ToLower())), nameof(Holder.Value));
        return Expression.AndAlso(
            Expression.NotEqual(access, Expression.Constant(null, typeof(string))),
            Expression.Call(Expression.Call(access, toLower), method, term));
    }

    private static Expression? EqualTo(MemberExpression access, Type type, Type underlying, string value)
    {
        if (underlying == typeof(string))
        {
            // Text equality ignores case, like the keyword search.
            var toLower = typeof(string).GetMethod(nameof(string.ToLower), Type.EmptyTypes)!;
            var term = Expression.Property(Expression.Constant(new Holder(value.Trim().ToLower())), nameof(Holder.Value));
            return Expression.AndAlso(
                Expression.NotEqual(access, Expression.Constant(null, typeof(string))),
                Expression.Equal(Expression.Call(access, toLower), term));
        }

        return Parameter(type, underlying, value) is { } constant ? Expression.Equal(access, constant) : null;
    }

    private static Expression? Compare(MemberExpression access, Type type, Type underlying, string op, string value)
    {
        var comparable = underlying != typeof(string) && underlying != typeof(bool) && underlying != typeof(Guid) && !underlying.IsEnum;
        if (!comparable || Parameter(type, underlying, value) is not { } constant) return null;
        return op switch
        {
            "gt" => Expression.GreaterThan(access, constant),
            "gte" => Expression.GreaterThanOrEqual(access, constant),
            "lt" => Expression.LessThan(access, constant),
            _ => Expression.LessThanOrEqual(access, constant)
        };
    }

    // "a,b,c": equal to any of them.
    private static Expression? In(MemberExpression access, Type type, Type underlying, string value)
    {
        Expression? body = null;
        foreach (var item in value.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).Take(MaxInValues))
        {
            if (EqualTo(access, type, underlying, item) is not { } match) continue;
            body = body is null ? match : Expression.OrElse(body, match);
        }
        return body;
    }

    // The value converted to the property's type and read from a holder, so EF sends it as a parameter.
    private static Expression? Parameter(Type type, Type underlying, string text)
    {
        if (!TryConvert(text.Trim(), underlying, out var converted)) return null;
        var holder = Activator.CreateInstance(typeof(ValueHolder<>).MakeGenericType(underlying), converted)!;
        Expression value = Expression.Property(Expression.Constant(holder), "Value");
        return type == underlying ? value : Expression.Convert(value, type);
    }

    private static bool TryConvert(string text, Type type, out object? value)
    {
        value = null;
        var culture = System.Globalization.CultureInfo.InvariantCulture;
        try
        {
            if (type.IsEnum)
            {
                if (!Enum.TryParse(type, text, ignoreCase: true, out var e) || !Enum.IsDefined(type, e!)) return false;
                value = e;
            }
            else if (type == typeof(bool))
            {
                if (text is "1") value = true;
                else if (text is "0") value = false;
                else if (bool.TryParse(text, out var b)) value = b;
                else return false;
            }
            else if (type == typeof(Guid))
            {
                if (!Guid.TryParse(text, out var g)) return false;
                value = g;
            }
            else if (type == typeof(DateTime))
            {
                // UTC, so PostgreSQL "timestamp with time zone" columns accept it.
                if (!DateTime.TryParse(text, culture,
                        System.Globalization.DateTimeStyles.AssumeUniversal | System.Globalization.DateTimeStyles.AdjustToUniversal, out var d)) return false;
                value = d;
            }
            else if (type == typeof(DateTimeOffset))
            {
                if (!DateTimeOffset.TryParse(text, culture, System.Globalization.DateTimeStyles.AssumeUniversal, out var d)) return false;
                value = d;
            }
            else
            {
                value = Convert.ChangeType(text, type, culture);
            }
            return true;
        }
        catch (Exception ex) when (ex is FormatException or InvalidCastException or OverflowException)
        {
            return false;
        }
    }

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
