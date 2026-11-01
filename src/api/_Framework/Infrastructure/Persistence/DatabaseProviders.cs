using Microsoft.EntityFrameworkCore;
using ModularBlazor.Core;

namespace ModularBlazor.Infrastructure.Persistence;

/// <summary>Maps a <see cref="DatabaseProvider"/> to its EF Core configuration and migrations assembly.</summary>
public static class DatabaseProviders
{
    /// <summary>Assembly holding the migrations for a provider (src/migrations/*).</summary>
    public static string MigrationsAssembly(DatabaseProvider provider) => provider switch
    {
        DatabaseProvider.SqlServer => "ModularBlazor.Migrations.SqlServer",
        DatabaseProvider.PostgreSql => "ModularBlazor.Migrations.PostgreSql",
        DatabaseProvider.MySql => "ModularBlazor.Migrations.MySql",
        _ => throw new ArgumentOutOfRangeException(nameof(provider), provider, null)
    };

    public static void Configure(DbContextOptionsBuilder options, DatabaseProvider provider, string connectionString)
    {
        var migrations = MigrationsAssembly(provider);

        switch (provider)
        {
            case DatabaseProvider.SqlServer:
                options.UseSqlServer(connectionString, b => b.MigrationsAssembly(migrations));
                break;

            case DatabaseProvider.PostgreSql:
                options.UseNpgsql(connectionString, b => b.MigrationsAssembly(migrations));
                break;

            case DatabaseProvider.MySql:
                options.UseMySQL(connectionString, b => b.MigrationsAssembly(migrations));
                break;

            default:
                throw new ArgumentOutOfRangeException(nameof(provider), provider, null);
        }
    }
}
