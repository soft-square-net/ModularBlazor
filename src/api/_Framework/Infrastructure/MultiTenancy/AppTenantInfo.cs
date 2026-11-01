using Finbuckle.MultiTenant.Abstractions;
using soft.square.net.ModularBlazor.Core;

namespace soft.square.net.ModularBlazor.Infrastructure.MultiTenancy;

/// <summary>
/// A tenant. Each tenant owns a database: its engine and connection string are stored with the tenant
/// in the tenant store, so tenants can live on different providers.
/// </summary>
public sealed class AppTenantInfo : ITenantInfo
{
    public string? Id { get; set; }

    /// <summary>The value resolved from the request (the X-Tenant header), e.g. "acme".</summary>
    public string? Identifier { get; set; }

    public string? Name { get; set; }

    public DatabaseProvider Provider { get; set; } = DatabaseProvider.SqlServer;

    public string? ConnectionString { get; set; }
}
