namespace soft.square.net.ModularBlazor.Host.Modules.Media.Application.Images;

/// <summary>
/// Where image files are kept (implemented by the Infrastructure project: local disk for now, blob storage later).
/// Paths are relative and use '/' (e.g. <c>root/3f2c…/variants/card.webp</c>); the store decides where they live.
/// </summary>
public interface IMediaStore
{
    /// <summary>
    /// Copies the content to a temporary place while counting and hashing it, without buffering it in memory.
    /// Throws a 413 <c>CustomException</c> past <paramref name="maxBytes"/>. Dispose the result to drop it unless committed.
    /// </summary>
    Task<IStagedMediaFile> StageAsync(Stream content, long maxBytes, CancellationToken cancellationToken);

    /// <summary>Opens a stored file, or returns null when it does not exist.</summary>
    Task<Stream?> OpenReadAsync(string path, CancellationToken cancellationToken);

    Task DeleteAsync(string path, CancellationToken cancellationToken);
}

/// <summary>An uploaded file that was received but not stored yet.</summary>
public interface IStagedMediaFile : IAsyncDisposable
{
    long Bytes { get; }

    /// <summary>Lower-case hex SHA-256 of the content.</summary>
    string Sha256 { get; }

    /// <summary>The first bytes of the content (to recognise the format).</summary>
    ReadOnlyMemory<byte> Head { get; }

    /// <summary>Moves the file to its final path, replacing a file already there.</summary>
    Task CommitAsync(string path, CancellationToken cancellationToken);
}
