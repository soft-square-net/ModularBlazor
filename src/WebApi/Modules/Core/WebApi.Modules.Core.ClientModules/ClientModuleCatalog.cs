using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using Microsoft.Extensions.Hosting;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Options;
using soft.square.net.WebApi.Contracts.Security;

namespace soft.square.net.WebApi.Modules.Core.ClientModules;

/// <summary>
/// The client module catalog (singleton). A stand-in for a table and a blob store, like the host's module catalog:
/// <c>{Path}/client-modules.json</c> holds the records, <c>{Path}/files/{id}/{version}/</c> the files, and
/// <c>{Path}/uploads/{token}/</c> packages waiting to be installed. Every replica shares the folder; changes happen
/// under a cross-process lock file, reads use the last saved file (replaced atomically).
/// </summary>
internal sealed class ClientModuleCatalog
{
    private static readonly JsonSerializerOptions Json = new(JsonSerializerDefaults.Web) { WriteIndented = true };
    private static readonly TimeSpan UploadLifetime = TimeSpan.FromHours(1);

    private readonly ClientModulesOptions _options;
    private readonly ILogger<ClientModuleCatalog> _log;
    private readonly string _records;
    private readonly string _files;
    private readonly string _uploads;
    private (DateTime Written, long Length, IReadOnlyList<ClientModuleRecord> Records)? _cache;

    public ClientModuleCatalog(IOptions<ClientModulesOptions> options, IHostEnvironment environment, ILogger<ClientModuleCatalog> log)
    {
        _options = options.Value;
        _log = log;
        Root = Path.GetFullPath(_options.Path, environment.ContentRootPath);
        _records = Path.Combine(Root, "client-modules.json");
        _files = Path.Combine(Root, "files");
        _uploads = Path.Combine(Root, "uploads");
        Directory.CreateDirectory(_files);
        Directory.CreateDirectory(_uploads);
    }

    public string Root { get; }

    // ================================================================ reading

    public IReadOnlyList<ClientModuleRecord> List()
    {
        var info = new FileInfo(_records);
        if (!info.Exists) return [];
        if (_cache is { } cache && cache.Written == info.LastWriteTimeUtc && cache.Length == info.Length) return cache.Records;

        for (var attempt = 0; ; attempt++)
        {
            try
            {
                var records = (IReadOnlyList<ClientModuleRecord>)(JsonSerializer.Deserialize<List<ClientModuleRecord>>(File.ReadAllText(_records), Json) ?? []);
                _cache = (info.LastWriteTimeUtc, info.Length, records);
                return records;
            }
            catch (IOException) when (attempt < 20) // being replaced by another replica
            {
                Thread.Sleep(25);
            }
        }
    }

    public ClientModuleRecord Get(string id) =>
        List().FirstOrDefault(r => r.Id.Equals(id, StringComparison.OrdinalIgnoreCase))
        ?? throw new ClientModuleException($"There is no client module '{id}'.", 404);

    // ================================================================ manifest

