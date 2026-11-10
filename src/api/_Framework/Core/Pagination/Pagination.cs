namespace soft.square.net.ModularBlazor.Core.Pagination;

/// <summary>Keyword search over an entity's text properties.</summary>
public class BaseFilter
{
    /// <summary>Matches (case-insensitive, contains) any of the searched text properties.</summary>
    public string? Keyword { get; set; }

    /// <summary>Restricts the keyword search to these properties. Empty: every text property.</summary>
    public string[]? SearchFields { get; set; }

    /// <summary>
    /// Column filters, all of which must match. Each is <c>Field|operator|value</c>, e.g. <c>Views|gte|1000</c>,
    /// <c>Section|in|Sport,Culture</c>, <c>PublishedOnUtc|lt|2026-01-01</c>, <c>DeletedOnUtc|isnull|</c>.
    /// Operators: eq, neq, contains, startswith, endswith, gt, gte, lt, lte, in, isnull, notnull.
    /// Text comparisons ignore case. Unknown fields, unsupported operators and values that do not convert are ignored,
    /// like unknown OrderBy fields. Sent by MudTail's DataTable; see <see cref="FilterClause"/>.
    /// </summary>
    public string[]? Filters { get; set; }
}

/// <summary>One parsed entry of <see cref="BaseFilter.Filters"/>.</summary>
public sealed record FilterClause(string Field, string Operator, string Value)
{
    public static readonly string[] Operators =
        ["eq", "neq", "contains", "startswith", "endswith", "gt", "gte", "lt", "lte", "in", "isnull", "notnull"];

    /// <summary>"Field|op|value" (the value may itself contain '|'). False for anything malformed.</summary>
    public static bool TryParse(string? text, out FilterClause clause)
    {
        clause = default!;
        if (string.IsNullOrWhiteSpace(text)) return false;
        var parts = text.Split('|', 3);
        if (parts.Length < 2) return false;
        var field = parts[0].Trim();
        var op = parts[1].Trim().ToLowerInvariant();
        if (field.Length == 0 || !Operators.Contains(op)) return false;
        clause = new FilterClause(field, op, parts.Length > 2 ? parts[2] : "");
        return true;
    }
}

/// <summary>Paging and ordering on top of the keyword search. Bindable from the query string with [AsParameters].</summary>
public class PaginationFilter : BaseFilter
{
    public const int DefaultPageSize = 10;
    public const int MaxPageSize = 100;

    public int PageNumber { get; set; } = 1;
    public int PageSize { get; set; } = DefaultPageSize;

    /// <summary>Property names, each optionally followed by "asc" or "desc", e.g. ["Name", "CreatedOnUtc desc"].</summary>
    public string[]? OrderBy { get; set; }

    /// <summary>
    /// A copy that can only search and order by the given properties (plus Id). Use it before building a spec for
    /// an entity with sensitive columns (password hashes, connection strings).
    /// </summary>
    public PaginationFilter RestrictTo(params string[] fields)
    {
        bool Allowed(string name) => fields.Contains(name, StringComparer.OrdinalIgnoreCase);

        var search = SearchFields?.Where(Allowed).ToArray();
        return new PaginationFilter
        {
            Keyword = Keyword,
            SearchFields = search is { Length: > 0 } ? search : fields,
            // Column filters on anything else (a password hash, a connection string) are dropped, not just ignored later.
            Filters = Filters?.Where(f => FilterClause.TryParse(f, out var c)
                                          && (c.Field.Equals("Id", StringComparison.OrdinalIgnoreCase) || Allowed(c.Field))).ToArray(),
            PageNumber = PageNumber,
            PageSize = PageSize,
            OrderBy = OrderBy?.Where(clause =>
            {
                var name = clause.Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).FirstOrDefault();
                return name is not null && (name.Equals("Id", StringComparison.OrdinalIgnoreCase) || Allowed(name));
            }).ToArray()
        };
    }
}

/// <summary>One page of results.</summary>
public sealed class PagedResponse<T>
{
    public PagedResponse(IReadOnlyList<T> items, int totalCount, int pageNumber, int pageSize)
    {
        Items = items;
        TotalCount = totalCount;
        PageNumber = pageNumber;
        PageSize = pageSize;
    }

    public IReadOnlyList<T> Items { get; }
    public int TotalCount { get; }
    public int PageNumber { get; }
    public int PageSize { get; }
    public int TotalPages => PageSize <= 0 ? 0 : (int)Math.Ceiling(TotalCount / (double)PageSize);
    public bool HasPreviousPage => PageNumber > 1;
    public bool HasNextPage => PageNumber < TotalPages;
}
