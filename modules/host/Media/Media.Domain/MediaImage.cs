using soft.square.net.ModularBlazor.Core.Domain;

namespace soft.square.net.ModularBlazor.Host.Modules.Media.Domain;

/// <summary>
/// An edited image of the current tenant: the untouched original (optional), the exported variants (thumbnail,
/// card, …) and the MudTail recipe that turns the original into those variants again. Audited and soft-deleted.
/// </summary>
/// <remarks>
/// The size, type and hash of the original are known from the original file when it was uploaded, otherwise from
/// the recipe's <c>source</c>; until either arrives they are null. The recipe is kept exactly as it was sent.
/// </remarks>
public sealed class MediaImage : AuditableAggregateRoot<Guid>
{
    public const int NameMaxLength = 200;
    public const int PathMaxLength = 500;
    public const int ContentTypeMaxLength = 100;
    public const int Sha256Length = 64;

    private readonly List<MediaVariant> _variants = [];

    private MediaImage() { } // EF Core

    public static MediaImage Create(Guid id, string? name = null)
    {
        if (id == Guid.Empty) throw new ArgumentException("The id must not be empty.", nameof(id));
        return new MediaImage { Id = id, Name = Clean(name, NameMaxLength) };
    }

    /// <summary>Display name: the source file's name without its extension.</summary>
    public string? Name { get; private set; }

    /// <summary>Where the untouched original is stored (IMediaStore path). Null when it was not uploaded.</summary>
    public string? OriginalPath { get; private set; }

    public string? ContentType { get; private set; }
    public int? Width { get; private set; }
    public int? Height { get; private set; }
    public long? Bytes { get; private set; }

    /// <summary>Lower-case hex SHA-256 of the original's bytes.</summary>
    public string? Sha256 { get; private set; }

    /// <summary>The recipe JSON exactly as received (<c>type: "mudtail.image-recipe"</c>).</summary>
    public string? RecipeJson { get; private set; }

    public int? RecipeVersion { get; private set; }

    public IReadOnlyCollection<MediaVariant> Variants => _variants.AsReadOnly();

    public bool HasOriginal => OriginalPath is not null;

    /// <summary>Records the uploaded original; its own size, type and hash replace what a recipe said.</summary>
    public void SetOriginal(string path, string contentType, long bytes, string sha256, int? width, int? height)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(path);
        OriginalPath = path;
        ContentType = contentType;
        Bytes = bytes;
        Sha256 = sha256.ToLowerInvariant();
        Width = width ?? Width;
        Height = height ?? Height;
    }

    /// <summary>Stores the recipe and fills what is still unknown about the original from its <c>source</c>.</summary>
    public void SetRecipe(string json, int version, MediaSourceInfo source)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(json);
        RecipeJson = json;
        RecipeVersion = version;

        Name ??= Clean(source.Name, NameMaxLength);
        Width ??= source.Width;
        Height ??= source.Height;
        if (OriginalPath is null)
        {
            // Without an uploaded original the recipe is the only description of it.
            ContentType = Clean(source.ContentType, ContentTypeMaxLength) ?? ContentType;
            Bytes = source.Bytes ?? Bytes;
            Sha256 = source.Sha256?.ToLowerInvariant() ?? Sha256;
        }
    }

    public MediaVariant? FindVariant(string name)
        => _variants.FirstOrDefault(v => string.Equals(v.Name, name, StringComparison.OrdinalIgnoreCase));

    /// <summary>Adds the variant, or replaces the one with the same name. Returns the replaced file's path, if any.</summary>
    public string? SetVariant(string name, string path, string? fileName, string contentType, int width, int height, long bytes)
    {
        var existing = FindVariant(name);
        if (existing is null)
        {
            _variants.Add(new MediaVariant(name, path, fileName, contentType, width, height, bytes));
            return null;
        }

        var previous = existing.Path;
        existing.Replace(path, fileName, contentType, width, height, bytes);
        return previous;
    }

    private static string? Clean(string? value, int max)
    {
        if (string.IsNullOrWhiteSpace(value)) return null;
        value = value.Trim();
        return value.Length > max ? value[..max] : value;
    }
}

/// <summary>What a recipe says about the image it was made from (its <c>source</c> object).</summary>
public sealed record MediaSourceInfo(string? Name, int? Width, int? Height, string? ContentType, long? Bytes, string? Sha256);
