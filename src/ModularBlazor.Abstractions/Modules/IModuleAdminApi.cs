using soft.square.net.Share.All;

namespace soft.square.net.ModularBlazor.Abstractions;

/// <summary>A package in the API's module store (host or client side).</summary>
public sealed record ModulePackageInfo(
    string Id, string Name, string PackageId, string Version, string Target, ModuleKind Kind, string FileName,
    string Sha256, long SizeBytes, bool Enabled, bool Loaded, bool RebuildRequired, string? Configuration,
    DateTime UploadedUtc, string? UploadedBy);

/// <summary>The API refused a module-management call; Message is the server's explanation.</summary>
public sealed class ModuleAdminException(string message, int statusCode) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}

/// <summary>
/// The module-management endpoints of the API (/api/v1/modules/...), for the "Module Management" page.
/// Hand-written on purpose: it does not depend on regenerating the NSwag client, and uploads are plain multipart.
/// </summary>
public interface IModuleAdminApi
{
    // ---- install from the file alone: upload, review the settings found in the module, confirm
    /// <summary>Uploads a .dll / .nupkg and reads what it is (client, layout or host) and its default settings. The file waits for confirmation.</summary>
    Task<ModuleInspectionDto> InspectAsync(Stream file, string fileName, CancellationToken cancellationToken = default);

    Task<ModuleInspectionDto> GetInspectionAsync(string token, CancellationToken cancellationToken = default);

    /// <summary>Registers and activates the waiting client / layout module with the confirmed settings.</summary>
    Task<ModuleRegistrationDto> InstallInspectedClientAsync(string token, ModuleRegistrationRequest settings, CancellationToken cancellationToken = default);

    /// <summary>Stores and enables the waiting host module with the confirmed settings (takes effect after a rebuild).</summary>
    Task<ModulePackageInfo> InstallInspectedHostAsync(string token, HostModuleSettings settings, CancellationToken cancellationToken = default);

    Task DiscardInspectionAsync(string token, CancellationToken cancellationToken = default);

    // ---- client modules: the catalog (what the Blazor client downloads)
    Task<IReadOnlyList<ModuleRegistrationDto>> ListRegistrationsAsync(CancellationToken cancellationToken = default);

    /// <summary>What registering a client module would install on the host (its host modules): show it, then register with ApproveHostInstall.</summary>
    Task<RegistrationPlanDto> PlanRegistrationAsync(ModuleRegistrationRequest request, CancellationToken cancellationToken = default);

    /// <summary>Uploads a .dll / .nupkg and registers it. An existing id gets the new file and keeps its metadata.</summary>
    Task<ModuleRegistrationDto> RegisterAsync(Stream file, string fileName, ModuleRegistrationRequest request, CancellationToken cancellationToken = default);

    Task<ModuleRegistrationDto> UpdateRegistrationAsync(string id, ModuleRegistrationRequest request, CancellationToken cancellationToken = default);
    Task<ModuleRegistrationDto> SetRegistrationEnabledAsync(string id, bool enabled, CancellationToken cancellationToken = default);
    Task DeleteRegistrationAsync(string id, CancellationToken cancellationToken = default);

    // ---- host modules: packages that extend the API (take effect after a rebuild)
    Task<IReadOnlyList<ModulePackageInfo>> ListHostPackagesAsync(CancellationToken cancellationToken = default);
    Task<ModulePackageInfo> UploadHostPackageAsync(Stream file, string fileName, string? name, CancellationToken cancellationToken = default);
    Task<ModulePackageInfo> SetPackageEnabledAsync(string packageId, bool enabled, CancellationToken cancellationToken = default);
    Task DeletePackageAsync(string packageId, CancellationToken cancellationToken = default);

    /// <summary>Stops the API so the supervisor (scripts/run-host.*) rebuilds it with the enabled host modules.</summary>
    Task RestartHostAsync(CancellationToken cancellationToken = default);

    // ---- both
    Task<byte[]> DownloadPackageAsync(string packageId, CancellationToken cancellationToken = default);
}
