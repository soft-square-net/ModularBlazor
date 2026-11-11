using Microsoft.Extensions.Configuration;
using Npgsql;
using soft.square.net.WebApi.Contracts.Tenancy;

namespace soft.square.net.WebApi.Data;

/// <summary>
/// Connection details of tenant databases (host singleton). A tenant names a server, which is a connection string in
/// the host's configuration (ConnectionStrings:&lt;server&gt;, e.g. the lab's "tenant-data" Postgres server), and a
/// database on that server. Secrets stay in configuration; the tenant store only holds names.
/// </summary>
public sealed class TenantDatabases(IConfiguration configuration)
{
    public string ConnectionString(TenantInfo tenant) => ConnectionString(tenant.DatabaseServer, tenant.DatabaseName);

    public string ConnectionString(string server, string database)
    {
        var serverConnection = configuration.GetConnectionString(server);
        if (string.IsNullOrWhiteSpace(serverConnection))
            throw new InvalidOperationException($"Tenant database server '{server}' is not configured (ConnectionStrings:{server}).");
        return new NpgsqlConnectionStringBuilder(serverConnection) { Database = database }.ConnectionString;
    }

    /// <summary>Creates the tenant's database when the server does not have it yet (provisioning a new tenant).</summary>
    public async Task<bool> EnsureDatabaseAsync(TenantInfo tenant, CancellationToken ct)
    {
        await using var connection = new NpgsqlConnection(ConnectionString(tenant.DatabaseServer, "postgres"));
        await connection.OpenAsync(ct);

        await using (var exists = new NpgsqlCommand("SELECT 1 FROM pg_database WHERE datname = @name", connection))
        {
            exists.Parameters.AddWithValue("name", tenant.DatabaseName);
            if (await exists.ExecuteScalarAsync(ct) is not null) return false;
        }

        // CREATE DATABASE takes no parameters: quote the identifier.
        var quoted = "\"" + tenant.DatabaseName.Replace("\"", "\"\"") + "\"";
        await using var create = new NpgsqlCommand($"CREATE DATABASE {quoted}", connection);
        try { await create.ExecuteNonQueryAsync(ct); }
        catch (PostgresException e) when (e.SqlState == PostgresErrorCodes.DuplicateDatabase) { return false; } // another replica won
        return true;
    }

    /// <summary>
    /// A Postgres session-level advisory lock in the tenant's database, held until the result is disposed. Every
    /// replica of every pool that loads a module tries to migrate it; the lock makes the migration run once at a time.
    /// </summary>
    public Task<IAsyncDisposable> LockAsync(TenantInfo tenant, string key, CancellationToken ct) =>
        AdvisoryLock.AcquireAsync(ConnectionString(tenant), key, ct);
}

public static class AdvisoryLock
{
    public static async Task<IAsyncDisposable> AcquireAsync(string connectionString, string key, CancellationToken ct)
    {
        var connection = new NpgsqlConnection(connectionString);
        try
        {
            await connection.OpenAsync(ct);
            await using var command = new NpgsqlCommand("SELECT pg_advisory_lock(hashtext(@key))", connection);
            command.Parameters.AddWithValue("key", key);
            await command.ExecuteNonQueryAsync(ct);
            return new Held(connection, key);
        }
        catch
        {
            await connection.DisposeAsync();
            throw;
        }
    }

    private sealed class Held(NpgsqlConnection connection, string key) : IAsyncDisposable
    {
        public async ValueTask DisposeAsync()
        {
            try
            {
                await using var command = new NpgsqlCommand("SELECT pg_advisory_unlock(hashtext(@key))", connection);
                command.Parameters.AddWithValue("key", key);
                await command.ExecuteNonQueryAsync();
            }
            finally { await connection.DisposeAsync(); } // closing the session releases the lock anyway
        }
    }
}
