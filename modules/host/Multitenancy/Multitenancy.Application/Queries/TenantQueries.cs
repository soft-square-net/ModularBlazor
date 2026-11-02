using MediatR;
using soft.square.net.ModularBlazor.Core.Pagination;
using soft.square.net.ModularBlazor.Core.Persistence;
using soft.square.net.ModularBlazor.Core.Specifications;
using soft.square.net.ModularBlazor.Core.Tenancy;
using soft.square.net.ModularBlazor.Host.Modules.Multitenancy.Application.Specifications;
using soft.square.net.ModularBlazor.Host.Modules.Multitenancy.Domain;

namespace soft.square.net.ModularBlazor.Host.Modules.Multitenancy.Application.Queries;

public sealed record SearchTenantsQuery(PaginationFilter Filter) : IRequest<PagedResponse<TenantDto>>;

public sealed class SearchTenantsQueryHandler(ITenantService tenants)
    : IRequestHandler<SearchTenantsQuery, PagedResponse<TenantDto>>
{
    public Task<PagedResponse<TenantDto>> Handle(SearchTenantsQuery q, CancellationToken cancellationToken)
        => tenants.SearchAsync(q.Filter, cancellationToken);
}

public sealed record GetTenantQuery(string Id) : IRequest<TenantDto>;

public sealed class GetTenantQueryHandler(ITenantService tenants) : IRequestHandler<GetTenantQuery, TenantDto>
{
    public Task<TenantDto> Handle(GetTenantQuery q, CancellationToken cancellationToken)
        => tenants.GetAsync(q.Id, cancellationToken);
}

public sealed record SearchProvisioningsQuery(PaginationFilter Filter) : IRequest<PagedResponse<TenantProvisioningDto>>;

public sealed class SearchProvisioningsQueryHandler(IReadRepository<TenantProvisioning> provisionings)
    : IRequestHandler<SearchProvisioningsQuery, PagedResponse<TenantProvisioningDto>>
{
    public Task<PagedResponse<TenantProvisioningDto>> Handle(SearchProvisioningsQuery q, CancellationToken cancellationToken)
        => provisionings.PaginatedListAsync(new ProvisioningsByPaginationFilterSpec(q.Filter), q.Filter, cancellationToken);
}