    /// <summary>
    /// The modules this caller may use: enabled, for the caller's tenant, and (unless public) allowed by the caller's roles;
    /// plus every enabled module they depend on, whoever the caller is.
    /// </summary>
    public IReadOnlyList<ClientModuleRecord> Visible(ClaimsPrincipal user, string? tenant)
    {
        var records = List().Where(r => r.Enabled && r.Active is not null).ToDictionary(r => r.Id, StringComparer.OrdinalIgnoreCase);
        var roles = user.FindAll(PlatformClaims.Role).Concat(user.FindAll(ClaimTypes.Role)).Select(c => c.Value).ToHashSet(StringComparer.Ordinal);
        var signedIn = user.Identity?.IsAuthenticated == true;

        bool Allowed(ClientModuleRecord r)
        {
            var s = r.Settings;
            if (s.AvailableToTenants.Count > 0 && (tenant is null || !s.AvailableToTenants.Contains(tenant, StringComparer.OrdinalIgnoreCase))) return false;
            if (!s.RequiresAuth) return true;
            if (!signedIn) return false;
            if (!string.IsNullOrEmpty(s.RequiredRole) && !roles.Contains(s.RequiredRole)) return false;
            return s.AvailableToRoles.Count == 0 || s.AvailableToRoles.Any(roles.Contains);
        }

        var visible = new Dictionary<string, ClientModuleRecord>(StringComparer.OrdinalIgnoreCase);
        void Add(ClientModuleRecord r)
        {
            if (!visible.TryAdd(r.Id, r)) return;
            foreach (var dependency in r.Settings.Dependencies)
                if (records.TryGetValue(dependency, out var d)) Add(d);
        }
        foreach (var record in records.Values.Where(Allowed)) Add(record);

        return visible.Values.OrderBy(r => r.Settings.LoadStrategy != ClientModuleLoadStrategy.Startup).ThenBy(r => r.Id, StringComparer.OrdinalIgnoreCase).ToList();
    }

    public ClientModuleManifest Manifest(ClaimsPrincipal user, string? tenant)
    {
        var modules = Visible(user, tenant).Select(Describe).ToList();
        var etag = Convert.ToHexStringLower(SHA256.HashData(JsonSerializer.SerializeToUtf8Bytes(modules, Json)))[..32];
        return new ClientModuleManifest(etag, modules);
    }

    private static ClientModuleDescriptor Describe(ClientModuleRecord r)
    {
        var v = r.Active!;
        var s = r.Settings;
        return new ClientModuleDescriptor(
            r.Id, s.Name ?? r.Id, v.Version,
            v.Kind == ClientModuleKind.NuPkg ? "nupkg" : "dll",
            FileUrl(r.Id, v.Version, v.Primary), v.Primary.Sha256,
            v.ExtraAssemblies.Select(f => FileUrl(r.Id, v.Version, f)).ToList(),
            v.ExtraAssemblies.Select(f => f.Sha256).ToList(),
            s.LoadStrategy, s.LoadStrategy == ClientModuleLoadStrategy.Startup,
            s.Hidden, s.RequiresAuth, s.RequiredRole, s.AvailableToRoles, s.RoutePrefixes, s.Layout,
            s.Dependencies, s.Styles, s.Scripts, s.Nav);
    }

    /// <summary>Relative to the WebApi base address. The hash makes the URL change whenever the content does.</summary>
    private static string FileUrl(string id, string version, ClientModuleFile file) =>
        $"api/client-modules/files/{Uri.EscapeDataString(id)}/{Uri.EscapeDataString(version)}/{Uri.EscapeDataString(file.Name)}?sha256={file.Sha256}";

    /// <summary>A stored file the caller may download, or null (404: unknown, or not for this caller).</summary>
    public (string Path, ClientModuleFile File, bool Public)? ResolveFile(ClaimsPrincipal user, string? tenant, string id, string version, string name)
    {
        var record = Visible(user, tenant).FirstOrDefault(r => r.Id.Equals(id, StringComparison.OrdinalIgnoreCase));
        var stored = record?.Versions.FirstOrDefault(v => v.Version == version);
        var file = stored is null ? null : new[] { stored.Primary }.Concat(stored.ExtraAssemblies).FirstOrDefault(f => f.Name == name);
        if (record is null || file is null) return null;
        var path = VersionFolder(record.Id, version, file.Name);
        return File.Exists(path) ? (path, file, !record.Settings.RequiresAuth) : null;
    }

    // ================================================================ upload → install

