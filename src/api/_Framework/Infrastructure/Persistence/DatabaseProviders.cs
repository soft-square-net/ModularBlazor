using Microsoft.EntityFrameworkCore;
using soft.square.net.ModularBlazor.Core;

namespace soft.square.net.ModularBlazor.Infrastructure.Persistence;

/// <summary>Maps a <see cref="DatabaseProvider"/> to its EF Core configuration and migrations assembly.</summary>
public static class DatabaseProviders
{
    /// <summary>Assembly holding the migrations for a provider (src/migrations/*).</summary>
    public static string MigrationsAssembly(DatabaseProvider provider) => provider switch
    {
        DatabaseProvider.SqlServer => "soft.square.net.ModularBlazor.Migrations.SqlServer",
        DatabaseProvider.PostgreSql => "soft.square.net.ModularBlazor.Migrations.PostgreSql",
        DatabaseProvider.MySql => "soft.square.net.ModularBlazor.Migrations.MySql",
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
