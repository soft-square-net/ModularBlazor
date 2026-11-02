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

/// <summary>Points the current scope at a specific database (provisioning a tenant outside of a request).</summary>
public interface ITenantDatabaseOverride
{
    void Use(DatabaseConnection database);
}

/// <summary>
/// The override, else the resolved tenant's database; when the request has no tenant (no X-Tenant header), the
/// default database (the one configured as ConnectionStrings:TenantStore), so the API also works single-tenant
/// in development.
/// </summary>
internal sealed class TenantDatabaseResolver(
    IMultiTenantContextAccessor<AppTenantInfo> tenantAccessor,
    DatabaseConnection defaultDatabase) : ITenantDatabaseResolver, ITenantDatabaseOverride
{
    private DatabaseConnection? _override;

    public void Use(DatabaseConnection database) => _override = database;

    public DatabaseConnection Resolve()
    {
        if (_override is not null) return _override;

        var tenant = tenantAccessor.MultiTenantContext?.TenantInfo;
        if (tenant is null) return defaultDatabase;

        if (string.IsNullOrWhiteSpace(tenant.ConnectionString))
            throw new InvalidOperationException($"Tenant '{tenant.Identifier}' has no connection string.");

        return new DatabaseConnection(tenant.Provider, tenant.ConnectionString);
    }
}