    public async Task<ClientModuleUpload> UploadAsync(string fileName, Stream content, string? user, CancellationToken ct)
    {
        CleanExpiredUploads();
        using var buffer = new MemoryStream();
        await content.CopyToAsync(buffer, ct);
        if (buffer.Length > _options.MaxPackageMegabytes * 1024L * 1024L)
            throw new ClientModuleException($"The package is larger than {_options.MaxPackageMegabytes} MB.", 413);

        var package = ClientModuleInspector.Inspect(fileName, buffer.ToArray());
        var token = Guid.NewGuid().ToString("N");
        var folder = Path.Combine(_uploads, token);
        Directory.CreateDirectory(folder);
        foreach (var file in package.Files) await File.WriteAllBytesAsync(Path.Combine(folder, file.Name), file.Content, ct);

        var upload = Describe(package, token, Path.GetFileName(fileName), user);
        await File.WriteAllTextAsync(Path.Combine(folder, "upload.json"), JsonSerializer.Serialize(new StagedUpload(upload, package.PackageHash), Json), ct);
        return upload;
    }

    public ClientModuleUpload GetUpload(string token) => Refresh(ReadStaged(token));

    public void DiscardUpload(string token)
    {
        ReadStaged(token);
        Directory.Delete(Path.Combine(_uploads, token), recursive: true);
    }

    public async Task<ClientModuleRecord> InstallAsync(string token, InstallClientModule request, string? user, CancellationToken ct)
    {
        var staged = ReadStaged(token);
        var folder = Path.Combine(_uploads, token);
        var files = new List<PackageFile>();
        foreach (var f in staged.Upload.Files) files.Add(new PackageFile(f.Name, await File.ReadAllBytesAsync(Path.Combine(folder, f.Name), ct)));
        var u = staged.Upload;
        var package = new InspectedPackage(u.Kind, u.Id, u.Version, u.Detected, files, u.Routes, u.Layouts, u.Warnings);
        if (package.PackageHash != staged.PackageHash) throw new ClientModuleException("The upload's files changed; upload the package again.", 409);

        var record = await ChangeAsync(records => AddVersion(records, package, request.Settings, request.Activate, request.Replace, core: false, "upload", user), ct);
        Directory.Delete(folder, recursive: true);
        _log.LogInformation("Client module {Module} {Version} installed by {User}", record.Id, package.Version, user);
        return record;
    }

    private ClientModuleUpload Describe(InspectedPackage package, string token, string fileName, string? user)
    {
        var upload = new ClientModuleUpload
        {
            Token = token,
            FileName = fileName,
            Id = package.Id,
            Version = package.Version,
            Kind = package.Kind,
            Detected = package.Detected,
            Files = package.Files.Select(f => f.Describe()).ToList(),
            Routes = package.Routes,
            Layouts = package.Layouts,
            Warnings = package.Warnings,
            ExpiresAt = DateTimeOffset.UtcNow + UploadLifetime
        };
        return Refresh(new StagedUpload(upload, package.PackageHash));
    }

    /// <summary>The upload compared with the catalog as it is now.</summary>
    private ClientModuleUpload Refresh(StagedUpload staged)
    {
        var existing = List().FirstOrDefault(r => r.Id.Equals(staged.Upload.Id, StringComparison.OrdinalIgnoreCase));
        var version = existing?.Versions.FirstOrDefault(v => v.Version == staged.Upload.Version);
        return staged.Upload with
        {
            Current = existing?.Settings,
            CurrentVersion = existing?.ActiveVersion,
            IsCore = existing?.Core ?? false,
            VersionExists = version is not null,
            SamePackage = version?.PackageHash == staged.PackageHash
        };
    }

    private StagedUpload ReadStaged(string token)
    {
        var file = Guid.TryParseExact(token, "N", out _) ? Path.Combine(_uploads, token, "upload.json") : null;
        if (file is null || !File.Exists(file)) throw new ClientModuleException($"There is no upload '{token}' (it may have expired).", 404);
        var staged = JsonSerializer.Deserialize<StagedUpload>(File.ReadAllText(file), Json)!;
        if (staged.Upload.ExpiresAt < DateTimeOffset.UtcNow) throw new ClientModuleException($"The upload '{token}' has expired; upload the package again.", 404);
        return staged;
    }

