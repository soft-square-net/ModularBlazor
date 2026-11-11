using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Builder;
using Microsoft.Extensions.DependencyInjection;

namespace soft.square.net.WebApi.Contracts.Tenancy;

/// <summary>Names shared by the host, the gateway, the identity service and the modules.</summary>
public static class TenancyNames
{
    /// <summary>Request header that names the tenant (API clients, the lab, service-to-service calls).</summary>
    public const string Header = "X-Tenant";

    /// <summary>Access-token claim holding the one tenant the token was issued for (see the auth design).</summary>
    public const string Claim = "tenant";

    /// <summary>Message header (broker) that carries the tenant of a message.</summary>
    public const string MessageHeader = "tenant";
}

[JsonConverter(typeof(JsonStringEnumConverter<TenantStatus>))]
public enum TenantStatus { Active, Suspended }

/// <summary>
/// A tenant as the platform sees it. The connection details name a server (a connection string name in the host's
/// configuration) and a database on it: no secrets are stored with the tenant.
/// </summary>
public sealed record TenantInfo(string Id, string Name, TenantStatus Status, IReadOnlyList<string> Hosts, string DatabaseServer, string DatabaseName)
{
    public bool IsActive => Status == TenantStatus.Active;
}

/// <summary>
/// The tenant of the current request (resolved by the host for every request) or of the current tenant scope
/// (<see cref="TenantScopeExtensions.CreateTenantScope"/>). Scoped; inject it into any module service.
/// </summary>
public interface ITenantContext
{
    TenantInfo? Tenant { get; }

    /// <summary>How the tenant was found: "header", "host", "claim" or "scope".</summary>
    string? ResolvedBy { get; }

    bool IsResolved => Tenant is not null;

    string? TenantId => Tenant?.Id;

    /// <summary>The tenant, or an exception for code that cannot run without one.</summary>
    TenantInfo Required => Tenant ?? throw new InvalidOperationException("This operation needs a tenant, and none was resolved for the current scope.");
}

/// <summary>Sets the tenant of a scope that is not a request (a message, a job). Used by <see cref="TenantScopeExtensions"/>.</summary>
public interface ITenantScopeInitializer
{
    void Use(TenantInfo tenant, string resolvedBy);
}

/// <summary>
/// The platform's tenants, as every replica sees them: read from the tenant store, cached in memory and refreshed when
/// any replica reports a change (broker topic "tenants.changed").
/// </summary>
public interface ITenantDirectory
{
    IReadOnlyCollection<TenantInfo> All { get; }

    TenantInfo? Find(string id);

    TenantInfo? FindByHost(string host);

    /// <summary>Reloads this replica and tells every other one to do the same. Call after writing to the tenant store.</summary>
    Task NotifyChangedAsync(string tenantId, CancellationToken ct);
}

/// <summary>
/// Runs once for each active tenant after the module is loaded on a replica, and again whenever a tenant is added or
/// re-activated (database migrations, seeding). The host awaits it before the module serves that tenant.
/// </summary>
public interface ITenantInitializer
{
    Task InitializeAsync(TenantInfo tenant, CancellationToken ct);
}

/// <summary>Runs once after the module is loaded on a replica, before its tenant initializers (cancelled on unload).</summary>
public interface IModuleActivation
{
    Task ActivatedAsync(CancellationToken ct);
}

/// <summary>
/// Endpoint metadata: the endpoint also works without a tenant (platform-level endpoints). Runtime-module endpoints
/// require a tenant unless they carry this; a tenant named in the request must still exist and be active.
/// </summary>
public sealed class TenantOptionalMetadata
{
    public static TenantOptionalMetadata Instance { get; } = new();
}

public static class TenantEndpointExtensions
{
    /// <summary>Lets the endpoint run without a tenant (see <see cref="TenantOptionalMetadata"/>).</summary>
    public static TBuilder TenantOptional<TBuilder>(this TBuilder builder) where TBuilder : IEndpointConventionBuilder =>
        builder.WithMetadata(TenantOptionalMetadata.Instance);
}

public static class TenantScopeExtensions
{
    /// <summary>
    /// A service scope bound to <paramref name="tenant"/>, for work outside a request (a consumer handling a message
    /// with a tenant header, a job looping over <see cref="ITenantDirectory.All"/>). Called on a module's provider it
    /// is a module scope, so the module's own services resolve.
    /// </summary>
    public static AsyncServiceScope CreateTenantScope(this IServiceProvider services, TenantInfo tenant)
    {
        var scope = services.CreateAsyncScope();
        scope.ServiceProvider.GetRequiredService<ITenantScopeInitializer>().Use(tenant, "scope");
        return scope;
    }

    /// <inheritdoc cref="CreateTenantScope(IServiceProvider, TenantInfo)"/>
    public static AsyncServiceScope CreateTenantScope(this IServiceProvider services, string tenantId)
    {
        var tenant = services.GetRequiredService<ITenantDirectory>().Find(tenantId)
                     ?? throw new InvalidOperationException($"Unknown tenant '{tenantId}'.");
        return services.CreateTenantScope(tenant);
    }
}
