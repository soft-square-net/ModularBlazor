using System.Net;
using System.Text.Json;
using Ardalis.Specification;
using MediatR;
using soft.square.net.ModularBlazor.Core.Abstractions;
using soft.square.net.ModularBlazor.Core.Exceptions;
using soft.square.net.ModularBlazor.Core.Pagination;
using soft.square.net.ModularBlazor.Core.Persistence;
using soft.square.net.ModularBlazor.Core.Specifications;
using soft.square.net.ModularBlazor.Host.Modules.Media.Application.Specifications;
using soft.square.net.ModularBlazor.Host.Modules.Media.Domain;

namespace soft.square.net.ModularBlazor.Host.Modules.Media.Application.Images;

internal static class MediaImageMapping
{
    public const string BaseUrl = "/api/v1/media/images";

    public static MediaImageDto ToDto(this MediaImage i) => new(
        i.Id, i.Name, i.HasOriginal ? $"{BaseUrl}/{i.Id}/original" : null, i.ContentType, i.Width, i.Height, i.Bytes, i.Sha256,
        i.RecipeVersion, ParseRecipe(i.RecipeJson),
        i.Variants.OrderBy(v => v.Width * (long)v.Height)
            .Select(v => new MediaVariantDto(v.Name, v.FileName, v.ContentType, v.Width, v.Height, v.Bytes, $"{BaseUrl}/{i.Id}/variants/{v.Name}"))
            .ToList(),
        i.CreatedOnUtc, i.LastModifiedOnUtc);

    // A JsonElement is written back with its original property order and number literals.
    private static JsonElement? ParseRecipe(string? json)
    {
        if (json is null) return null;
        using var document = JsonDocument.Parse(json);
        return document.RootElement.Clone();
    }

    public static async Task<MediaImage> GetAsync(this IReadRepositoryBase<MediaImage> images, Guid id, CancellationToken ct)
        => await images.FirstOrDefaultAsync(new MediaImageByIdSpec(id), ct) ?? throw new NotFoundException($"Image '{id}' was not found.");
}

/// <summary>Stores files for one image and removes them again when the request fails before the image was saved.</summary>
internal sealed class MediaWriter(IMediaStore store, MediaOptions options) : IAsyncDisposable
{
    private readonly List<string> _written = [];
    private bool _completed;

    public sealed record Stored(string Path, string ContentType, long Bytes, string Sha256);

    public async Task<Stored> StoreAsync(MediaFilePart part, long maxBytes, string what, Func<string, string> pathFor, CancellationToken ct)
    {
        await using var content = part.OpenReadStream();
        await using var staged = await store.StageAsync(content, maxBytes, ct);
        if (staged.Bytes == 0) throw new CustomException($"{what}: the file is empty.");
        var type = ImageFormats.Verify(part.ContentType, staged.Head.Span, options, what);
        var path = pathFor(type);
        await staged.CommitAsync(path, ct);
        _written.Add(path);
        return new Stored(path, type, staged.Bytes, staged.Sha256);
    }

    /// <summary>The image was saved: keep the files, and delete the ones that were replaced under another name.</summary>
    public async Task CompleteAsync(IEnumerable<string?> replaced, CancellationToken ct)
    {
        _completed = true;
        foreach (var path in replaced.OfType<string>().Where(p => !_written.Contains(p)).Distinct())
            await store.DeleteAsync(path, ct);
    }

    public async ValueTask DisposeAsync()
    {
        if (_completed) return;
        foreach (var path in _written)
        {
            try { await store.DeleteAsync(path, CancellationToken.None); }
            catch { /* best effort: an orphaned file is harmless */ }
        }
    }
}

// ---- search
public sealed record SearchMediaImagesQuery(PaginationFilter Filter) : IRequest<PagedResponse<MediaImageSummaryDto>>;

public sealed class SearchMediaImagesQueryHandler(IReadRepository<MediaImage> images)
    : IRequestHandler<SearchMediaImagesQuery, PagedResponse<MediaImageSummaryDto>>
{
    public Task<PagedResponse<MediaImageSummaryDto>> Handle(SearchMediaImagesQuery q, CancellationToken cancellationToken)
    {
        var filter = q.Filter.RestrictTo(MediaImagesByPaginationFilterSpec.Fields);
        if (filter.OrderBy is not { Length: > 0 }) filter.OrderBy = [$"{nameof(MediaImage.CreatedOnUtc)} desc"];
        return images.PaginatedListAsync(new MediaImagesByPaginationFilterSpec(filter), filter, cancellationToken);
    }
}

