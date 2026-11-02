using Ardalis.Specification;
using soft.square.net.ModularBlazor.Core.Pagination;
using soft.square.net.ModularBlazor.Core.Specifications;
using soft.square.net.ModularBlazor.Host.Modules.Multitenancy.Domain;

namespace soft.square.net.ModularBlazor.Host.Modules.Multitenancy.Application.Specifications;

public sealed class ProvisioningByTenantSpec : Specification<TenantProvisioning>
{
    public ProvisioningByTenantSpec(string tenantId)
        => Query.Where(p => p.TenantId == tenantId).OrderByDescending(p => p.CreatedOnUtc);
}

/// <summary>One page of provisioning records, filtered/ordered by the request.</summary>
public sealed class ProvisioningsByPaginationFilterSpec : EntitiesByPaginationFilterSpec<TenantProvisioning, TenantProvisioningDto>
{
    public ProvisioningsByPaginationFilterSpec(PaginationFilter filter) : base(filter)
        => Query.Select(p => new TenantProvisioningDto(
            p.Id, p.TenantId, p.Status.ToString(), p.Attempts, p.Error, p.StartedUtc, p.CompletedUtc));
}
