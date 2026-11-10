namespace soft.square.net.ModularBlazor.Host.Modules.Media.Application.Images;

/// <summary>Configuration section "Media".</summary>
public sealed class MediaOptions
{
    public const string SectionName = "Media";

    /// <summary>Folder of the local disk store, relative to the working directory: &lt;tenant&gt;/&lt;image id&gt;/….</summary>
    public string Path { get; set; } = "assets/media";

    /// <summary>Largest exported variant accepted.</summary>
    public int MaxVariantMb { get; set; } = 25;

    /// <summary>Largest untouched original accepted.</summary>
    public int MaxOriginalMb { get; set; } = 50;

    /// <summary>Largest recipe accepted (drawings make it grow).</summary>
    public int MaxRecipeKb { get; set; } = 1024;

    /// <summary>Most variants one image may have.</summary>
    public int MaxVariants { get; set; } = 20;

    /// <summary>Largest width or height a variant may declare.</summary>
    public int MaxDimension { get; set; } = 20_000;

    /// <summary>
    /// Image types accepted for originals and variants. The file's bytes must match the declared type (checked from its
    /// signature). SVG is not supported on purpose: it can carry script. Empty (the default) means
    /// <see cref="DefaultContentTypes"/>; configured values replace the defaults.
    /// </summary>
    public string[] AllowedContentTypes { get; set; } = [];

    public static readonly string[] DefaultContentTypes = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"];

    /// <summary>The types actually accepted.</summary>
    public string[] AcceptedContentTypes => AllowedContentTypes is { Length: > 0 } ? AllowedContentTypes : DefaultContentTypes;

    public long MaxVariantBytes => MaxVariantMb * 1024L * 1024L;
    public long MaxOriginalBytes => MaxOriginalMb * 1024L * 1024L;
    public int MaxRecipeBytes => MaxRecipeKb * 1024;

    public string FullPath => System.IO.Path.GetFullPath(Path);
}
