using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using soft.square.net.Storage.Domain;

namespace soft.square.net.Storage.Infrastructure.Persistence.Configurations;

public class SFileConfiguration : IEntityTypeConfiguration<SFile>
{
  public void Configure(EntityTypeBuilder<SFile> builder)
  {
    throw new NotImplementedException();
  }
}
