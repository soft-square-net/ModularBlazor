using Finbuckle.MultiTenant.EntityFrameworkCore.Stores.EFCoreStore;
using Microsoft.EntityFrameworkCore;

namespace ModularBlazor.Infrastructure.MultiTenancy;

/// <summary>The database that lists all tenants (Finbuckle's EF Core store). Not tenant-scoped itself.</summary>
public sealed class TenantStoreDbContext(DbContextOptions<TenantStoreDbContext> options)
    : EFCoreStoreDbContext<AppTenantInfo>(options);
