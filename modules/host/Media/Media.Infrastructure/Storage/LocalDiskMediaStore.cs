using System.Buffers;
using System.Net;
using System.Security.Cryptography;
using soft.square.net.ModularBlazor.Core.Exceptions;
using soft.square.net.ModularBlazor.Host.Modules.Media.Application.Images;

namespace soft.square.net.ModularBlazor.Host.Modules.Media.Infrastructure.Storage;

/// <summary>
/// The media store on local disk (Media:Path, default assets/media). Uploads are streamed to Media:Path/tmp while they
/// are hashed and counted, then moved into place. Swap this class for a blob-storage IMediaStore in production.
/// </summary>
internal sealed class LocalDiskMediaStore(MediaOptions options) : IMediaStore
{
    private string Root => options.FullPath;

    public async Task<IStagedMediaFile> StageAsync(Stream content, long maxBytes, CancellationToken cancellationToken)
    {
        var tmp = Path.Combine(Root, "tmp");
        Directory.CreateDirectory(tmp);
        var tempPath = Path.Combine(tmp, Guid.NewGuid().ToString("N"));

        var head = new byte[ImageFormats.HeadLength];
        var headLength = 0;
        long total = 0;
        using var sha = IncrementalHash.CreateHash(HashAlgorithmName.SHA256);
        var buffer = ArrayPool<byte>.Shared.Rent(81920);
        try
        {
            await using (var file = new FileStream(tempPath, FileMode.CreateNew, FileAccess.Write, FileShare.None, 81920, useAsync: true))
            {
                int read;
                while ((read = await content.ReadAsync(buffer.AsMemory(), cancellationToken)) > 0)
                {
                    total += read;
                    if (total > maxBytes)
                        throw new CustomException($"The file is larger than {maxBytes / (1024 * 1024)} MB.", HttpStatusCode.RequestEntityTooLarge);
                    if (headLength < head.Length)
                    {
                        var n = Math.Min(read, head.Length - headLength);
                        buffer.AsSpan(0, n).CopyTo(head.AsSpan(headLength));
                        headLength += n;
                    }
                    sha.AppendData(buffer, 0, read);
                    await file.WriteAsync(buffer.AsMemory(0, read), cancellationToken);
                }
            }

            return new StagedFile(this, tempPath, total, Convert.ToHexString(sha.GetHashAndReset()).ToLowerInvariant(), head.AsMemory(0, headLength));
        }
        catch
        {
            TryDelete(tempPath);
            throw;
        }
        finally
        {
            ArrayPool<byte>.Shared.Return(buffer);
        }
    }

    public Task<Stream?> OpenReadAsync(string path, CancellationToken cancellationToken)
    {
        var full = Resolve(path);
        Stream? stream = File.Exists(full)
            ? new FileStream(full, FileMode.Open, FileAccess.Read, FileShare.Read, 81920, useAsync: true)
            : null;
        return Task.FromResult(stream);
    }

    public Task DeleteAsync(string path, CancellationToken cancellationToken)
    {
        var full = Resolve(path);
        TryDelete(full);

        // Remove folders left empty (variants/, the image's folder), never the root.
        var root = Path.TrimEndingDirectorySeparator(Root);
        for (var dir = Path.GetDirectoryName(full); dir is not null && dir.Length > root.Length; dir = Path.GetDirectoryName(dir))
        {
            try
            {
                if (!Directory.Exists(dir) || Directory.EnumerateFileSystemEntries(dir).Any()) break;
                Directory.Delete(dir);
            }
            catch (IOException) { break; }
        }
        return Task.CompletedTask;
    }

    /// <summary>Maps a store path to a file under the root, refusing anything that would leave it.</summary>
    private string Resolve(string path)
    {
        var root = Path.TrimEndingDirectorySeparator(Root) + Path.DirectorySeparatorChar;
        var full = Path.GetFullPath(Path.Combine(root, path.Replace('/', Path.DirectorySeparatorChar)));
        if (!full.StartsWith(root, StringComparison.OrdinalIgnoreCase) || full.StartsWith(Path.Combine(root, "tmp"), StringComparison.OrdinalIgnoreCase))
            throw new CustomException("Invalid media path.");
        return full;
    }

    private static void TryDelete(string path)
    {
        try { if (File.Exists(path)) File.Delete(path); }
        catch (IOException) { /* best effort */ }
    }

    private sealed class StagedFile(LocalDiskMediaStore store, string tempPath, long bytes, string sha256, ReadOnlyMemory<byte> head)
        : IStagedMediaFile
    {
        private bool _committed;

        public long Bytes => bytes;
        public string Sha256 => sha256;
        public ReadOnlyMemory<byte> Head => head;

        public Task CommitAsync(string path, CancellationToken cancellationToken)
        {
            var target = store.Resolve(path);
            Directory.CreateDirectory(Path.GetDirectoryName(target)!);
            File.Move(tempPath, target, overwrite: true);
            _committed = true;
            return Task.CompletedTask;
        }

        public ValueTask DisposeAsync()
        {
            if (!_committed) TryDelete(tempPath);
            return ValueTask.CompletedTask;
        }
    }
}
