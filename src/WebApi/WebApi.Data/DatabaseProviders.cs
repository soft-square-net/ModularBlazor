using System.Data.Common;
using Microsoft.Data.SqlClient;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using MySql.Data.MySqlClient;
using MySql.EntityFrameworkCore.Extensions;
using Npgsql;
using Oracle.ManagedDataAccess.Client;

namespace soft.square.net.WebApi.Data;

/// <summary>Database engines a tenant database (or the tenant store) can live on. All have EF Core 10 providers.</summary>
public enum DatabaseProvider { PostgreSql, SqlServer, MySql, Oracle }

/// <summary>A configured database server: its engine and its server-level connection string.</summary>
public sealed record DatabaseServer(string Name, DatabaseProvider Provider, string ConnectionString)
{
    public DatabaseProviderAdapter Adapter => DatabaseProviderAdapter.For(Provider);
}

/// <summary>
/// Everything that differs between engines: connection strings, EF Core registration, creating a tenant database,
/// cross-replica locks and how a module's tables are kept apart.
/// <list type="bullet">
/// <item><b>PostgreSQL, SQL Server:</b> a database per tenant, a schema per module.</item>
/// <item><b>MySQL:</b> a database per tenant (a MySQL schema is a database), a table-name prefix per module.</item>
/// <item><b>Oracle:</b> a schema-only user per tenant (no password), signed in through the server account (proxy
/// authentication); a table-name prefix per module.</item>
/// </list>
/// </summary>
public abstract class DatabaseProviderAdapter
{
    private static readonly DatabaseProviderAdapter[] All =
        [new PostgreSqlAdapter(), new SqlServerAdapter(), new MySqlAdapter(), new OracleAdapter()];

    public static DatabaseProviderAdapter For(DatabaseProvider provider) => All[(int)provider];

    /// <summary>The adapter for an EF Core provider name (<c>Database.ProviderName</c>, the provider's assembly name).</summary>
    public static DatabaseProviderAdapter? ForEfProvider(string? efProviderName) =>
        All.FirstOrDefault(a => string.Equals(a.EfProviderName, efProviderName, StringComparison.Ordinal));

    public abstract DatabaseProvider Provider { get; }

    /// <summary>EF Core's provider name, which is the provider assembly's name.</summary>
    public abstract string EfProviderName { get; }

    /// <summary>True: a module's tables go into a schema named after the module. False: their names get the module's prefix.</summary>
    public abstract bool SupportsSchemas { get; }

    /// <summary>The connection string of one database on the server.</summary>
    public abstract string ConnectionString(string serverConnection, string database);

    /// <summary>Configures the context for this engine (connection plus whatever the engine needs per connection).</summary>
    public abstract void Use(DbContextOptionsBuilder options, string connectionString, string database);

    /// <summary>Registers the engine's EF Core services in an internal service provider.</summary>
    public abstract IServiceCollection AddEntityFramework(IServiceCollection services);

    public abstract DbConnection CreateConnection(string connectionString);

    /// <summary>Creates the database (Oracle: the schema user) when the server does not have it. True when created.</summary>
    public abstract Task<bool> EnsureDatabaseAsync(string serverConnection, string database, CancellationToken ct);

    /// <summary>Where a tenant's migration lock is taken: the tenant's own database, unless the engine needs the server account.</summary>
    public virtual string LockConnectionString(string serverConnection, string tenantConnection) => tenantConnection;

    /// <summary>A named, exclusive lock held until disposed; replicas use it so a migration runs once at a time.</summary>
    public async Task<IAsyncDisposable> LockAsync(string connectionString, string key, CancellationToken ct)
    {
        var connection = CreateConnection(connectionString);
        try
        {
            await connection.OpenAsync(ct);
            await ExecuteAsync(connection, AcquireSql, key, ct);
            return new Held(this, connection, key);
        }
        catch
        {
            await connection.DisposeAsync();
            throw;
        }
    }

