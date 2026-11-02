using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using soft.square.net.ModularBlazor.Host.Modules.Multitenancy.Domain;

namespace soft.square.net.ModularBlazor.Host.Modules.Multitenancy.Infrastructure.Persistence.Configurations;

public sealed class TenantProvisioningConfiguration : IEntityTypeConfiguration<TenantProvisioning>
{
    public void Configure(EntityTypeBuilder<TenantProvisioning> builder)
    {
        builder.ToTable("Provisionings");
        builder.HasKey(p => p.Id);
        builder.Property(p => p.TenantId).HasMaxLength(64).IsRequired();
        builder.Property(p => p.Status).HasConversion<string>().HasMaxLength(20);
        builder.Property(p => p.Error).HasMaxLength(2000);
        builder.HasIndex(p => p.TenantId);
    }
}
