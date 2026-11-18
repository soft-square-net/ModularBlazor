using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using soft.square.net.Storage.Domain;

namespace soft.square.net.Storage.Infrastructure.Persistence.Configurations;

internal class SFolderConfiguration : IEntityTypeConfiguration<SFolder>
{
  public void Configure(EntityTypeBuilder<SFolder> builder)
  {
    builder.ToTable("folders");
    builder.HasIndex(f => new { f.TenantId, f.ParentId, f.Name }).IsUnique();
  }
}