    private void CleanExpiredUploads()
    {
        foreach (var folder in Directory.EnumerateDirectories(_uploads))
            try
            {
                if (Directory.GetCreationTimeUtc(folder) < DateTime.UtcNow - UploadLifetime - TimeSpan.FromMinutes(5))
                    Directory.Delete(folder, recursive: true);
            }
            catch (IOException) { /* another replica is cleaning it */ }
    }

    private sealed record StagedUpload(ClientModuleUpload Upload, string PackageHash);

    // ================================================================ admin changes

    public Task<ClientModuleRecord> UpdateSettingsAsync(string id, ClientModuleSettings settings, string? user, CancellationToken ct) =>
        ChangeAsync(records =>
        {
            var record = Find(records, id);
            record.Settings = Validate(settings, record.Id);
            return Touch(record, user);
        }, ct);

    public Task<ClientModuleRecord> SetEnabledAsync(string id, bool enabled, string? user, CancellationToken ct) =>
        ChangeAsync(records =>
        {
            var record = Find(records, id);
            record.Enabled = enabled;
            return Touch(record, user);
        }, ct);

    public Task<ClientModuleRecord> ActivateVersionAsync(string id, string version, string? user, CancellationToken ct) =>
        ChangeAsync(records =>
        {
            var record = Find(records, id);
            if (record.Versions.All(v => v.Version != version))
                throw new ClientModuleException($"Client module '{record.Id}' has no version {version}.", 404);
            record.ActiveVersion = version;
            return Touch(record, user);
        }, ct);

    public Task<ClientModuleRecord> DeleteVersionAsync(string id, string version, string? user, CancellationToken ct) =>
        ChangeAsync(records =>
        {
            var record = Find(records, id);
            var stored = record.Versions.FirstOrDefault(v => v.Version == version)
                         ?? throw new ClientModuleException($"Client module '{record.Id}' has no version {version}.", 404);
            if (record.ActiveVersion == version)
                throw new ClientModuleException($"Version {version} is the active one; activate another version first, or delete the module.", 409);
            record.Versions.Remove(stored);
            DeleteFolder(Path.Combine(_files, record.Id, version));
            return Touch(record, user);
        }, ct);

    public Task DeleteAsync(string id, CancellationToken ct) =>
        ChangeAsync(records =>
        {
            var record = Find(records, id);
            if (record.Core) throw new ClientModuleException($"'{record.Id}' is a core client module (shipped with the WebApi): disable it instead.", 409);
            var dependents = records.Where(r => r.Settings.Dependencies.Contains(record.Id, StringComparer.OrdinalIgnoreCase)).Select(r => r.Id).ToList();
            if (dependents.Count > 0)
                throw new ClientModuleException($"{string.Join(", ", dependents)} depend on '{record.Id}'; change or delete them first.", 409);
            records.Remove(record);
            DeleteFolder(Path.Combine(_files, record.Id));
            return record;
        }, ct);

    // ================================================================ seeding

