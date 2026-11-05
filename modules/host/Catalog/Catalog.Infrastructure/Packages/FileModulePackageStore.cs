using System.IO.Compression;
using System.Reflection;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Serialization;
using System.Xml.Linq;
using soft.square.net.Share.All;
using soft.square.net.ModularBlazor.Core.Exceptions;
using soft.square.net.ModularBlazor.Host.Modules.Catalog.Application.Packages;
using soft.square.net.ModularBlazor.Host.Modules.Catalog.Domain;

namespace soft.square.net.ModularBlazor.Host.Modules.Catalog.Infrastructure.Packages;

/// <summary>
/// The module store on disk: files/&lt;id&gt;/&lt;file&gt; plus a modules.json manifest. A file store (not a database) on
/// purpose: the build must be able to read it without the app running.
/// </summary>
internal sealed class FileModulePackageStore(ModuleStoreOptions options) : IModulePackageStore
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true,
        Converters = { new JsonStringEnumConverter() }
    };

    private readonly SemaphoreSlim _gate = new(1, 1);
    private string Root => options.FullPath;
    private string ManifestPath => Path.Combine(Root, "modules.json");

    public async Task<IReadOnlyList<ModulePackage>> ListAsync(CancellationToken cancellationToken)
    {
        await _gate.WaitAsync(cancellationToken);
        try { return Read(); } finally { _gate.Release(); }
    }

    public async Task<ModulePackage?> FindAsync(string id, CancellationToken cancellationToken)
        => (await ListAsync(cancellationToken)).FirstOrDefault(p => p.Id == id);

    public async Task<ModulePackage> AddAsync(ModuleTarget target, string fileName, Stream content, string? name,
        string? uploadedBy, CancellationToken cancellationToken)
    {
        fileName = Path.GetFileName(fileName);
        var kind = fileName.EndsWith(".nupkg", StringComparison.OrdinalIgnoreCase) ? ModuleKind.NuPkg : ModuleKind.Dll;

        Directory.CreateDirectory(Path.Combine(Root, "tmp"));
        var temp = Path.Combine(Root, "tmp", Guid.NewGuid().ToString("N"));
        try
        {
            await using (var file = File.Create(temp))
                await content.CopyToAsync(file, cancellationToken);

            var (packageId, version) = Inspect(temp, kind);
            var package = new ModulePackage
            {
                Name = string.IsNullOrWhiteSpace(name) ? packageId : name.Trim(),
                PackageId = packageId,
                Version = version,
                Target = target,
                Kind = kind,
                FileName = fileName,
                SizeBytes = new FileInfo(temp).Length,
                Sha256 = Convert.ToHexString(SHA256.HashData(File.ReadAllBytes(temp))).ToLowerInvariant(),
                UploadedBy = uploadedBy
            };

            await _gate.WaitAsync(cancellationToken);
            try
            {
                var all = Read();
                if (all.Any(p => p.Target == target && string.Equals(p.PackageId, packageId, StringComparison.OrdinalIgnoreCase) && p.Version == version))
                    throw new ConflictException($"{packageId} {version} is already in the store.");

                Directory.CreateDirectory(Path.GetDirectoryName(BuildInputs.FilePath(Root, package))!);
                File.Move(temp, BuildInputs.FilePath(Root, package));
                all.Add(package);
                Save(all);
            }
            finally { _gate.Release(); }

            return package;
        }
        finally
        {
            if (File.Exists(temp)) File.Delete(temp);
        }
    }

    public async Task UpdateAsync(ModulePackage package, CancellationToken cancellationToken)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            var all = Read();
            var index = all.FindIndex(p => p.Id == package.Id);
            if (index < 0) throw new NotFoundException($"Module package '{package.Id}' was not found.");
            all[index] = package;
            Save(all);
        }
        finally { _gate.Release(); }
    }

    public async Task DeleteAsync(string id, CancellationToken cancellationToken)
    {
        await _gate.WaitAsync(cancellationToken);
        try
        {
            var all = Read();
            if (all.RemoveAll(p => p.Id == id) == 0) return;
            var folder = Path.Combine(Root, "files", id);
            if (Directory.Exists(folder)) Directory.Delete(folder, recursive: true);
            Save(all);
        }
        finally { _gate.Release(); }
    }

    public Stream OpenRead(ModulePackage package)
        => File.OpenRead(BuildInputs.FilePath(Root, package));

    public bool IsLoaded(ModulePackage package)
        => AppDomain.CurrentDomain.GetAssemblies()
            .Any(a => string.Equals(a.GetName().Name, package.PackageId, StringComparison.OrdinalIgnoreCase));

    private List<ModulePackage> Read()
        => File.Exists(ManifestPath)
            ? JsonSerializer.Deserialize<ModuleManifestFile>(File.ReadAllText(ManifestPath), Json)?.Packages ?? []
            : [];

    private void Save(List<ModulePackage> all)
    {
        Directory.CreateDirectory(Root);
        File.WriteAllText(ManifestPath, JsonSerializer.Serialize(new ModuleManifestFile { Packages = all }, Json));
        BuildInputs.Write(Root, all);
    }

    /// <summary>Reads the identity of a package without loading it: nuspec id/version, or the assembly name/version.</summary>
    private static (string PackageId, string Version) Inspect(string path, ModuleKind kind)
    {
        try
        {
            if (kind == ModuleKind.Dll)
            {
                var name = AssemblyName.GetAssemblyName(path);
                return (name.Name ?? throw new CustomException("The assembly has no name."), name.Version?.ToString(3) ?? "1.0.0");
            }

            using var zip = ZipFile.OpenRead(path);
            var nuspec = zip.Entries.FirstOrDefault(e => e.FullName.EndsWith(".nuspec", StringComparison.OrdinalIgnoreCase) && !e.FullName.Contains('/'))
                ?? throw new CustomException("The package has no .nuspec.");
            using var stream = nuspec.Open();
            var metadata = XDocument.Load(stream).Root?.Elements().FirstOrDefault(e => e.Name.LocalName == "metadata")
                ?? throw new CustomException("The .nuspec has no metadata.");
            string Value(string n) => metadata.Elements().FirstOrDefault(e => e.Name.LocalName == n)?.Value.Trim()
                ?? throw new CustomException($"The .nuspec has no <{n}>.");
            return (Value("id"), Value("version"));
        }
        catch (BadImageFormatException)
        {
            throw new CustomException("The file is not a managed .NET assembly.");
        }
        catch (InvalidDataException)
        {
            throw new CustomException("The file is not a valid NuGet package.");
        }
    }

    private sealed class ModuleManifestFile
    {
        public List<ModulePackage> Packages { get; set; } = [];
    }
}
