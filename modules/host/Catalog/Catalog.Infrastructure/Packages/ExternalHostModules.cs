using System.Text.Json;
using System.Text.Json.Serialization;
using soft.square.net.ModularBlazor.Host.Modules.Catalog.Domain;
using soft.square.net.ModularBlazor.Infrastructure.Modules;

namespace soft.square.net.ModularBlazor.Host.Modules.Catalog.Infrastructure.Packages;

/// <summary>
/// Finds the host modules that were enabled in the module store and built into this app. Run before the host
/// is built, so it uses only the store's files. An enabled package that is not part of this build yet is
/// reported and skipped: it needs a rebuild (see the restart endpoint and scripts/run-host.*).
/// </summary>
public static class ExternalHostModules
{
    public static IHostModule[] Load(string storePath, Action<string>? log = null)
    {
        var manifest = Path.Combine(Path.GetFullPath(storePath), "modules.json");
        if (!File.Exists(manifest)) return [];

        var options = new JsonSerializerOptions(JsonSerializerDefaults.Web) { Converters = { new JsonStringEnumConverter() } };
        var packages = JsonSerializer.Deserialize<Manifest>(File.ReadAllText(manifest), options)?.Packages ?? [];

        var modules = new List<IHostModule>();
        foreach (var package in packages.Where(p => p.Enabled && p.Target == ModuleTarget.Host))
        {
            try
            {
                var assembly = System.Reflection.Assembly.Load(new System.Reflection.AssemblyName(package.PackageId));
                var types = assembly.GetTypes().Where(t => t is { IsAbstract: false, IsInterface: false, IsPublic: true }
                                                           && typeof(IHostModule).IsAssignableFrom(t)
                                                           && t.GetConstructor(Type.EmptyTypes) is not null).ToList();
                if (types.Count == 0)
                    log?.Invoke($"Module '{package.Name}': {package.PackageId} has no public IHostModule with a parameterless constructor.");
                modules.AddRange(types.Select(t => (IHostModule)Activator.CreateInstance(t)!));
            }
            catch (Exception ex) when (ex is FileNotFoundException or FileLoadException or BadImageFormatException)
            {
                log?.Invoke($"Module '{package.Name}' ({package.PackageId} {package.Version}) is enabled but not part of this build yet: rebuild the host.");
            }
        }

        return modules.ToArray();
    }

    private sealed class Manifest
    {
        public List<ModulePackage> Packages { get; set; } = [];
    }
}