    /// <summary>
    /// Installs the client modules shipped with the WebApi release: every .dll / .nupkg / .zip in the seed folder, and
    /// every sub-folder (its assemblies form one module, like a .zip). A seeded module is Core. When the shipped files
    /// change, the new content becomes the active version and the admin's settings are kept. Idempotent; runs on every replica.
    /// </summary>
    public async Task SeedAsync(CancellationToken ct)
    {
        var source = Path.GetFullPath(_options.SeedPath, AppContext.BaseDirectory);
        if (!Directory.Exists(source)) return;

        var packages = new List<InspectedPackage>();
        foreach (var path in Directory.EnumerateFileSystemEntries(source).Order(StringComparer.OrdinalIgnoreCase))
        {
            try
            {
                if (Directory.Exists(path)) packages.Add(ClientModuleInspector.InspectFolder(path));
                else if (Path.GetExtension(path).ToLowerInvariant() is ".dll" or ".nupkg" or ".zip")
                    packages.Add(ClientModuleInspector.Inspect(Path.GetFileName(path), await File.ReadAllBytesAsync(path, ct)));
            }
            catch (ClientModuleException e)
            {
                _log.LogWarning("Core client module {Path} skipped: {Reason}", path, e.Message);
            }
        }
        if (packages.Count == 0) return;

        await ChangeAsync(records =>
        {
            foreach (var package in packages)
            {
                var existing = records.FirstOrDefault(r => r.Id.Equals(package.Id, StringComparison.OrdinalIgnoreCase));
                if (existing is { Core: false })
                {
                    _log.LogWarning("Core client module {Module} not seeded: an uploaded module has that id.", package.Id);
                    continue;
                }
                if (existing?.Active?.PackageHash == package.PackageHash) continue;

                var record = AddVersion(records, package, settings: null, activate: true, replace: true, core: true, "seed", user: null);
                // Older shipped versions are not needed any more; uploaded ones stay for rollback.
                foreach (var old in record.Versions.Where(v => v.Source == "seed" && v.Version != record.ActiveVersion).ToList())
                {
                    record.Versions.Remove(old);
                    DeleteFolder(Path.Combine(_files, record.Id, old.Version));
                }
                _log.LogInformation("Seeded core client module {Module} {Version}", record.Id, record.ActiveVersion);
            }
            return true;
        }, ct);
    }

    // ================================================================ helpers

    private ClientModuleRecord AddVersion(List<ClientModuleRecord> records, InspectedPackage package, ClientModuleSettings? settings,
        bool activate, bool replace, bool core, string source, string? user)
    {
        var now = DateTimeOffset.UtcNow;
        var record = records.FirstOrDefault(r => r.Id.Equals(package.Id, StringComparison.OrdinalIgnoreCase));
        if (record is { Core: true } && !core)
            throw new ClientModuleException($"'{record.Id}' is a core client module: it is updated with the WebApi release, not by upload.", 409);

        var existing = record?.Versions.FirstOrDefault(v => v.Version == package.Version);
        if (existing is not null && existing.PackageHash != package.PackageHash && !replace)
            throw new ClientModuleException(
                $"Version {package.Version} of '{package.Id}' is installed with other files. Raise the module's version, or install with replace = true.", 409);

        if (existing?.PackageHash != package.PackageHash)
        {
            // Write the files next to the target, then swap folders: readers never see half a version.
            var target = Path.Combine(_files, package.Id, package.Version);
            var staging = target + ".new-" + Guid.NewGuid().ToString("N")[..8];
            Directory.CreateDirectory(staging);
            foreach (var file in package.Files) File.WriteAllBytes(Path.Combine(staging, file.Name), file.Content);
            DeleteFolder(target);
            Directory.Move(staging, target);
        }

        var version = new ClientModuleVersion
        {
            Version = package.Version,
            Kind = package.Kind,
            Primary = package.Files[0].Describe(),
            ExtraAssemblies = package.Kind == ClientModuleKind.Dll ? package.Files.Skip(1).Select(f => f.Describe()).ToList() : [],
            PackageHash = package.PackageHash,
            Source = source,
            UploadedAt = existing?.PackageHash == package.PackageHash ? existing.UploadedAt : now,
            UploadedBy = existing?.PackageHash == package.PackageHash ? existing.UploadedBy : user,
            Routes = package.Routes,
            Layouts = package.Layouts
        };

        if (record is null)
        {
            record = new ClientModuleRecord
            {
                Id = package.Id,
                Settings = Validate(settings ?? package.Detected, package.Id),
                Core = core,
                ActiveVersion = package.Version,
                InstalledAt = now
            };
            records.Add(record);
        }
        else
        {
            if (settings is not null) record.Settings = Validate(settings, record.Id);
            if (activate) record.ActiveVersion = package.Version;
        }

        record.Versions.RemoveAll(v => v.Version == package.Version);
        record.Versions.Add(version);
        record.Versions.Sort((a, b) => b.UploadedAt.CompareTo(a.UploadedAt));
        return Touch(record, user);
    }

