using System.Reflection;
using System.Runtime.Loader;

namespace soft.square.net.WebApi.Modularity;

/// <summary>
/// Collectible load context for one runtime module.
/// Every assembly the host already ships (framework, Carter, WebApi.Contracts, ...) is shared from the default
/// context so types such as IRuntimeModule and ICarterModule keep one identity; the module's private
/// dependencies load here, from bytes, so the package files are never locked.
/// </summary>
internal sealed class ModuleLoadContext : AssemblyLoadContext
{
    private static readonly HashSet<string> HostAssemblies =
        ((string?)AppContext.GetData("TRUSTED_PLATFORM_ASSEMBLIES") ?? string.Empty)
        .Split(Path.PathSeparator, StringSplitOptions.RemoveEmptyEntries)
        .Select(path => Path.GetFileNameWithoutExtension(path))
        .ToHashSet(StringComparer.OrdinalIgnoreCase);

    private readonly AssemblyDependencyResolver _resolver;

    public ModuleLoadContext(string name, string entryAssemblyPath) : base(name, isCollectible: true)
    {
        _resolver = new AssemblyDependencyResolver(entryAssemblyPath);
    }

    /// <summary>True when the host ships an assembly with this name; the module then uses the host's copy.</summary>
    public static bool IsShared(string? simpleName) => simpleName is not null && HostAssemblies.Contains(simpleName);

    protected override Assembly? Load(AssemblyName name)
    {
        if (IsShared(name.Name)) return null; // fall back to the default context
        var path = _resolver.ResolveAssemblyToPath(name);
        return path is null ? null : LoadWithoutLock(path);
    }

    protected override IntPtr LoadUnmanagedDll(string unmanagedDllName)
    {
        var path = _resolver.ResolveUnmanagedDllToPath(unmanagedDllName);
        return path is null ? IntPtr.Zero : LoadUnmanagedDllFromPath(path);
    }

    public Assembly LoadWithoutLock(string path)
    {
        using var assembly = new MemoryStream(File.ReadAllBytes(path));
        var pdbPath = Path.ChangeExtension(path, ".pdb");
        using var symbols = File.Exists(pdbPath) ? new MemoryStream(File.ReadAllBytes(pdbPath)) : null;
        return LoadFromStream(assembly, symbols);
    }
}
