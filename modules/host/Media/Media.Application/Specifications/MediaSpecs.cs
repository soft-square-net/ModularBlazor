using Ardalis.Specification;
using soft.square.net.ModularBlazor.Core.Pagination;
using soft.square.net.ModularBlazor.Core.Specifications;
using soft.square.net.ModularBlazor.Host.Modules.Media.Application.Images;
using soft.square.net.ModularBlazor.Host.Modules.Media.Domain;

namespace soft.square.net.ModularBlazor.Host.Modules.Media.Application.Specifications;

/// <summary>An image with its variants (owned, always loaded).</summary>
public sealed class MediaImageByIdSpec : Specification<MediaImage>, ISingleResultSpecification<MediaImage>
{
    public MediaImageByIdSpec(Guid id) => Query.Where(i => i.Id == id);
}

/// <summary>One page of images: keyword search on the name, Filters (e.g. <c>ContentType|eq|image/jpeg</c>) and OrderBy.</summary>
public sealed class MediaImagesByPaginationFilterSpec : EntitiesByPaginationFilterSpec<MediaImage, MediaImageSummaryDto>
{
    /// <summary>The properties a client may search, filter and order by (not the recipe or storage paths).</summary>
    public static readonly string[] Fields =
    [
        nameof(MediaImage.Name), nameof(MediaImage.ContentType), nameof(MediaImage.Width), nameof(MediaImage.Height),
        nameof(MediaImage.Bytes), nameof(MediaImage.Sha256), nameof(MediaImage.RecipeVersion), nameof(MediaImage.CreatedOnUtc),
    ];

    public MediaImagesByPaginationFilterSpec(PaginationFilter filter) : base(filter)
        => Query.Select(i => new MediaImageSummaryDto(i.Id, i.Name, i.ContentType, i.Width, i.Height, i.Bytes, i.Sha256,
            i.OriginalPath != null, i.RecipeVersion, i.Variants.Count(), i.CreatedOnUtc));
}
