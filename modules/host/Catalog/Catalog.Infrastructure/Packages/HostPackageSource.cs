using soft.square.net.ModularBlazor.Core.Exceptions;
using soft.square.net.ModularBlazor.Host.Modules.Catalog.Application.Packages;

namespace soft.square.net.ModularBlazor.Host.Modules.Catalog.Infrastructure.Packages;

internal sealed class HostPackageSource(IHttpClientFactory httpClients, ModuleStoreOptions options) : IHostPackageSource
{
    public async Task<DownloadedPackage> DownloadAsync(string url, string fallbackFileName, CancellationToken cancellationToken)
    {
        if (!Uri.TryCreate(url, UriKind.Absolute, out var uri) || uri.Scheme != Uri.UriSchemeHttps)
            throw new CustomException($"'{url}' is not an https address.");

        var limit = options.MaxUploadMb * 1024L * 1024L;
        using var client = httpClients.CreateClient("module-source");
        using var response = await client.GetAsync(uri, HttpCompletionOption.ResponseHeadersRead, cancellationToken);
        if (!response.IsSuccessStatusCode)
            throw new CustomException($"Downloading {uri} failed: {(int)response.StatusCode} {response.ReasonPhrase}.");
        if (response.Content.Headers.ContentLength > limit)
            throw new CustomException($"The file at {uri} is larger than {options.MaxUploadMb} MB.");

        var buffer = new MemoryStream();
        await using (var body = await response.Content.ReadAsStreamAsync(cancellationToken))
        {
            var chunk = new byte[81920];
            int read;
            while ((read = await body.ReadAsync(chunk, cancellationToken)) > 0)
            {
                if (buffer.Length + read > limit) throw new CustomException($"The file at {uri} is larger than {options.MaxUploadMb} MB.");
                buffer.Write(chunk, 0, read);
            }
        }

        buffer.Position = 0;
        var name = Path.GetFileName(uri.AbsolutePath);
        var ok = name.EndsWith(".dll", StringComparison.OrdinalIgnoreCase) || name.EndsWith(".nupkg", StringComparison.OrdinalIgnoreCase);
        return new DownloadedPackage(buffer, ok ? name : fallbackFileName);
    }
}
