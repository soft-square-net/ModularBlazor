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
    /// <summary>Also makes <paramref name="tenantId"/> the current tenant of the scope, so rows are stamped with it.</summary>
    void Use(DatabaseConnection database, string? tenantId = null);

    /// <summary>The tenant set with <see cref="Use"/>, if any.</summary>
    string? TenantId { get; }
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

    public string? TenantId { get; private set; }

    public void Use(DatabaseConnection database, string? tenantId = null)
    {
        _override = database;
        TenantId = tenantId;
    }

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
