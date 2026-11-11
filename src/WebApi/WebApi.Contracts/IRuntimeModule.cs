using Microsoft.Extensions.Configuration;
using Microsoft.Extensions.DependencyInjection;

namespace soft.square.net.WebApi.Contracts;

/// <summary>
/// Entry point of a module the host loads at runtime from an uploaded .dll, .zip or .nupkg.
/// A package has exactly one public, non-abstract implementation with a parameterless constructor.
/// Endpoints come from the package's <c>ICarterModule</c> types; they are mapped under the manifest's route prefix.
/// </summary>
public interface IRuntimeModule
{
    /// <summary>Read once at install time and registered in the module store.</summary>
    ModuleManifest Manifest { get; }

    /// <summary>
    /// Registers the module's own services. They live in a module-level container that falls back to the
    /// host for everything else (logging, options, tenant context, ...).
    /// </summary>
    /// <param name="settings">The module's settings: the manifest defaults, overridden by the admin.</param>
    void ConfigureServices(IServiceCollection services, IConfiguration settings);
}

/// <param name="Id">Stable, lowercase identifier (a-z, 0-9, '.', '-').</param>
/// <param name="RoutePrefix">Segment the module's endpoints are mapped under, e.g. "greeting" → /api/greeting/...</param>
public sealed record ModuleManifest(string Id, string Name, string Version, string RoutePrefix)
{
    public string? Description { get; init; }

    /// <summary>Default settings copied into the module store on install; the admin can override them.</summary>
    public IReadOnlyDictionary<string, string?> DefaultSettings { get; init; } = new Dictionary<string, string?>();

    /// <summary>
    /// Permissions the module's endpoints require (<c>RequirePermission</c>), listed in the permission catalog. Activation
    /// fails when an endpoint requires a permission that is neither declared here nor a platform permission.
    /// </summary>
    public IReadOnlyList<Security.PermissionDefinition> Permissions { get; init; } = [];
}
