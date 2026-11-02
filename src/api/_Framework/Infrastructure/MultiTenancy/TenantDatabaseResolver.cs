using Finbuckle.MultiTenant.Abstractions;
using soft.square.net.ModularBlazor.Core;

namespace soft.square.net.ModularBlazor.Infrastructure.MultiTenancy;

/// <summary>Engine and connection string of a database.</summary>
public sealed record DatabaseConnection(DatabaseProvider Provider, string ConnectionString);

/// <summary>Tells a module DbContext which database to use for the current request.</summary>
public interface ITenantDatabaseResolver
{
    DatabaseConnection Resolve();
}

/// <summary>
/// The resolved tenant's database; when the request has no tenant (no X-Tenant header), the default database
/// (the one configured as ConnectionStrings:TenantStore), so the API also works single-tenant in development.
/// </summary>
internal sealed class TenantDatabaseResolver(
    IMultiTenantContextAccessor<AppTenantInfo> tenantAccessor,
    DatabaseConnection defaultDatabase) : ITenantDatabaseResolver
{
    public DatabaseConnection Resolve()
    {
        var tenant = tenantAccessor.MultiTenantContext?.TenantInfo;
        if (tenant is null) return defaultDatabase;

        if (string.IsNullOrWhiteSpace(tenant.ConnectionString))
            throw new InvalidOperationException($"Tenant '{tenant.Identifier}' has no connection string.");

        return new DatabaseConnection(tenant.Provider, tenant.ConnectionString);
    }
}