// ---- get
public sealed record GetMediaImageQuery(Guid Id) : IRequest<MediaImageDto>;

public sealed class GetMediaImageQueryHandler(IReadRepository<MediaImage> images) : IRequestHandler<GetMediaImageQuery, MediaImageDto>
{
    public async Task<MediaImageDto> Handle(GetMediaImageQuery q, CancellationToken cancellationToken)
        => (await images.GetAsync(q.Id, cancellationToken)).ToDto();
}

/// <summary>The recipe exactly as it was stored.</summary>
public sealed record GetMediaRecipeQuery(Guid Id) : IRequest<string>;

public sealed class GetMediaRecipeQueryHandler(IReadRepository<MediaImage> images) : IRequestHandler<GetMediaRecipeQuery, string>
{
    public async Task<string> Handle(GetMediaRecipeQuery q, CancellationToken cancellationToken)
        => (await images.GetAsync(q.Id, cancellationToken)).RecipeJson ?? throw new NotFoundException($"Image '{q.Id}' has no recipe.");
}

/// <summary>Opens the untouched original (<see cref="Size"/> null) or a variant.</summary>
public sealed record OpenMediaFileQuery(Guid Id, string? Size) : IRequest<MediaFileContent>;

public sealed class OpenMediaFileQueryHandler(IReadRepository<MediaImage> images, IMediaStore store)
    : IRequestHandler<OpenMediaFileQuery, MediaFileContent>
{
    public async Task<MediaFileContent> Handle(OpenMediaFileQuery q, CancellationToken cancellationToken)
    {
        var image = await images.GetAsync(q.Id, cancellationToken);
        string path, type, name;
        if (q.Size is null)
        {
            path = image.OriginalPath ?? throw new NotFoundException($"Image '{q.Id}' has no stored original.");
            type = image.ContentType ?? "application/octet-stream";
            name = (image.Name ?? "original") + ImageFormats.ExtensionOf(type);
        }
        else
        {
            var variant = image.FindVariant(q.Size) ?? throw new NotFoundException($"Image '{q.Id}' has no '{q.Size}' size.");
            (path, type, name) = (variant.Path, variant.ContentType, variant.FileName ?? variant.Name + ImageFormats.ExtensionOf(variant.ContentType));
        }

        var content = await store.OpenReadAsync(path, cancellationToken) ?? throw new NotFoundException("The file is missing from the media store.");
        return new MediaFileContent(content, type, name);
    }
}

// ---- create (multipart: original?, files, meta, recipe)
public sealed record CreateMediaImageCommand(MediaFilePart? Original, IReadOnlyList<MediaFilePart> Files, string? MetaJson, string? RecipeJson)
    : IRequest<MediaImageDto>;

