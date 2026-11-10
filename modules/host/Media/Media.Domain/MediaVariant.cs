namespace soft.square.net.ModularBlazor.Host.Modules.Media.Domain;

/// <summary>One exported size of a <see cref="MediaImage"/> (thumbnail, card, article, hero, …). Owned by the image.</summary>
public sealed class MediaVariant
{
    public const int NameMaxLength = 50;
    public const int FileNameMaxLength = 255;

    private MediaVariant() { } // EF Core

    internal MediaVariant(string name, string path, string? fileName, string contentType, int width, int height, long bytes)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(name);
        Name = name;
        Replace(path, fileName, contentType, width, height, bytes);
    }

    /// <summary>The size's name from the editor (unique per image, case-insensitive).</summary>
    public string Name { get; private set; } = "";

    /// <summary>Where the file is stored (IMediaStore path).</summary>
    public string Path { get; private set; } = "";

    /// <summary>The file name the client gave it (e.g. harbour-card.webp).</summary>
    public string? FileName { get; private set; }

    public string ContentType { get; private set; } = "";
    public int Width { get; private set; }
    public int Height { get; private set; }
    public long Bytes { get; private set; }

    internal void Replace(string path, string? fileName, string contentType, int width, int height, long bytes)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(path);
        ArgumentException.ThrowIfNullOrWhiteSpace(contentType);
        Path = path;
        FileName = string.IsNullOrWhiteSpace(fileName) ? null : fileName.Trim()[..Math.Min(fileName.Trim().Length, FileNameMaxLength)];
        ContentType = contentType;
        Width = width;
        Height = height;
        Bytes = bytes;
    }
}
