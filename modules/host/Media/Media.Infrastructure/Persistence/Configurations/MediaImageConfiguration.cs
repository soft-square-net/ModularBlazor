using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Metadata.Builders;
using soft.square.net.ModularBlazor.Host.Modules.Media.Domain;

namespace soft.square.net.ModularBlazor.Host.Modules.Media.Infrastructure.Persistence.Configurations;

public sealed class MediaImageConfiguration : IEntityTypeConfiguration<MediaImage>
{
    public void Configure(EntityTypeBuilder<MediaImage> builder)
    {
        builder.ToTable("Images");
        builder.HasKey(i => i.Id);
        builder.Property(i => i.Id).ValueGeneratedNever(); // chosen by the server (multipart) or the client (stream mode)
        builder.Property(i => i.Name).HasMaxLength(MediaImage.NameMaxLength);
        builder.Property(i => i.OriginalPath).HasMaxLength(MediaImage.PathMaxLength);
        builder.Property(i => i.ContentType).HasMaxLength(MediaImage.ContentTypeMaxLength);
        builder.Property(i => i.Sha256).HasMaxLength(MediaImage.Sha256Length).IsFixedLength(false);
        builder.Property(i => i.RecipeJson); // unbounded text; stored exactly as received
        builder.Ignore(i => i.HasOriginal);
        builder.HasIndex(i => i.Sha256);

        // Exported sizes: table Variants, one row per (image, size name).
        builder.OwnsMany(i => i.Variants, v =>
        {
            v.ToTable("Variants");
            v.WithOwner().HasForeignKey("ImageId");
            v.HasKey("ImageId", nameof(MediaVariant.Name));
            v.Property(x => x.Name).HasMaxLength(MediaVariant.NameMaxLength);
            v.Property(x => x.Path).HasMaxLength(MediaImage.PathMaxLength).IsRequired();
            v.Property(x => x.FileName).HasMaxLength(MediaVariant.FileNameMaxLength);
            v.Property(x => x.ContentType).HasMaxLength(MediaImage.ContentTypeMaxLength).IsRequired();
        });
        builder.Navigation(i => i.Variants).UsePropertyAccessMode(PropertyAccessMode.Field);
    }
}