    protected abstract string AcquireSql { get; }
    protected abstract string ReleaseSql { get; }

    /// <summary>Lock name as the engine wants it (some cap the length or want a number).</summary>
    protected virtual object LockKey(string key) => key;

    private async Task ExecuteAsync(DbConnection connection, string sql, string key, CancellationToken ct)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        var parameter = command.CreateParameter();
        parameter.ParameterName = "lockKey";
        parameter.Value = LockKey(key);
        command.Parameters.Add(parameter);
        await command.ExecuteNonQueryAsync(ct);
    }

    protected static async Task<object?> ScalarAsync(DbConnection connection, string sql, string parameterName, object value, CancellationToken ct)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        var parameter = command.CreateParameter();
        parameter.ParameterName = parameterName;
        parameter.Value = value;
        command.Parameters.Add(parameter);
        return await command.ExecuteScalarAsync(ct);
    }

    protected static async Task NonQueryAsync(DbConnection connection, string sql, CancellationToken ct)
    {
        await using var command = connection.CreateCommand();
        command.CommandText = sql;
        await command.ExecuteNonQueryAsync(ct);
    }

    /// <summary>Stable 31-bit hash of a lock key, for engines that lock by number.</summary>
    protected static int StableHash(string key)
    {
        unchecked
        {
            var hash = (int)2166136261;
            foreach (var c in key) hash = (hash ^ c) * 16777619;
            return hash & 0x3FFFFFFF;
        }
    }

    private sealed class Held(DatabaseProviderAdapter adapter, DbConnection connection, string key) : IAsyncDisposable
    {
        public async ValueTask DisposeAsync()
        {
            try { await adapter.ExecuteAsync(connection, adapter.ReleaseSql, key, CancellationToken.None); }
            catch (DbException) { } // closing the session releases the lock anyway
            finally { await connection.DisposeAsync(); }
        }
    }
}

internal sealed class PostgreSqlAdapter : DatabaseProviderAdapter
{
    public override DatabaseProvider Provider => DatabaseProvider.PostgreSql;
    public override string EfProviderName => "Npgsql.EntityFrameworkCore.PostgreSQL";
    public override bool SupportsSchemas => true;

    public override string ConnectionString(string serverConnection, string database) =>
        new NpgsqlConnectionStringBuilder(serverConnection) { Database = database }.ConnectionString;

    public override void Use(DbContextOptionsBuilder options, string connectionString, string database) => options.UseNpgsql(connectionString);
    public override IServiceCollection AddEntityFramework(IServiceCollection services) => services.AddEntityFrameworkNpgsql();
    public override DbConnection CreateConnection(string connectionString) => new NpgsqlConnection(connectionString);

    public override async Task<bool> EnsureDatabaseAsync(string serverConnection, string database, CancellationToken ct)
    {
        await using var connection = CreateConnection(ConnectionString(serverConnection, "postgres"));
        await connection.OpenAsync(ct);
        if (await ScalarAsync(connection, "SELECT 1 FROM pg_database WHERE datname = @name", "name", database, ct) is not null) return false;
        try { await NonQueryAsync(connection, $"CREATE DATABASE \"{database.Replace("\"", "\"\"")}\"", ct); }
        catch (PostgresException e) when (e.SqlState == PostgresErrorCodes.DuplicateDatabase) { return false; } // another replica won
        return true;
    }

    protected override string AcquireSql => "SELECT pg_advisory_lock(hashtext(@lockKey))";
    protected override string ReleaseSql => "SELECT pg_advisory_unlock(hashtext(@lockKey))";
}

internal sealed class SqlServerAdapter : DatabaseProviderAdapter
{
    public override DatabaseProvider Provider => DatabaseProvider.SqlServer;
    public override string EfProviderName => "Microsoft.EntityFrameworkCore.SqlServer";
    public override bool SupportsSchemas => true;

