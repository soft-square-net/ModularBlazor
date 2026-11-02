using soft.square.net.ModularBlazor.Core.Pagination;

namespace soft.square.net.ModularBlazor.Core.Tenancy;

/// <summary>A tenant as the API shows it (never the connection string).</summary>
public sealed record TenantDto(
    string Id, string Identifier, string Name, DatabaseProvider Provider,
    string? AdminEmail, bool IsActive, DateTime ValidUpto, string? Issuer);

public sealed record CreateTenantRequest(
    string Identifier, string Name, DatabaseProvider Provider, string ConnectionString,
    string? AdminEmail = null, DateTime? ValidUpto = null, string? Issuer = null);

/// <summary>Tenant management. Implemented in Infrastructure over the tenant store.</summary>
public interface ITenantService
{
    /// <summary>The tenant that owns the default database. It cannot be deactivated.</summary>
    const string RootTenantId = "root";

    Task<TenantDto> CreateAsync(CreateTenantRequest request, CancellationToken cancellationToken = default);

    /// <summary>Creates/migrates the tenant's database and seeds it. Safe to repeat.</summary>
    Task ProvisionAsync(string id, CancellationToken cancellationToken = default);

    Task<TenantDto> GetAsync(string id, CancellationToken cancellationToken = default);
    Task<PagedResponse<TenantDto>> SearchAsync(PaginationFilter filter, CancellationToken cancellationToken = default);
    Task<TenantDto> ActivateAsync(string id, CancellationToken cancellationToken = default);
    Task<TenantDto> DeactivateAsync(string id, CancellationToken cancellationToken = default);

    /// <summary>Extends the subscription by whole months: from the current expiry, or from now when it already lapsed.</summary>
    Task<TenantDto> RenewAsync(string id, int months, CancellationToken cancellationToken = default);
}
