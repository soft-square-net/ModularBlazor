using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using soft.square.net.Share.All;

namespace soft.square.net.ModularBlazor.Host.Modules.Catalog.Infrastructure.Persistence.Configurations;

public sealed class ModuleNavItemConfiguration : IEntityTypeConfiguration<ModuleNavItem>
{
    public void Configure(EntityTypeBuilder<ModuleNavItem> builder)
    {
    // builder.HasKey(m => m.Id);
    builder.HasNoKey();
    }
}
