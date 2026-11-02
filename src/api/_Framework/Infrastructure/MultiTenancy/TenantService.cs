using Ardalis.Specification;
using Ardalis.Specification.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using soft.square.net.ModularBlazor.Core.Exceptions;
using soft.square.net.ModularBlazor.Core.Pagination;
using soft.square.net.ModularBlazor.Core.Specifications;
using soft.square.net.ModularBlazor.Core.Tenancy;

namespace soft.square.net.ModularBlazor.Infrastructure.MultiTenancy;

internal sealed class TenantService(
    TenantStoreDbContext db,
    ITenantDatabaseInitializer initializer,
    TimeProvider clock) : ITenantService
{
    /// <summary>Keyword search never looks at the connection string.</summary>
    private static readonly string[] SearchableFields = [nameof(AppTenantInfo.Identifier), nameof(AppTenantInfo.Name), nameof(AppTenantInfo.AdminEmail)];

    private DateTime UtcNow => clock.GetUtcNow().UtcDateTime;

    private sealed class TenantRepository(TenantStoreDbContext context) : RepositoryBase<AppTenantInfo>(context);

    private sealed class TenantsByPaginationFilterSpec : EntitiesByPaginationFilterSpec<AppTenantInfo, TenantDto>
    {
        public TenantsByPaginationFilterSpec(PaginationFilter filter) : base(filter)
        {
            Query.Select(t => new TenantDto(
                t.Id!, t.Identifier!, t.Name!, t.Provider, t.AdminEmail, t.IsActive, t.ValidUpto, t.Issuer));
            Query.AsNoTracking();
        }
    }

    public async Task<TenantDto> CreateAsync(CreateTenantRequest request, CancellationToken cancellationToken = default)
    {
        var identifier = request.Identifier.Trim().ToLowerInvariant();
        if (await db.Set<AppTenantInfo>().AnyAsync(t => t.Id == identifier || t.Identifier == identifier, cancellationToken))
            throw new ConflictException($"A tenant '{identifier}' already exists.");

        var tenant = new AppTenantInfo
        {
            Id = identifier,
            Identifier = identifier,
            Name = request.Name.Trim(),
            Provider = request.Provider,
            ConnectionString = request.ConnectionString,
            AdminEmail = request.AdminEmail,
            IsActive = true,
            ValidUpto = request.ValidUpto ?? UtcNow.AddYears(1),
            Issuer = request.Issuer
        };

        db.Set<AppTenantInfo>().Add(tenant);
        await db.SaveChangesAsync(cancellationToken);
        return ToDto(tenant);
    }

    public async Task ProvisionAsync(string id, CancellationToken cancellationToken = default)
        => await initializer.InitializeTenantAsync(await FindAsync(id, tracked: false, cancellationToken), cancellationToken);

    public async Task<TenantDto> GetAsync(string id, CancellationToken cancellationToken = default)
        => ToDto(await FindAsync(id, tracked: false, cancellationToken));

    public Task<PagedResponse<TenantDto>> SearchAsync(PaginationFilter filter, CancellationToken cancellationToken = default)
    {
        var restricted = new PaginationFilter
        {
            Keyword = filter.Keyword,
            SearchFields = filter.SearchFields is { Length: > 0 }
                ? filter.SearchFields.Where(f => SearchableFields.Contains(f, StringComparer.OrdinalIgnoreCase)).ToArray()
                : SearchableFields,
            PageNumber = filter.PageNumber,
            PageSize = filter.PageSize,
            OrderBy = filter.OrderBy
        };

        return new TenantRepository(db).PaginatedListAsync(new TenantsByPaginationFilterSpec(restricted), restricted, cancellationToken);
    }

    public async Task<TenantDto> ActivateAsync(string id, CancellationToken cancellationToken = default)
    {
        var tenant = await FindAsync(id, tracked: true, cancellationToken);
        if (tenant.IsActive) throw new ConflictException($"Tenant '{id}' is already active.");

        tenant.Activate();
        await db.SaveChangesAsync(cancellationToken);
        return ToDto(tenant);
    }

    public async Task<TenantDto> DeactivateAsync(string id, CancellationToken cancellationToken = default)
    {
        var tenant = await FindAsync(id, tracked: true, cancellationToken);
        if (tenant.Id == ITenantService.RootTenantId) throw new ConflictException("The root tenant cannot be deactivated.");
        if (!tenant.IsActive) throw new ConflictException($"Tenant '{id}' is already deactivated.");

        tenant.Deactivate();
        await db.SaveChangesAsync(cancellationToken);
        return ToDto(tenant);
    }

    public async Task<TenantDto> RenewAsync(string id, int months, CancellationToken cancellationToken = default)
    {
        if (months <= 0) throw new CustomException("Months must be positive.");

        var tenant = await FindAsync(id, tracked: true, cancellationToken);
        if (tenant.Id == ITenantService.RootTenantId) throw new ConflictException("The root tenant's validity cannot be changed.");

        tenant.Renew(months, UtcNow);
        await db.SaveChangesAsync(cancellationToken);
        return ToDto(tenant);
    }

    private async Task<AppTenantInfo> FindAsync(string id, bool tracked, CancellationToken cancellationToken)
    {
        var query = db.Set<AppTenantInfo>().AsQueryable();
        if (!tracked) query = query.AsNoTracking();

        var key = id.Trim().ToLowerInvariant();
        return await query.FirstOrDefaultAsync(t => t.Id == key, cancellationToken)
               ?? throw new NotFoundException($"Tenant '{id}' was not found.");
    }

    private static TenantDto ToDto(AppTenantInfo t)
        => new(t.Id!, t.Identifier!, t.Name!, t.Provider, t.AdminEmail, t.IsActive, t.ValidUpto, t.Issuer);
}
