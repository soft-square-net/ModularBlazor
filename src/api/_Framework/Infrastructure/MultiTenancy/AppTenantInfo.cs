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

    public string? AdminEmail { get; set; }

    public bool IsActive { get; set; } = true;

    /// <summary>The subscription's end (UTC). After it the tenant's requests are refused.</summary>
    public DateTime ValidUpto { get; set; } = DateTime.UtcNow.AddYears(1);

    public string? Issuer { get; set; }

    public bool IsValid(DateTime utcNow) => IsActive && ValidUpto >= utcNow;

    public void Activate() => IsActive = true;

    public void Deactivate() => IsActive = false;

    /// <summary>Adds whole months to the subscription: from the current end when still valid, else from now.</summary>
    public void Renew(int months, DateTime utcNow)
    {
        var start = ValidUpto > utcNow ? ValidUpto : utcNow;
        ValidUpto = start.AddMonths(months);
    }
}
