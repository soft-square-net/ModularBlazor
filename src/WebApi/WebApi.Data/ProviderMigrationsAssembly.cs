using System.Reflection;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Diagnostics;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using Microsoft.EntityFrameworkCore.Migrations.Internal;
using Microsoft.EntityFrameworkCore.Storage;

namespace soft.square.net.WebApi.Data;

#pragma warning disable EF1001 // MigrationsAssembly is EF's own implementation; it is subclassed, not changed.

/// <summary>
/// Lets one assembly carry a migration set per database engine for the same DbContext, so a module ships every
/// engine's migrations in its own assembly. Each set lives in a namespace ending in <c>.Migrations.&lt;Provider&gt;</c>
/// (PostgreSql, SqlServer, MySql, Oracle), e.g. <c>…Infrastructure.Migrations.SqlServer</c>, and this keeps only the set
/// (and model snapshot) of the engine the context runs on. An assembly without such namespaces works as before.
/// <para>Registered for module contexts by <see cref="TenantEfServices"/>, for the tenant store by the host, and at
/// design time by <see cref="TenantDbDesignTime"/>, so <c>dotnet ef migrations add</c> diffs against the right snapshot.</para>
/// </summary>
public sealed class ProviderMigrationsAssembly : MigrationsAssembly
{
    private readonly Type _contextType;
    private readonly string? _segment;
    private IReadOnlyDictionary<string, TypeInfo>? _migrations;
    private (bool Resolved, ModelSnapshot? Snapshot) _snapshot;

    public ProviderMigrationsAssembly(ICurrentDbContext currentContext, IDbContextOptions options, IMigrationsIdGenerator idGenerator,
        IDiagnosticsLogger<DbLoggerCategory.Migrations> logger, IDatabaseProvider provider)
        : base(currentContext, options, idGenerator, logger)
    {
        _contextType = currentContext.Context.GetType();
        _segment = DatabaseProviderAdapter.ForEfProvider(provider.Name) is { } adapter ? Segment(adapter.Provider) : null;
    }

    public override IReadOnlyDictionary<string, TypeInfo> Migrations => _migrations ??= Select();

    public override ModelSnapshot? ModelSnapshot
    {
        get
        {
            if (_snapshot.Resolved) return _snapshot.Snapshot;
            ModelSnapshot? snapshot;
            if (!IsPartitioned(base.Migrations.Values) || _segment is null)
            {
                snapshot = base.ModelSnapshot;
            }
            else
            {
                var type = Assembly.GetTypes().FirstOrDefault(t =>
                    !t.IsAbstract && typeof(ModelSnapshot).IsAssignableFrom(t) && InSet(t)
                    && t.GetCustomAttribute<DbContextAttribute>()?.ContextType == _contextType);
                snapshot = type is null ? null : (ModelSnapshot)Activator.CreateInstance(type)!;
            }
            _snapshot = (true, snapshot);
            return snapshot;
        }
    }

    private IReadOnlyDictionary<string, TypeInfo> Select()
    {
        var all = base.Migrations;
        if (!IsPartitioned(all.Values) || _segment is null) return all;
        return all.Where(m => InSet(m.Value)).ToDictionary(m => m.Key, m => m.Value);
    }

    private bool InSet(Type type) => type.Namespace is { } ns && (ns.EndsWith(_segment!, StringComparison.Ordinal) || ns.Contains(_segment + ".", StringComparison.Ordinal));

    private static string Segment(DatabaseProvider provider) => ".Migrations." + provider;

    private static bool IsPartitioned(IEnumerable<TypeInfo> migrations) =>
        migrations.Any(t => t.Namespace is { } ns && Enum.GetValues<DatabaseProvider>().Any(p => ns.EndsWith(Segment(p), StringComparison.Ordinal) || ns.Contains(Segment(p) + ".", StringComparison.Ordinal)));
}
