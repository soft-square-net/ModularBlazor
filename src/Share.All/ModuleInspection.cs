namespace soft.square.net.Share.All;

/// <summary>What an uploaded assembly turned out to be, found by reading its metadata (its code is never run).</summary>
public enum DetectedModuleKind
{
    Unknown,

    /// <summary>A Blazor client module: pages, components. Downloaded by the client.</summary>
    Client,

    /// <summary>A Blazor client module that provides layouts ([LayoutKey]). Stored and downloaded like a client module.</summary>
    Layout,

    /// <summary>An API module (public IHostModule). Compiled into the host after a rebuild.</summary>
    Host
}

/// <summary>One routable page found inside a client module.</summary>
public sealed record ModuleRouteDto(string Template, string Component, string? Layout, bool RequiresAuth, string[] Roles);

/// <summary>Settings of a host module (the part an administrator can change before installing it).</summary>
public sealed class HostModuleSettings
{
    public string? Name { get; set; }

    /// <summary>A JSON object, injected as configuration section Modules:&lt;Name&gt;. Default: the module's own default.</summary>
    public string? ConfigurationJson { get; set; }

    /// <summary>Include it in the next build.</summary>
    public bool Enabled { get; set; } = true;
}

/// <summary>
/// The result of uploading just a file: what it is, and the default settings found in it (assembly attributes
/// <c>[assembly: ClientModule]</c> / <c>[assembly: HostModule]</c>). The file waits under <see cref="Token"/> until the administrator
/// confirms (or discards) the settings.
/// </summary>
public sealed record ModuleInspectionDto(
    string Token, string FileName, ModuleKind PackageKind, DetectedModuleKind Detected, string PackageId, string Version,
    string DisplayName, string? ExistingId,
    ModuleRegistrationRequest Client, HostModuleSettings Host,
    IReadOnlyList<ModuleRouteDto> Routes, string[] LayoutKeys, string[] Warnings);
