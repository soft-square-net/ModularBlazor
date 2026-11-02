using Ardalis.Specification;
using soft.square.net.ModularBlazor.Core.Pagination;

namespace soft.square.net.ModularBlazor.Core.Specifications;

public static class RepositoryExtensions
{
    /// <summary>Runs a paged specification (skip/take in the spec) and counts all matches.</summary>
    public static async Task<PagedResponse<TResult>> PaginatedListAsync<T, TResult>(
        this IReadRepositoryBase<T> repository, ISpecification<T, TResult> specification, PaginationFilter filter,
        CancellationToken cancellationToken = default) where T : class
    {
        var items = await repository.ListAsync(specification, cancellationToken);
        var total = await repository.CountAsync(specification, cancellationToken);
        var (pageNumber, pageSize) = SpecificationBuilderExtensions.Normalize(filter);
        return new PagedResponse<TResult>(items, total, pageNumber, pageSize);
    }

    /// <summary>Same, for a specification that returns the entities themselves.</summary>
    public static async Task<PagedResponse<T>> PaginatedEntitiesAsync<T>(
        this IReadRepositoryBase<T> repository, ISpecification<T> specification, PaginationFilter filter,
        CancellationToken cancellationToken = default) where T : class
    {
        var items = await repository.ListAsync(specification, cancellationToken);
        var total = await repository.CountAsync(specification, cancellationToken);
        var (pageNumber, pageSize) = SpecificationBuilderExtensions.Normalize(filter);
        return new PagedResponse<T>(items, total, pageNumber, pageSize);
    }
}
