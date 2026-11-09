using soft.square.net.Share.All;

namespace soft.square.net.ModularBlazor.Host.Modules.Catalog.Application.Packages;

/// <summary>What was read from an assembly's metadata. Attribute values are by property name (ClientModule / HostModule attributes).</summary>
public sealed record ModuleInspection(
    DetectedModuleKind Kind, string AssemblyName, string Version, string? Title,
    IReadOnlyDictionary<string, object?>? ClientModule, IReadOnlyDictionary<string, object?>? HostModule,
    IReadOnlyList<ModuleRouteDto> Routes, string[] LayoutKeys, string[] Warnings);

/// <summary>
/// Reads a module file (.dll or .nupkg) without loading or running it: assembly attributes, page routes, layouts, IHostModule types.
/// An uploaded file is untrusted, so nothing in it may execute while the administrator is still deciding.
/// </summary>
public interface IModuleInspector
{
    ModuleInspection Inspect(Stream content, string fileName);
}

/// <summary>Uploaded files waiting for the administrator to confirm their settings.</summary>
public interface IPendingModuleStore
{
    /// <summary>Keeps the file and returns its token.</summary>
    Task<string> SaveAsync(string fileName, Stream content, CancellationToken cancellationToken);

    Task SaveInspectionAsync(string token, ModuleInspectionDto inspection, CancellationToken cancellationToken);

    Task<ModuleInspectionDto?> FindInspectionAsync(string token, CancellationToken cancellationToken);

    /// <summary>The waiting file; null when the token is unknown or expired.</summary>
    Stream? Open(string token);

    void Delete(string token);
}
