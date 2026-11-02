using Microsoft.EntityFrameworkCore;
using soft.square.net.ModularBlazor.Core.Persistence;

namespace soft.square.net.ModularBlazor.Infrastructure.Persistence;

/// <summary>Applies the module's migrations, then seeds it. Derive one per module and register it as IDbInitializer.</summary>
public abstract class DbInitializer<TContext>(TContext dbContext) : IDbInitializer
    where TContext : DbContext
{
    public async Task InitializeAsync(CancellationToken cancellationToken = default)
    {
        await dbContext.Database.MigrateAsync(cancellationToken);
        await SeedAsync(dbContext, cancellationToken);
    }

    /// <summary>Insert initial data. Must be safe to run on every start.</summary>
    protected abstract Task SeedAsync(TContext dbContext, CancellationToken cancellationToken);
}