    public override string ConnectionString(string serverConnection, string database) =>
        new SqlConnectionStringBuilder(serverConnection) { InitialCatalog = database }.ConnectionString;

    public override void Use(DbContextOptionsBuilder options, string connectionString, string database) => options.UseSqlServer(connectionString);
    public override IServiceCollection AddEntityFramework(IServiceCollection services) => services.AddEntityFrameworkSqlServer();
    public override DbConnection CreateConnection(string connectionString) => new SqlConnection(connectionString);

    public override async Task<bool> EnsureDatabaseAsync(string serverConnection, string database, CancellationToken ct)
    {
        await using var connection = CreateConnection(ConnectionString(serverConnection, "master"));
        await connection.OpenAsync(ct);
        // QUOTENAME builds the identifier; the name itself only travels as a parameter.
        var created = await ScalarAsync(connection,
            "IF DB_ID(@name) IS NULL BEGIN DECLARE @sql nvarchar(max) = N'CREATE DATABASE ' + QUOTENAME(@name); EXEC(@sql); SELECT 1; END ELSE SELECT 0;",
            "name", database, ct);
        return Convert.ToInt32(created) == 1;
    }

    protected override string AcquireSql =>
        "DECLARE @r int; EXEC @r = sp_getapplock @Resource = @lockKey, @LockMode = 'Exclusive', @LockOwner = 'Session', @LockTimeout = -1; IF @r < 0 THROW 50000, 'sp_getapplock failed', 1;";
    protected override string ReleaseSql => "EXEC sp_releaseapplock @Resource = @lockKey, @LockOwner = 'Session';";
}

internal sealed class MySqlAdapter : DatabaseProviderAdapter
{
    public override DatabaseProvider Provider => DatabaseProvider.MySql;
    public override string EfProviderName => "MySql.EntityFrameworkCore";
    public override bool SupportsSchemas => false;

    public override string ConnectionString(string serverConnection, string database) =>
        new MySqlConnectionStringBuilder(serverConnection) { Database = database }.ConnectionString;

    public override void Use(DbContextOptionsBuilder options, string connectionString, string database) => options.UseMySQL(connectionString);
    public override IServiceCollection AddEntityFramework(IServiceCollection services) => services.AddEntityFrameworkMySQL();
    public override DbConnection CreateConnection(string connectionString) => new MySqlConnection(connectionString);

    public override async Task<bool> EnsureDatabaseAsync(string serverConnection, string database, CancellationToken ct)
    {
        var server = new MySqlConnectionStringBuilder(serverConnection) { Database = "" }.ConnectionString;
        await using var connection = CreateConnection(server);
        await connection.OpenAsync(ct);
        if (await ScalarAsync(connection, "SELECT 1 FROM information_schema.schemata WHERE schema_name = @name", "name", database, ct) is not null) return false;
        await NonQueryAsync(connection, $"CREATE DATABASE IF NOT EXISTS `{database.Replace("`", "``")}`", ct);
        return true;
    }

    // GET_LOCK names are at most 64 characters: lock on a hash of the key.
    protected override object LockKey(string key) => $"webapi:{StableHash(key)}";
    protected override string AcquireSql => "SELECT GET_LOCK(@lockKey, -1)";
    protected override string ReleaseSql => "SELECT RELEASE_LOCK(@lockKey)";
}

internal sealed class OracleAdapter : DatabaseProviderAdapter
{
    public override DatabaseProvider Provider => DatabaseProvider.Oracle;
    public override string EfProviderName => "Oracle.EntityFrameworkCore";
    public override bool SupportsSchemas => false;

