using Microsoft.Extensions.Configuration;
using soft.square.net.WebApi.Contracts.Tenancy;

namespace soft.square.net.WebApi.Data;

/// <summary>
/// The database servers the host knows and the tenant databases on them (host singleton).
/// A server is a connection string (ConnectionStrings:&lt;server&gt;) plus its engine (DatabaseServers:&lt;server&gt;:Provider:
/// PostgreSql, SqlServer, MySql or Oracle; PostgreSql when not set). A tenant names a server and a database on it, so
/// every tenant can live on a different engine. Secrets stay in configuration; the tenant store only holds names.
/// </summary>
public sealed class TenantDatabases(IConfiguration configuration)
{
    /// <summary>Connection string name of the tenant store (registry of tenants).</summary>
    public const string StoreServerName = "TenantStore";

    public DatabaseServer Server(string name)
    {
        var connection = configuration.GetConnectionString(name);
        if (string.IsNullOrWhiteSpace(connection))
            throw new InvalidOperationException($"Database server '{name}' is not configured (ConnectionStrings:{name}).");
        return new DatabaseServer(name, ProviderOf(name), connection);
    }

    public bool IsConfigured(string name) => !string.IsNullOrWhiteSpace(configuration.GetConnectionString(name));

    /// <summary>The configured engine of a server.</summary>
    public DatabaseProvider ProviderOf(string name)
    {
        var value = configuration[$"DatabaseServers:{name}:Provider"];
        if (string.IsNullOrWhiteSpace(value)) return DatabaseProvider.PostgreSql;
        return Enum.TryParse<DatabaseProvider>(value, ignoreCase: true, out var provider)
            ? provider
            : throw new InvalidOperationException($"DatabaseServers:{name}:Provider '{value}' is not one of {string.Join(", ", Enum.GetNames<DatabaseProvider>())}.");
    }

    /// <summary>The tenant store itself (its connection string names its database).</summary>
    public DatabaseServer Store => Server(StoreServerName);

    public DatabaseServer ServerOf(TenantInfo tenant) => Server(tenant.DatabaseServer);

    public string ConnectionString(TenantInfo tenant)
    {
        var server = ServerOf(tenant);
        return server.Adapter.ConnectionString(server.ConnectionString, tenant.DatabaseName);
    }

    /// <summary>Creates the tenant's database (Oracle: its schema) when the server does not have it yet.</summary>
    public Task<bool> EnsureDatabaseAsync(TenantInfo tenant, CancellationToken ct)
    {
        var server = ServerOf(tenant);
        return server.Adapter.EnsureDatabaseAsync(server.ConnectionString, tenant.DatabaseName, ct);
    }

    /// <summary>
    /// An exclusive lock on the tenant's server, held until disposed. Every replica of every pool that loads a module
    /// tries to migrate it; the lock makes the migration run once at a time. The key names the tenant's database.
    /// </summary>
    public Task<IAsyncDisposable> LockAsync(TenantInfo tenant, string key, CancellationToken ct)
    {
        var server = ServerOf(tenant);
        var connection = server.Adapter.LockConnectionString(server.ConnectionString, ConnectionString(tenant));
        return server.Adapter.LockAsync(connection, $"{tenant.DatabaseName}:{key}", ct);
    }
}
