using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Domain;

namespace soft.square.net.ModularBlazor.Host.Modules.Auth.Infrastructure.Persistence.Configurations;

public sealed class UserConfiguration : IEntityTypeConfiguration<User>
{
    public void Configure(EntityTypeBuilder<User> builder)
    {
        builder.ToTable("Auth_Users");
        builder.HasKey(u => u.Id);
        builder.Property(u => u.UserName).HasMaxLength(100).IsRequired();
        builder.Property(u => u.NormalizedUserName).HasMaxLength(100).IsRequired();
        builder.Property(u => u.Role).HasMaxLength(50).IsRequired();
        builder.HasIndex(u => u.NormalizedUserName).IsUnique();
    }
}