    /// <summary>
    /// The server connection names the pluggable database and a provisioning account; a tenant's "database" is a
    /// schema-only user inside it. Tenant connections sign in AS that user through the provisioning account (proxy
    /// authentication), so the session's own schema, USER_TABLES included, is the tenant's: EF's migration history
    /// checks query USER_TABLES, which ALTER SESSION SET CURRENT_SCHEMA does not change.
    /// </summary>
    public override string ConnectionString(string serverConnection, string database)
    {
        if (string.IsNullOrEmpty(database)) return serverConnection; // the server itself (e.g. the tenant store)
        var builder = new OracleConnectionStringBuilder(serverConnection);
        var proxyUser = builder.UserID;
        var proxyPassword = builder.Password;
        builder.Remove("Password");
        builder.UserID = SchemaName(database);
        builder["Proxy User Id"] = proxyUser;
        builder["Proxy Password"] = proxyPassword;
        return builder.ConnectionString;
    }

    public override void Use(DbContextOptionsBuilder options, string connectionString, string database) => options.UseOracle(connectionString);

    public override IServiceCollection AddEntityFramework(IServiceCollection services) => services.AddEntityFrameworkOracle();
    public override DbConnection CreateConnection(string connectionString) => new OracleConnection(connectionString);

    /// <summary>Oracle identifier for a tenant database name: upper case, letters, digits and '_'.</summary>
    public static string SchemaName(string database) =>
        new string(database.ToUpperInvariant().Select(c => char.IsAsciiLetterOrDigit(c) || c == '_' ? c : '_').ToArray());

    /// <summary>
    /// Creates the schema-only user (it owns the tenant's tables and cannot sign in with a password) and lets the
    /// provisioning account connect through it. Idempotent: the grants are applied again for an existing user, which
    /// also repairs a schema created without them. Needs a provisioning account with CREATE USER, GRANT ANY PRIVILEGE
    /// and ALTER USER (the lab uses SYSTEM).
    /// </summary>
    public override async Task<bool> EnsureDatabaseAsync(string serverConnection, string database, CancellationToken ct)
    {
        var schema = SchemaName(database);
        var proxyUser = new OracleConnectionStringBuilder(serverConnection).UserID.ToUpperInvariant();
        await using var connection = CreateConnection(serverConnection);
        await connection.OpenAsync(ct);

        var created = false;
        if (Convert.ToInt32(await ScalarAsync(connection, "SELECT COUNT(*) FROM all_users WHERE username = :name", "name", schema, ct)) == 0)
        {
            try
            {
                await NonQueryAsync(connection, $"CREATE USER \"{schema}\" NO AUTHENTICATION DEFAULT TABLESPACE USERS QUOTA UNLIMITED ON USERS", ct);
                created = true;
            }
            catch (OracleException e) when (e.Number == 1920) { } // ORA-01920: another replica won
        }

        await NonQueryAsync(connection, $"GRANT CREATE SESSION, CREATE TABLE, CREATE SEQUENCE, CREATE VIEW, CREATE PROCEDURE, CREATE TRIGGER TO \"{schema}\"", ct);
        await NonQueryAsync(connection, $"ALTER USER \"{schema}\" GRANT CONNECT THROUGH \"{proxyUser}\"", ct);
        return created;
    }

    /// <summary>DBMS_LOCK needs EXECUTE on SYS.DBMS_LOCK, which the provisioning account has and tenant schemas do not.</summary>
    public override string LockConnectionString(string serverConnection, string tenantConnection) => serverConnection;

    // DBMS_LOCK by number. Session-level: released on RELEASE or disconnect. Instance-wide, so the key names the tenant.
    protected override object LockKey(string key) => StableHash(key);
    protected override string AcquireSql =>
        "DECLARE r INTEGER; BEGIN r := DBMS_LOCK.REQUEST(id => :lockKey, lockmode => DBMS_LOCK.X_MODE, timeout => DBMS_LOCK.MAXWAIT, release_on_commit => FALSE); IF r NOT IN (0, 4) THEN RAISE_APPLICATION_ERROR(-20001, 'DBMS_LOCK.REQUEST returned ' || r); END IF; END;";
    protected override string ReleaseSql => "DECLARE r INTEGER; BEGIN r := DBMS_LOCK.RELEASE(id => :lockKey); END;";
}
