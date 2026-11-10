using System.Net;
using System.Text;
using System.Text.Json;
using System.Text.RegularExpressions;
using soft.square.net.ModularBlazor.Core.Exceptions;
using soft.square.net.ModularBlazor.Host.Modules.Media.Domain;

namespace soft.square.net.ModularBlazor.Host.Modules.Media.Application.Images;

/// <summary>Recognises image formats from their first bytes and checks them against the declared type.</summary>
public static class ImageFormats
{
    /// <summary>Bytes needed to recognise every supported format.</summary>
    public const int HeadLength = 64;

    private static readonly Dictionary<string, string> Extensions = new(StringComparer.OrdinalIgnoreCase)
    {
        ["image/jpeg"] = ".jpg", ["image/png"] = ".png", ["image/webp"] = ".webp", ["image/avif"] = ".avif", ["image/gif"] = ".gif",
    };

    public static string ExtensionOf(string contentType) => Extensions.GetValueOrDefault(contentType, ".bin");

    /// <summary>"image/JPG; charset=x" → "image/jpeg". Null for an empty value.</summary>
    public static string? Normalize(string? contentType)
    {
        if (string.IsNullOrWhiteSpace(contentType)) return null;
        var type = contentType.Split(';', 2)[0].Trim().ToLowerInvariant();
        return type switch { "image/jpg" or "image/pjpeg" => "image/jpeg", _ => type };
    }

    /// <summary>The format the bytes start with, or null when it is none of the supported ones.</summary>
    public static string? Detect(ReadOnlySpan<byte> head)
    {
        if (head.Length >= 3 && head[0] == 0xFF && head[1] == 0xD8 && head[2] == 0xFF) return "image/jpeg";
        if (head.StartsWith((ReadOnlySpan<byte>)[0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A])) return "image/png";
        if (head.StartsWith("GIF87a"u8) || head.StartsWith("GIF89a"u8)) return "image/gif";
        if (head.Length >= 12 && head.StartsWith("RIFF"u8) && head[8..12].SequenceEqual("WEBP"u8)) return "image/webp";
        if (head.Length >= 16 && head[4..8].SequenceEqual("ftyp"u8) && IsAvif(head)) return "image/avif";
        return null;
    }

    // ISO-BMFF: the ftyp box lists a major brand and compatible brands; AVIF uses "avif" (still) or "avis" (sequence).
    private static bool IsAvif(ReadOnlySpan<byte> head)
    {
        var boxSize = (int)Math.Min((uint)(head[0] << 24 | head[1] << 16 | head[2] << 8 | head[3]), (uint)head.Length);
        for (var i = 8; i + 4 <= boxSize; i += 4)
        {
            if (i == 12) continue; // minor version
            var brand = head.Slice(i, 4);
            if (brand.SequenceEqual("avif"u8) || brand.SequenceEqual("avis"u8)) return true;
        }
        return false;
    }

    /// <summary>
    /// The content type to store: the declared type must be allowed and the bytes must really be that format.
    /// Without a declared type the detected one is used (it still has to be allowed).
    /// </summary>
    public static string Verify(string? declared, ReadOnlySpan<byte> head, MediaOptions options, string what)
    {
        var type = Normalize(declared);
        var detected = Detect(head);
        if (type is not null && !options.AcceptedContentTypes.Contains(type, StringComparer.OrdinalIgnoreCase))
            throw new CustomException($"{what}: '{type}' is not an accepted image type ({string.Join(", ", options.AcceptedContentTypes)}).",
                HttpStatusCode.UnsupportedMediaType);
        if (detected is null)
            throw new CustomException($"{what}: the content is not a supported image (JPEG, PNG, WebP, AVIF or GIF).", HttpStatusCode.UnsupportedMediaType);
        if (type is not null && type != detected)
            throw new CustomException($"{what}: declared as '{type}' but the content is '{detected}'.", HttpStatusCode.UnsupportedMediaType);
        if (!options.AcceptedContentTypes.Contains(detected, StringComparer.OrdinalIgnoreCase))
            throw new CustomException($"{what}: '{detected}' is not an accepted image type.", HttpStatusCode.UnsupportedMediaType);
        return detected;
    }
}

/// <summary>Rules for size names (they become file names).</summary>
public static partial class VariantNames
{
    [GeneratedRegex("^[A-Za-z0-9][A-Za-z0-9_-]*$")]
    private static partial Regex Pattern();

    public static string Validate(string? name)
    {
        name = name?.Trim();
        if (string.IsNullOrEmpty(name) || name.Length > MediaVariant.NameMaxLength || !Pattern().IsMatch(name))
            throw new CustomException($"'{name}' is not a valid size name: letters, digits, '-' and '_', at most {MediaVariant.NameMaxLength} characters.");
        return name;
    }
}

