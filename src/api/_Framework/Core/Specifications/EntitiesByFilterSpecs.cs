using Ardalis.Specification;
using soft.square.net.ModularBlazor.Core.Pagination;

namespace soft.square.net.ModularBlazor.Core.Specifications;

/// <summary>Entities matching a keyword search.</summary>
public class EntitiesByBaseFilterSpec<T> : Specification<T> where T : class
{
    public EntitiesByBaseFilterSpec(BaseFilter filter) => Query.SearchBy(filter);
}

/// <summary>One page of entities matching a keyword search, ordered as requested.</summary>
public class EntitiesByPaginationFilterSpec<T> : EntitiesByBaseFilterSpec<T> where T : class
{
    public EntitiesByPaginationFilterSpec(PaginationFilter filter) : base(filter) => Query.PaginateBy(filter);
}

/// <summary>Keyword search with a projection. Derive and call <c>Query.Select(...)</c> in the constructor.</summary>
public abstract class EntitiesByBaseFilterSpec<T, TResult> : Specification<T, TResult> where T : class
{
    protected EntitiesByBaseFilterSpec(BaseFilter filter) => Query.SearchBy(filter);
}

/// <summary>One projected page. Derive and call <c>Query.Select(...)</c> in the constructor.</summary>
public abstract class EntitiesByPaginationFilterSpec<T, TResult> : EntitiesByBaseFilterSpec<T, TResult> where T : class
{
    protected EntitiesByPaginationFilterSpec(PaginationFilter filter) : base(filter) => Query.PaginateBy(filter);
}
