using System.Text.Json;

namespace soft.square.net.ModularBlazor.Host.Modules.Media.Application.Images;

/// <summary>A stored image with its variants and recipe. Urls point at the download endpoints of this API.</summary>
public sealed record MediaImageDto(
    Guid Id,
    string? Name,
    string? OriginalUrl,
    string? ContentType,
    int? Width,
    int? Height,
    long? Bytes,
    string? Sha256,
    int? RecipeVersion,
    JsonElement? Recipe,
    IReadOnlyList<MediaVariantDto> Variants,
    DateTime CreatedOnUtc,
    DateTime? LastModifiedOnUtc);

public sealed record MediaVariantDto(string Name, string? FileName, string ContentType, int Width, int Height, long Bytes, string Url);

/// <summary>One row of the paged list (no recipe, no variants: open the image for those).</summary>
public sealed record MediaImageSummaryDto(
    Guid Id,
    string? Name,
    string? ContentType,
    int? Width,
    int? Height,
    long? Bytes,
    string? Sha256,
    bool HasOriginal,
    int? RecipeVersion,
    int VariantCount,
    DateTime CreatedOnUtc);

/// <summary>An uploaded file as the endpoints hand it over (a multipart part or a raw request body).</summary>
public sealed record MediaFilePart(string? FileName, string? ContentType, Func<Stream> OpenReadStream);

/// <summary>One entry of the multipart <c>meta</c> JSON the MudTail editor sends.</summary>
public sealed record VariantMeta(string? Name, string? FileName, int? Width, int? Height, string? Type, long? Size);

/// <summary>A stored file opened for download.</summary>
public sealed record MediaFileContent(Stream Content, string ContentType, string FileName);
