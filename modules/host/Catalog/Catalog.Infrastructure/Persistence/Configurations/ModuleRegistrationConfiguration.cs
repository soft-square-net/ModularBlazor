using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using soft.square.net.ModularBlazor.Host.Modules.Catalog.Domain;
using soft.square.net.ModularBlazor.Infrastructure.Persistence;

namespace soft.square.net.ModularBlazor.Host.Modules.Catalog.Infrastructure.Persistence.Configurations;

public sealed class ModuleRegistrationConfiguration : IEntityTypeConfiguration<ModuleRegistration>
{
    public void Configure(EntityTypeBuilder<ModuleRegistration> builder)
    {
        builder.ToTable("Modules");
        builder.HasKey(m => m.Id);
        builder.Property(m => m.Id).HasMaxLength(100);
        builder.Property(m => m.Name).HasMaxLength(200).IsRequired();
        builder.Property(m => m.Version).HasMaxLength(50).IsRequired();
        builder.Property(m => m.Kind).HasConversion<string>().HasMaxLength(20);
        builder.Property(m => m.Url).HasMaxLength(500).IsRequired();
        builder.Property(m => m.Sha256).HasMaxLength(64);
        builder.Property(m => m.RequiredRole).HasMaxLength(50);
        builder.Property(m => m.Layout).HasMaxLength(50);
        builder.Property(m => m.PackageId).HasMaxLength(64);

        // Lists are stored as JSON text (same on every database provider).
        builder.Property(m => m.AvailableToRoles).HasJsonConversion();
        builder.Property(m => m.RoutePrefixes).HasJsonConversion();
        builder.Property(m => m.Dependencies).HasJsonConversion();
        builder.Property(m => m.ExtraAssemblies).HasJsonConversion();
        builder.Property(m => m.Styles).HasJsonConversion();
        builder.Property(m => m.Scripts).HasJsonConversion();
        builder.Property(m => m.Nav).HasJsonConversion();
        builder.Property(m => m.HostDependencies).HasJsonConversion();

        // Pages found inside the module at install time: table ModuleRoutes.
        builder.OwnsMany(m => m.Routes, r =>
        {
            r.ToTable("ModuleRoutes");
            r.WithOwner().HasForeignKey("ModuleId");
            r.Property<int>("Id").ValueGeneratedOnAdd();
            r.HasKey("Id");
            r.Property(x => x.Template).HasMaxLength(500).IsRequired();
            r.Property(x => x.Component).HasMaxLength(500).IsRequired();
            r.Property(x => x.Layout).HasMaxLength(50);
            r.Property(x => x.Roles).HasJsonConversion();
            r.HasIndex(x => x.Template);
        });

        builder.HasIndex(m => m.SortOrder);
    }
}