/// <summary>A MudTail image recipe that passed the checks.</summary>
public sealed record ValidatedRecipe(string Json, int Version, MediaSourceInfo Source);

/// <summary>
/// Checks a MudTail recipe (<c>{ "type": "mudtail.image-recipe", "version": 1, … }</c>) without changing it: the JSON is
/// stored exactly as received, so replaying it later regenerates the same files. The edit itself is validated again by
/// MudTail's <c>normalizeRecipe</c> whenever it is replayed.
/// </summary>
public static class MediaRecipe
{
    public const string Type = "mudtail.image-recipe";
    public static readonly int[] SupportedVersions = [1];

    public static ValidatedRecipe Validate(string? json, MediaOptions options)
    {
        if (string.IsNullOrWhiteSpace(json)) throw new CustomException("The recipe is empty.");
        if (Encoding.UTF8.GetByteCount(json) > options.MaxRecipeBytes)
            throw new CustomException($"The recipe is larger than {options.MaxRecipeKb} KB.", HttpStatusCode.RequestEntityTooLarge);

        JsonDocument document;
        try { document = JsonDocument.Parse(json, new JsonDocumentOptions { MaxDepth = 32 }); }
        catch (JsonException e) { throw new CustomException($"The recipe is not valid JSON: {e.Message}"); }

        using (document)
        {
            var root = document.RootElement;
            if (root.ValueKind != JsonValueKind.Object) throw new CustomException("The recipe must be a JSON object.");
            if (!root.TryGetProperty("type", out var type) || type.ValueKind != JsonValueKind.String || type.GetString() != Type)
                throw new CustomException($"The recipe's type must be \"{Type}\".");
            if (!root.TryGetProperty("version", out var v) || v.ValueKind != JsonValueKind.Number || !v.TryGetInt32(out var version))
                throw new CustomException("The recipe has no numeric version.");
            if (!SupportedVersions.Contains(version))
                throw new CustomException($"Recipe version {version} is not supported (supported: {string.Join(", ", SupportedVersions)}).");

            return new ValidatedRecipe(json, version, ReadSource(root));
        }
    }

    private static MediaSourceInfo ReadSource(JsonElement root)
    {
        if (!root.TryGetProperty("source", out var s) || s.ValueKind != JsonValueKind.Object)
            return new MediaSourceInfo(null, null, null, null, null, null);

        string? Text(string name, int max) => s.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.String
            ? p.GetString() is { Length: > 0 } t && t.Length <= max ? t : null
            : null;
        long? Number(string name) => s.TryGetProperty(name, out var p) && p.ValueKind == JsonValueKind.Number && p.TryGetInt64(out var n) && n > 0 ? n : null;
        int? Dimension(string name) => Number(name) is { } n && n <= int.MaxValue ? (int)n : null;

        var sha = Text("sha256", MediaImage.Sha256Length);
        if (sha is not null && (sha.Length != MediaImage.Sha256Length || !sha.All(Uri.IsHexDigit)))
            throw new CustomException("The recipe's source.sha256 is not a hex SHA-256.");

        return new MediaSourceInfo(Text("name", MediaImage.NameMaxLength), Dimension("width"), Dimension("height"),
            ImageFormats.Normalize(Text("type", MediaImage.ContentTypeMaxLength)), Number("bytes"), sha?.ToLowerInvariant());
    }

    /// <summary>Refuses a recipe that was made from another file than the stored original.</summary>
    public static void EnsureMatchesOriginal(MediaSourceInfo source, MediaImage image)
    {
        if (image.HasOriginal && source.Sha256 is not null && image.Sha256 is not null
            && !string.Equals(source.Sha256, image.Sha256, StringComparison.OrdinalIgnoreCase))
            throw new CustomException("The recipe was made from a different file than the stored original (source.sha256 differs).",
                HttpStatusCode.Conflict);
    }
}

/// <summary>Store paths: &lt;tenant&gt;/&lt;image id&gt;/original.jpg and &lt;tenant&gt;/&lt;image id&gt;/variants/&lt;size&gt;.webp.</summary>
public static partial class MediaPaths
{
    [GeneratedRegex("[^A-Za-z0-9_-]")]
    private static partial Regex Unsafe();

    private static string Folder(string tenantId, Guid imageId) => $"{Unsafe().Replace(tenantId, "_")}/{imageId:N}";

    public static string Original(string tenantId, Guid imageId, string contentType)
        => $"{Folder(tenantId, imageId)}/original{ImageFormats.ExtensionOf(contentType)}";

    public static string Variant(string tenantId, Guid imageId, string size, string contentType)
        => $"{Folder(tenantId, imageId)}/variants/{size.ToLowerInvariant()}{ImageFormats.ExtensionOf(contentType)}";
}
