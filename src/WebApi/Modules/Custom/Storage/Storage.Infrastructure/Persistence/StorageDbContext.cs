
using Microsoft.CodeAnalysis;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using soft.square.net.Storage.Domain;
using soft.square.net.WebApi.Contracts.Tenancy;
using soft.square.net.WebApi.Data;

namespace soft.square.net.Storage.Infrastructure.Persistence;

public sealed class StorageDbContext(DbContextOptions<StorageDbContext> options, ITenantContext tenant) : TenantDbContext(options, tenant)
{
  public DbSet<SFolder> Folders { get; set; } = null!;

  protected override String Schema => "storage";

  protected override void ConfigureModel(ModelBuilder modelBuilder)
  {
    ArgumentNullException.ThrowIfNull(modelBuilder);
    base.OnModelCreating(modelBuilder);
    modelBuilder.ApplyConfigurationsFromAssembly(typeof(StorageDbContext).Assembly);
    modelBuilder.HasDefaultSchema(Schema);
  }

}

/// <summary>Design time, one migration set per engine (Migrations/&lt;Provider&gt;): add migrations with src/WebApi/scripts/Add-Migration.ps1.</summary>
internal sealed class StorageDesignTimeFactory : IDesignTimeDbContextFactory<StorageDbContext>
{
  public StorageDbContext CreateDbContext(string[] args) =>
      new(TenantDbDesignTime.Options<StorageDbContext>(args), TenantDbDesignTime.Tenant);
}
