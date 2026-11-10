using Microsoft.EntityFrameworkCore;
using soft.square.net.ModularBlazor.Core.Abstractions;
using soft.square.net.ModularBlazor.Host.Modules.Media.Domain;
using soft.square.net.ModularBlazor.Infrastructure.Persistence;

namespace soft.square.net.ModularBlazor.Host.Modules.Media.Infrastructure.Persistence;

/// <summary>Schema Media (MySQL: Media_ table prefix). Tenant scoped: every tenant sees only its own images.</summary>
public sealed class MediaDbContext(DbContextOptions<MediaDbContext> options, ICurrentTenant currentTenant)
    : ModuleDbContext(options, currentTenant)
{
    protected override string Schema => SchemaNames.Media;

    public DbSet<MediaImage> Images => Set<MediaImage>();
}
