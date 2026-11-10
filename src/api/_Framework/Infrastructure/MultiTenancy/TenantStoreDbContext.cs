using Finbuckle.MultiTenant.EntityFrameworkCore.Stores;
using Microsoft.EntityFrameworkCore;

namespace soft.square.net.ModularBlazor.Infrastructure.MultiTenancy;

/// <summary>The database that lists all tenants (Finbuckle's EF Core store). Not tenant-scoped itself.</summary>
public sealed class TenantStoreDbContext(DbContextOptions<TenantStoreDbContext> options)
    : EFCoreStoreDbContext<AppTenantInfo>(options);
