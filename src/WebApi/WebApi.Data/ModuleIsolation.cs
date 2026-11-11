using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;

namespace soft.square.net.WebApi.Data;

/// <summary>
/// Keeps one owner's tables (a module, or the platform's tenant store) apart inside a shared database, per engine:
/// <list type="bullet">
/// <item>PostgreSQL, SQL Server: a schema named <c>owner</c>; history table <c>owner.__EFMigrationsHistory</c>.</item>
/// <item>MySQL (a schema is a database), Oracle (a schema is a user): tables named <c>owner_table</c>; history table
/// <c>__EFMigrationsHistory_owner</c>.</item>
/// </list>
/// </summary>
public static class ModuleIsolation
{
    /// <summary>True for engines with real schemas; also for an unknown provider (keeps EF's defaults).</summary>
    public static bool UsesSchemas(string? efProviderName) =>
        DatabaseProviderAdapter.ForEfProvider(efProviderName)?.SupportsSchemas ?? true;

    /// <summary>Moves the migrations history table to the owner (call from OnConfiguring, after the provider is set).</summary>
    public static void ConfigureHistoryTable(DbContextOptionsBuilder optionsBuilder, string owner)
    {
        var relational = optionsBuilder.Options.Extensions.OfType<RelationalOptionsExtension>().FirstOrDefault();
        if (relational is null) return;

        var updated = UsesSchemas(relational.GetType().Assembly.GetName().Name)
            ? relational.WithMigrationsHistoryTableName(HistoryRepository.DefaultTableName).WithMigrationsHistoryTableSchema(owner)
            : relational.WithMigrationsHistoryTableName($"{HistoryRepository.DefaultTableName}_{owner}").WithMigrationsHistoryTableSchema(null);
        // Replaces the provider's extension (options are keyed by the extension's runtime type).
        ((IDbContextOptionsBuilderInfrastructure)optionsBuilder).AddOrUpdateExtension(updated);
    }

    /// <summary>Prefixes every mapped table with the owner and drops schemas (call after the model is configured).</summary>
    public static void PrefixTables(ModelBuilder modelBuilder, string owner)
    {
        foreach (var entity in modelBuilder.Model.GetEntityTypes().Where(e => e.BaseType is null && !e.IsOwned()))
        {
            if (entity.GetTableName() is not { } table) continue; // views, keyless queries
            if (!table.StartsWith(owner + "_", StringComparison.Ordinal)) entity.SetTableName($"{owner}_{table}");
            entity.SetSchema(null);
        }
    }
}