    private static ClientModuleSettings Validate(ClientModuleSettings settings, string id)
    {
        static IReadOnlyList<string> Clean(IReadOnlyList<string>? values) =>
            (values ?? []).Select(v => v.Trim()).Where(v => v.Length > 0).Distinct(StringComparer.OrdinalIgnoreCase).ToList();

        var dependencies = Clean(settings.Dependencies);
        if (dependencies.Contains(id, StringComparer.OrdinalIgnoreCase))
            throw new ClientModuleException("A module cannot depend on itself.");
        var prefixes = Clean(settings.RoutePrefixes).Select(p => p.Trim('/')).ToList();

        return settings with
        {
            Name = string.IsNullOrWhiteSpace(settings.Name) ? null : settings.Name.Trim(),
            Description = string.IsNullOrWhiteSpace(settings.Description) ? null : settings.Description.Trim(),
            RequiredRole = string.IsNullOrWhiteSpace(settings.RequiredRole) ? null : settings.RequiredRole.Trim(),
            Layout = string.IsNullOrWhiteSpace(settings.Layout) ? null : settings.Layout.Trim(),
            AvailableToRoles = Clean(settings.AvailableToRoles),
            AvailableToTenants = Clean(settings.AvailableToTenants),
            RoutePrefixes = prefixes,
            Dependencies = dependencies,
            Styles = Clean(settings.Styles),
            Scripts = Clean(settings.Scripts),
            Nav = (settings.Nav ?? []).Where(n => !string.IsNullOrWhiteSpace(n.Title) && !string.IsNullOrWhiteSpace(n.Href)).ToList()
        };
    }

    private static ClientModuleRecord Find(List<ClientModuleRecord> records, string id) =>
        records.FirstOrDefault(r => r.Id.Equals(id, StringComparison.OrdinalIgnoreCase))
        ?? throw new ClientModuleException($"There is no client module '{id}'.", 404);

    private static ClientModuleRecord Touch(ClientModuleRecord record, string? user)
    {
        record.UpdatedAt = DateTimeOffset.UtcNow;
        record.UpdatedBy = user;
        return record;
    }

    private string VersionFolder(string id, string version, string file) => Path.Combine(_files, id, version, file);

    private static void DeleteFolder(string folder)
    {
        if (Directory.Exists(folder)) Directory.Delete(folder, recursive: true);
    }

    /// <summary>Reads the records fresh, applies the change and saves, all under the lock.</summary>
    private async Task<T> ChangeAsync<T>(Func<List<ClientModuleRecord>, T> change, CancellationToken ct)
    {
        using var _ = await LockAsync(ct);
        var records = File.Exists(_records)
            ? JsonSerializer.Deserialize<List<ClientModuleRecord>>(await File.ReadAllTextAsync(_records, ct), Json) ?? []
            : [];
        var result = change(records);
        var temp = _records + ".tmp";
        await File.WriteAllTextAsync(temp, JsonSerializer.Serialize(records.OrderBy(r => r.Id, StringComparer.OrdinalIgnoreCase).ToList(), Json), Encoding.UTF8, ct);
        File.Move(temp, _records, overwrite: true);
        _cache = null;
        return result;
    }

    private async Task<IDisposable> LockAsync(CancellationToken ct)
    {
        var lockPath = _records + ".lock";
        for (var attempt = 0; ; attempt++)
        {
            try
            {
                return new FileStream(lockPath, FileMode.OpenOrCreate, FileAccess.ReadWrite, FileShare.None, 1, FileOptions.DeleteOnClose);
            }
            catch (Exception e) when (e is IOException or UnauthorizedAccessException && attempt < 400) // ~10 s
            {
                await Task.Delay(25, ct);
            }
        }
    }
}
