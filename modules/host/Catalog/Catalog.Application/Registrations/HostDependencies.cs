using soft.square.net.ModularBlazor.Core.Exceptions;
using soft.square.net.ModularBlazor.Host.Modules.Catalog.Application.Packages;
using soft.square.net.ModularBlazor.Host.Modules.Catalog.Domain;
using soft.square.net.Share.All;

namespace soft.square.net.ModularBlazor.Host.Modules.Catalog.Application.Registrations;

/// <summary>
/// A client module can need host modules (API extensions). Planning says what that needs; installing downloads and enables what is
/// missing. Host modules are compiled in, so "running" only happens after a restart: the client module is switched on then.
/// </summary>
internal static class HostDependencies
{
    /// <summary>"Package" or "Package@Version": how a dependency is stored on a registration.</summary>
    public static string Key(HostDependencyRequest d)
        => string.IsNullOrWhiteSpace(d.Version) ? d.Package.Trim() : $"{d.Package.Trim()}@{d.Version.Trim()}";

    public static (string Package, string? Version) Parse(string key)
    {
        var at = key.IndexOf('@');
        return at < 0 ? (key, null) : (key[..at], key[(at + 1)..]);
    }

    public static string NuGetUrl(string package, string version)
    {
        var id = package.ToLowerInvariant();
        var v = version.ToLowerInvariant();
        return $"https://api.nuget.org/v3-flatcontainer/{id}/{v}/{id}.{v}.nupkg";
    }

    private static bool Matches(ModulePackage p, string package, string? version)
        => p.Target == ModuleTarget.Host
           && string.Equals(p.PackageId, package, StringComparison.OrdinalIgnoreCase)
           && (string.IsNullOrWhiteSpace(version) || string.Equals(p.Version, version, StringComparison.OrdinalIgnoreCase));

    private static string? SourceOf(HostDependencyRequest d)
        => !string.IsNullOrWhiteSpace(d.SourceUrl) ? d.SourceUrl.Trim()
           : !string.IsNullOrWhiteSpace(d.Version) ? NuGetUrl(d.Package.Trim(), d.Version.Trim())
           : null;

    public static async Task<RegistrationPlanDto> PlanAsync(IEnumerable<HostDependencyRequest> dependencies, IModulePackageStore store, CancellationToken ct)
    {
        var packages = await store.ListAsync(ct);
        var items = new List<HostDependencyPlanItem>();

        foreach (var d in dependencies)
        {
            var package = d.Package.Trim();
            var version = string.IsNullOrWhiteSpace(d.Version) ? null : d.Version.Trim();
            var matches = packages.Where(p => Matches(p, package, version)).ToList();

            if (matches.Any(p => p.Enabled && store.IsLoaded(p)))
                items.Add(new(package, version, HostDependencyState.Running, null, null));
            else if (matches.Any(p => p.Enabled))
                items.Add(new(package, version, HostDependencyState.EnabledPendingRestart, null, null));
            else if (matches.Count > 0)
                items.Add(new(package, version, HostDependencyState.InStore, null, null));
            else if (SourceOf(d) is { } source)
                items.Add(new(package, version, HostDependencyState.WillDownload, source, null));
            else
                items.Add(new(package, version, HostDependencyState.Unavailable, null,
                    "Not in the module store. Give a version (downloaded from nuget.org) or a source address."));
        }

        return new RegistrationPlanDto(items,
            NeedsApproval: items.Any(i => i.State is HostDependencyState.InStore or HostDependencyState.WillDownload),
            NeedsRestart: items.Any(i => i.State != HostDependencyState.Running),
            Blocked: items.Any(i => i.State == HostDependencyState.Unavailable));
    }

    /// <summary>True when every dependency is enabled and part of the running API.</summary>
    public static async Task<bool> AllRunningAsync(IEnumerable<string> keys, IModulePackageStore store, CancellationToken ct)
    {
        var list = keys.ToList();
        if (list.Count == 0) return true;
        var packages = await store.ListAsync(ct);
        return list.All(k =>
        {
            var (package, version) = Parse(k);
            return packages.Any(p => Matches(p, package, version) && p.Enabled && store.IsLoaded(p));
        });
    }

    /// <summary>
    /// Enables what is in the store and downloads what is not, then enables it. Returns an undo action: if the client module cannot be
    /// registered afterwards, the host modules added or enabled here are put back as they were.
    /// </summary>
    public static async Task<Func<Task>> InstallAsync(
        IEnumerable<HostDependencyRequest> dependencies, IModulePackageStore store, IHostPackageSource source, string? user, CancellationToken ct)
    {
        var undo = new List<Func<Task>>();
        try
        {
            foreach (var d in dependencies)
            {
                var package = d.Package.Trim();
                var version = string.IsNullOrWhiteSpace(d.Version) ? null : d.Version.Trim();
                var all = await store.ListAsync(ct);
                var matches = all.Where(p => Matches(p, package, version)).ToList();

                if (matches.Any(p => p.Enabled)) continue;

                ModulePackage target;
                if (matches.Count > 0)
                {
                    target = matches.OrderByDescending(p => p.UploadedUtc).First();
                }
                else
                {
                    var url = SourceOf(d) ?? throw new CustomException($"Host module '{package}' is not in the store and has no source.");
                    var fallback = version is null ? $"{package}.dll" : $"{package}.{version}.nupkg";
                    var file = await source.DownloadAsync(url, fallback, ct);
                    await using var content = file.Content;
                    var stored = await store.AddAsync(ModuleTarget.Host, file.FileName, file.Content, null, user, ct);
                    undo.Add(() => store.DeleteAsync(stored.Id, ct));

                    if (!string.Equals(stored.PackageId, package, StringComparison.OrdinalIgnoreCase)
                        || (version is not null && !string.Equals(stored.Version, version, StringComparison.OrdinalIgnoreCase)))
                        throw new CustomException(
                            $"The file from {url} is '{stored.PackageId} {stored.Version}', not the requested '{package}{(version is null ? "" : " " + version)}'.");
                    target = stored;
                }

                var clash = all.FirstOrDefault(p => p.Id != target.Id && p.Enabled && p.Target == ModuleTarget.Host
                                                    && string.Equals(p.PackageId, target.PackageId, StringComparison.OrdinalIgnoreCase));
                if (clash is not null)
                    throw new ConflictException($"Version {clash.Version} of '{clash.PackageId}' is enabled; disable it first.");

                target.Enabled = true;
                await store.UpdateAsync(target, ct);
                var enabled = target;
                undo.Add(async () => { enabled.Enabled = false; await store.UpdateAsync(enabled, ct); });
            }
        }
        catch
        {
            await UndoAsync(undo);
            throw;
        }

        return () => UndoAsync(undo);
    }

    private static async Task UndoAsync(List<Func<Task>> undo)
    {
        for (var i = undo.Count - 1; i >= 0; i--)
        {
            try { await undo[i](); } catch { /* best effort: the original error is what matters */ }
        }
        undo.Clear();
    }
}
