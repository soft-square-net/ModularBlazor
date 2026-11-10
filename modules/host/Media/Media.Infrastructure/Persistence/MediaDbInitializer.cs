using soft.square.net.ModularBlazor.Infrastructure.Persistence;

namespace soft.square.net.ModularBlazor.Host.Modules.Media.Infrastructure.Persistence;

/// <summary>Applies the Media migrations. Nothing is seeded: images come from uploads.</summary>
public sealed class MediaDbInitializer(MediaDbContext dbContext) : DbInitializer<MediaDbContext>(dbContext)
{
    protected override Task SeedAsync(MediaDbContext db, CancellationToken cancellationToken) => Task.CompletedTask;
}