public sealed class CreateMediaImageCommandHandler(IRepository<MediaImage> images, IMediaStore store, MediaOptions options, ICurrentTenant tenant)
    : IRequestHandler<CreateMediaImageCommand, MediaImageDto>
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web);

    public async Task<MediaImageDto> Handle(CreateMediaImageCommand c, CancellationToken cancellationToken)
    {
        if (c.Original is null && c.Files.Count == 0)
            throw new CustomException("Send at least one file: an 'original' part or 'files' parts.");
        if (c.Files.Count > options.MaxVariants)
            throw new CustomException($"At most {options.MaxVariants} sizes can be uploaded for one image.");

        // Cheap checks first, before any file is stored.
        var recipe = string.IsNullOrWhiteSpace(c.RecipeJson) ? null : MediaRecipe.Validate(c.RecipeJson, options);
        var variants = Describe(c.Files, ParseMeta(c.MetaJson));

        var image = MediaImage.Create(Guid.NewGuid(), c.Original?.FileName is { } f ? Path.GetFileNameWithoutExtension(f) : null);
        await using var writer = new MediaWriter(store, options);

        if (c.Original is not null)
        {
            var original = await writer.StoreAsync(c.Original, options.MaxOriginalBytes, "original", t => MediaPaths.Original(tenant.Id, image.Id, t), cancellationToken);
            image.SetOriginal(original.Path, original.ContentType, original.Bytes, original.Sha256, recipe?.Source.Width, recipe?.Source.Height);
        }

        if (recipe is not null)
        {
            MediaRecipe.EnsureMatchesOriginal(recipe.Source, image);
            image.SetRecipe(recipe.Json, recipe.Version, recipe.Source);
        }

        foreach (var (part, meta) in variants)
        {
            var stored = await writer.StoreAsync(part, options.MaxVariantBytes, $"'{meta.Name}'", t => MediaPaths.Variant(tenant.Id, image.Id, meta.Name!, t), cancellationToken);
            if (meta.Size is { } declared && declared != stored.Bytes)
                throw new CustomException($"'{meta.Name}': meta says {declared} bytes but {stored.Bytes} arrived.");
            image.SetVariant(meta.Name!, stored.Path, part.FileName ?? meta.FileName, stored.ContentType, meta.Width!.Value, meta.Height!.Value, stored.Bytes);
        }

        await images.AddAsync(image, cancellationToken);
        await writer.CompleteAsync([], cancellationToken);
        return image.ToDto();
    }

    private static List<VariantMeta> ParseMeta(string? json)
    {
        if (string.IsNullOrWhiteSpace(json)) return [];
        try { return JsonSerializer.Deserialize<List<VariantMeta>>(json, Json) ?? []; }
        catch (JsonException e) { throw new CustomException($"The 'meta' part is not a JSON array of sizes: {e.Message}"); }
    }

    /// <summary>Pairs each file part with its meta entry (by file name, else by position) and checks names and sizes.</summary>
    private List<(MediaFilePart Part, VariantMeta Meta)> Describe(IReadOnlyList<MediaFilePart> files, List<VariantMeta> metas)
    {
        var used = new HashSet<VariantMeta>(ReferenceEqualityComparer.Instance);
        var names = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
        var result = new List<(MediaFilePart, VariantMeta)>();

        for (var i = 0; i < files.Count; i++)
        {
            var part = files[i];
            var meta = metas.FirstOrDefault(m => !used.Contains(m) && m.FileName is not null && m.FileName == part.FileName)
                       ?? (i < metas.Count && !used.Contains(metas[i]) ? metas[i] : null)
                       ?? throw new CustomException($"No 'meta' entry describes the file '{part.FileName}' (name, width, height).");
            used.Add(meta);

            var name = VariantNames.Validate(meta.Name);
            if (!names.Add(name)) throw new CustomException($"The size '{name}' was sent twice.");
            Dimensions.Validate(name, meta.Width, meta.Height, options);
            result.Add((part, meta with { Name = name }));
        }
        return result;
    }
}

internal static class Dimensions
{
    public static void Validate(string name, int? width, int? height, MediaOptions options)
    {
        if (width is not > 0 || height is not > 0 || width > options.MaxDimension || height > options.MaxDimension)
            throw new CustomException($"'{name}': width and height must be between 1 and {options.MaxDimension} pixels.");
    }
}

// ---- stream mode: one variant per request (creates the image when the id is new)
public sealed record PutMediaVariantCommand(Guid ImageId, string Size, MediaFilePart Body, int? Width, int? Height) : IRequest<MediaImageDto>;

public sealed class PutMediaVariantCommandHandler(IRepository<MediaImage> images, IMediaStore store, MediaOptions options, ICurrentTenant tenant)
    : IRequestHandler<PutMediaVariantCommand, MediaImageDto>
{
    public async Task<MediaImageDto> Handle(PutMediaVariantCommand c, CancellationToken cancellationToken)
    {
        var name = VariantNames.Validate(c.Size);
        Dimensions.Validate(name, c.Width, c.Height, options);

        var (image, isNew) = await images.GetOrCreateAsync(c.ImageId, cancellationToken);
        if (image.FindVariant(name) is null && image.Variants.Count >= options.MaxVariants)
            throw new CustomException($"An image can have at most {options.MaxVariants} sizes.");

        await using var writer = new MediaWriter(store, options);
        var stored = await writer.StoreAsync(c.Body, options.MaxVariantBytes, $"'{name}'", t => MediaPaths.Variant(tenant.Id, image.Id, name, t), cancellationToken);
        var replaced = image.SetVariant(name, stored.Path, c.Body.FileName, stored.ContentType, c.Width!.Value, c.Height!.Value, stored.Bytes);

        await images.SaveAsync(image, isNew, cancellationToken);
        await writer.CompleteAsync([replaced], cancellationToken);
        return image.ToDto();
    }
}

