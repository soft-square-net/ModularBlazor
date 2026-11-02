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
        builder.Property(u => u.Email).HasMaxLength(256).IsRequired();
        builder.Property(u => u.NormalizedEmail).HasMaxLength(256).IsRequired();
        builder.Property(u => u.FirstName).HasMaxLength(100);
        builder.Property(u => u.LastName).HasMaxLength(100);
        builder.Property(u => u.PasswordHash).HasMaxLength(500).IsRequired();
        builder.HasIndex(u => u.NormalizedUserName).IsUnique();
        builder.HasIndex(u => u.NormalizedEmail).IsUnique();

        builder.HasMany(u => u.UserRoles).WithOne().HasForeignKey(r => r.UserId).OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(u => u.UserRoles).UsePropertyAccessMode(PropertyAccessMode.Field);
    }
}

public sealed class UserRoleConfiguration : IEntityTypeConfiguration<UserRole>
{
    public void Configure(EntityTypeBuilder<UserRole> builder)
    {
        builder.ToTable("Auth_UserRoles");
        builder.HasKey(r => new { r.UserId, r.RoleId });
        builder.HasIndex(r => r.RoleId);
    }
}

public sealed class RoleConfiguration : IEntityTypeConfiguration<Role>
{
    public void Configure(EntityTypeBuilder<Role> builder)
    {
        builder.ToTable("Auth_Roles");
        builder.HasKey(r => r.Id);
        builder.Property(r => r.Name).HasMaxLength(100).IsRequired();
        builder.Property(r => r.NormalizedName).HasMaxLength(100).IsRequired();
        builder.Property(r => r.Description).HasMaxLength(500);
        builder.HasIndex(r => r.NormalizedName).IsUnique();

        builder.HasMany(r => r.Permissions).WithOne().HasForeignKey(p => p.RoleId).OnDelete(DeleteBehavior.Cascade);
        builder.Navigation(r => r.Permissions).UsePropertyAccessMode(PropertyAccessMode.Field);
    }
}

public sealed class RolePermissionConfiguration : IEntityTypeConfiguration<RolePermission>
{
    public void Configure(EntityTypeBuilder<RolePermission> builder)
    {
        builder.ToTable("Auth_RolePermissions");
        builder.HasKey(p => new { p.RoleId, p.Permission });
        builder.Property(p => p.Permission).HasMaxLength(200).IsRequired();
    }
}

public sealed class RefreshTokenConfiguration : IEntityTypeConfiguration<RefreshToken>
{
    public void Configure(EntityTypeBuilder<RefreshToken> builder)
    {
        builder.ToTable("Auth_RefreshTokens");
        builder.HasKey(t => t.Id);
        builder.Property(t => t.TokenHash).HasMaxLength(64).IsRequired();
        builder.Property(t => t.ReplacedByTokenHash).HasMaxLength(64);
        builder.HasIndex(t => t.TokenHash).IsUnique();
        builder.HasIndex(t => t.UserId);
    }
}

public sealed class ApiKeyConfiguration : IEntityTypeConfiguration<ApiKey>
{
    public void Configure(EntityTypeBuilder<ApiKey> builder)
    {
        builder.ToTable("Auth_ApiKeys");
        builder.HasKey(k => k.Id);
        builder.Property(k => k.Name).HasMaxLength(100).IsRequired();
        builder.Property(k => k.KeyPrefix).HasMaxLength(16).IsRequired();
        builder.Property(k => k.KeyHash).HasMaxLength(64).IsRequired();
        builder.HasIndex(k => k.KeyHash).IsUnique();
        builder.HasIndex(k => k.OwnerUserId);
    }
}
