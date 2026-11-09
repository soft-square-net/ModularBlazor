using System.Text.Json;
using System.Text.Json.Serialization;
using soft.square.net.ModularBlazor.Host.Modules.Catalog.Application.Packages;
using soft.square.net.Share.All;

namespace soft.square.net.ModularBlazor.Host.Modules.Catalog.Infrastructure.Packages;

/// <summary>Uploaded files waiting for confirmation: &lt;store&gt;/tmp/pending/&lt;token&gt;/{file, inspection.json}. Dropped after two hours.</summary>
internal sealed class PendingModuleStore(ModuleStoreOptions options) : IPendingModuleStore
{
    private static readonly TimeSpan Lifetime = TimeSpan.FromHours(2);
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };

    private string Root => Path.Combine(options.FullPath, "tmp", "pending");

    // A token is a Guid without dashes. Anything else could point outside the folder.
    private string? FolderOf(string token)
        => token.Length == 32 && token.All(Uri.IsHexDigit) ? Path.Combine(Root, token) : null;

    public async Task<string> SaveAsync(string fileName, Stream content, CancellationToken cancellationToken)
    {
        Purge();
        var token = Guid.NewGuid().ToString("N");
        var folder = FolderOf(token)!;
        Directory.CreateDirectory(folder);
        await using (var file = File.Create(Path.Combine(folder, "file")))
            await content.CopyToAsync(file, cancellationToken);
        await File.WriteAllTextAsync(Path.Combine(folder, "name"), Path.GetFileName(fileName), cancellationToken);
        return token;
    }

    public async Task SaveInspectionAsync(string token, ModuleInspectionDto inspection, CancellationToken cancellationToken)
    {
        var folder = FolderOf(token) ?? throw new ArgumentException("Invalid token.");
        await File.WriteAllTextAsync(Path.Combine(folder, "inspection.json"), JsonSerializer.Serialize(inspection, Json), cancellationToken);
    }

    public async Task<ModuleInspectionDto?> FindInspectionAsync(string token, CancellationToken cancellationToken)
    {
        var path = FolderOf(token) is { } folder ? Path.Combine(folder, "inspection.json") : null;
        return path is not null && File.Exists(path)
            ? JsonSerializer.Deserialize<ModuleInspectionDto>(await File.ReadAllTextAsync(path, cancellationToken), Json)
            : null;
    }

    public Stream? Open(string token)
    {
        var path = FolderOf(token) is { } folder ? Path.Combine(folder, "file") : null;
        return path is not null && File.Exists(path) ? File.OpenRead(path) : null;
    }

    public void Delete(string token)
    {
        if (FolderOf(token) is { } folder && Directory.Exists(folder)) Directory.Delete(folder, recursive: true);
    }

    private void Purge()
    {
        if (!Directory.Exists(Root)) return;
        foreach (var folder in Directory.EnumerateDirectories(Root))
        {
            try { if (DateTime.UtcNow - Directory.GetCreationTimeUtc(folder) > Lifetime) Directory.Delete(folder, recursive: true); }
            catch (IOException) { /* in use: next time */ }
        }
    }
}
