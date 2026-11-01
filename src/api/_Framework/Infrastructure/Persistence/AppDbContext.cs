using Microsoft.EntityFrameworkCore;
using ModularBlazor.Core;

namespace ModularBlazor.Infrastructure.Persistence;

/// <summary>
/// The per-tenant database. It is created per request with the resolved tenant's provider and connection
/// string (see MultiTenancyExtensions), so queries only ever touch that tenant's data.
/// </summary>
public sealed class AppDbContext(DbContextOptions<AppDbContext> options) : DbContext(options)
{
    public DbSet<Note> Notes => Set<Note>();

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.Entity<Note>(note =>
        {
            note.HasKey(n => n.Id);
            note.Property(n => n.Title).HasMaxLength(200).IsRequired();
        });
    }
}
