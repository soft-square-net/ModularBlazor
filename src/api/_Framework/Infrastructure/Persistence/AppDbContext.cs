using Microsoft.EntityFrameworkCore;
using soft.square.net.ModularBlazor.Core;
using soft.square.net.ModularBlazor.Core.Abstractions;

namespace soft.square.net.ModularBlazor.Infrastructure.Persistence;

/// <summary>
/// The per-tenant sample database. It is created per request with the resolved tenant's provider and
/// connection string (see MultiTenancyExtensions), so queries only ever touch that tenant's data.
/// </summary>
public sealed class AppDbContext(DbContextOptions<AppDbContext> options, ICurrentTenant currentTenant)
    : DbContextTenantBase(options, currentTenant)
{
    public DbSet<Note> Notes => Set<Note>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Note>(note =>
        {
            note.ToTable("Notes");
            note.HasKey(n => n.Id);
            note.Property(n => n.Title).HasMaxLength(200).IsRequired();
        });

        base.OnModelCreating(modelBuilder);
    }
}

public sealed class AppDbInitializer(AppDbContext dbContext) : DbInitializer<AppDbContext>(dbContext)
{
    protected override Task SeedAsync(AppDbContext dbContext, CancellationToken cancellationToken) => Task.CompletedTask;
}