// ---- stream mode: the untouched original (creates the image when the id is new)
public sealed record PutMediaOriginalCommand(Guid ImageId, MediaFilePart Body) : IRequest<MediaImageDto>;

public sealed class PutMediaOriginalCommandHandler(IRepository<MediaImage> images, IMediaStore store, MediaOptions options, ICurrentTenant tenant)
    : IRequestHandler<PutMediaOriginalCommand, MediaImageDto>
{
    public async Task<MediaImageDto> Handle(PutMediaOriginalCommand c, CancellationToken cancellationToken)
    {
        var (image, isNew) = await images.GetOrCreateAsync(c.ImageId, cancellationToken, c.Body.FileName is { } f ? Path.GetFileNameWithoutExtension(f) : null);
        var previous = image.OriginalPath;

        await using var writer = new MediaWriter(store, options);
        var stored = await writer.StoreAsync(c.Body, options.MaxOriginalBytes, "original", t => MediaPaths.Original(tenant.Id, image.Id, t), cancellationToken);
        if (image.RecipeJson is not null)
        {
            var recipe = MediaRecipe.Validate(image.RecipeJson, options);
            if (recipe.Source.Sha256 is not null && !string.Equals(recipe.Source.Sha256, stored.Sha256, StringComparison.OrdinalIgnoreCase))
                throw new CustomException("This file is not the one the stored recipe was made from (source.sha256 differs).", HttpStatusCode.Conflict);
        }
        image.SetOriginal(stored.Path, stored.ContentType, stored.Bytes, stored.Sha256, null, null);

        await images.SaveAsync(image, isNew, cancellationToken);
        await writer.CompleteAsync([previous], cancellationToken);
        return image.ToDto();
    }
}

// ---- recipe (JSON; creates the image when the id is new)
public sealed record SetMediaRecipeCommand(Guid ImageId, string Json) : IRequest<MediaImageDto>;

public sealed class SetMediaRecipeCommandHandler(IRepository<MediaImage> images, MediaOptions options)
    : IRequestHandler<SetMediaRecipeCommand, MediaImageDto>
{
    public async Task<MediaImageDto> Handle(SetMediaRecipeCommand c, CancellationToken cancellationToken)
    {
        var recipe = MediaRecipe.Validate(c.Json, options);
        var (image, isNew) = await images.GetOrCreateAsync(c.ImageId, cancellationToken);
        MediaRecipe.EnsureMatchesOriginal(recipe.Source, image);
        image.SetRecipe(recipe.Json, recipe.Version, recipe.Source);
        await images.SaveAsync(image, isNew, cancellationToken);
        return image.ToDto();
    }
}

// ---- delete (soft delete; the files stay until a clean-up job removes them)
public sealed record DeleteMediaImageCommand(Guid Id) : IRequest;

public sealed class DeleteMediaImageCommandHandler(IRepository<MediaImage> images) : IRequestHandler<DeleteMediaImageCommand>
{
    public async Task Handle(DeleteMediaImageCommand c, CancellationToken cancellationToken)
        => await images.DeleteAsync(await images.GetAsync(c.Id, cancellationToken), cancellationToken);
}

internal static class MediaRepositoryExtensions
{
    /// <summary>
    /// Stream mode has no create call: the client picks the image's id and every write to a new id creates the image.
    /// </summary>
    public static async Task<(MediaImage Image, bool IsNew)> GetOrCreateAsync(this IRepository<MediaImage> images, Guid id,
        CancellationToken ct, string? name = null)
    {
        if (id == Guid.Empty) throw new CustomException("The image id must not be empty.");
        var image = await images.FirstOrDefaultAsync(new MediaImageByIdSpec(id), ct);
        return image is null ? (MediaImage.Create(id, name), true) : (image, false);
    }

    public static async Task SaveAsync(this IRepository<MediaImage> images, MediaImage image, bool isNew, CancellationToken ct)
    {
        if (isNew) await images.AddAsync(image, ct);
        else await images.SaveChangesAsync(ct);
    }
}
