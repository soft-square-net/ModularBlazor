namespace soft.square.net.ModularBlazor.Core.Pagination;

/// <summary>Keyword search over an entity's text properties.</summary>
public class BaseFilter
{
    /// <summary>Matches (case-insensitive, contains) any of the searched text properties.</summary>
    public string? Keyword { get; set; }

    /// <summary>Restricts the keyword search to these properties. Empty: every text property.</summary>
    public string[]? SearchFields { get; set; }
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
