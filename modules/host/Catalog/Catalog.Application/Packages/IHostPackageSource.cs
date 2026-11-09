namespace soft.square.net.ModularBlazor.Host.Modules.Catalog.Application.Packages;

/// <summary>Fetches a host module's file (.dll / .nupkg) from the internet when the module store does not have it.</summary>
public interface IHostPackageSource
{
    /// <summary>Downloads from <paramref name="url"/> (https only). The caller disposes the stream.</summary>
    Task<DownloadedPackage> DownloadAsync(string url, string fallbackFileName, CancellationToken cancellationToken);
}

public sealed record DownloadedPackage(Stream Content, string FileName);
