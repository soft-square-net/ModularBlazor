using soft.square.net.ModularBlazor.Host.Modules.Catalog.Domain;

namespace soft.square.net.ModularBlazor.Host.Modules.Catalog.Application.Packages;

/// <summary>Where module packages and their settings are kept (implemented by the Infrastructure project).</summary>
public interface IModulePackageStore
{
    Task<IReadOnlyList<ModulePackage>> ListAsync(CancellationToken cancellationToken);

    Task<ModulePackage?> FindAsync(string id, CancellationToken cancellationToken);

    /// <summary>Stores the file, reads its identity (assembly or nuspec) and records it. Starts disabled.</summary>
    Task<ModulePackage> AddAsync(ModuleTarget target, string fileName, Stream content, string? name, string? uploadedBy,
        CancellationToken cancellationToken);

    Task UpdateAsync(ModulePackage package, CancellationToken cancellationToken);

    Task DeleteAsync(string id, CancellationToken cancellationToken);

    Stream OpenRead(ModulePackage package);

    /// <summary>True when the host package's assembly is part of the running process.</summary>
    bool IsLoaded(ModulePackage package);
}
