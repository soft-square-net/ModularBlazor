using System.Text.Json.Serialization;

namespace soft.square.net.WebApi.Modules.Core.ClientModules;

/// <summary>How a client module's files are shipped. A .zip upload is stored as <see cref="Dll"/> plus extra assemblies.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<ClientModuleKind>))]
public enum ClientModuleKind { Dll, NuPkg }

/// <summary>When the client app downloads a module.</summary>
[JsonConverter(typeof(JsonStringEnumConverter<ClientModuleLoadStrategy>))]
public enum ClientModuleLoadStrategy
{
    /// <summary>Before the first render (layouts, theme). Usually <c>RequiresAuth = false</c>.</summary>
    Startup,

    /// <summary>Routes and menu entries are known from the manifest; the code is downloaded on the first navigation to it.</summary>
    Lazy,

    /// <summary>Like <see cref="Lazy"/>, but the client downloads it in the background once the user is signed in.</summary>
    Preload
}

public sealed record ClientModuleNavItem(string Title, string Href, int Order = 100);

/// <summary>What an admin decides about a client module. Kept across versions: a new version keeps the module's settings.</summary>
public sealed record ClientModuleSettings
{
    public string? Name { get; init; }
    public string? Description { get; init; }
    public ClientModuleLoadStrategy LoadStrategy { get; init; } = ClientModuleLoadStrategy.Lazy;

    /// <summary>Not listed in the client's own module list (layouts, themes).</summary>
    public bool Hidden { get; init; }

    /// <summary>False: anonymous users get it too (layouts, the sign-in page's theme).</summary>
    public bool RequiresAuth { get; init; } = true;

    /// <summary>A token role the user must have.</summary>
    public string? RequiredRole { get; init; }

    /// <summary>Token roles that may use the module (any of them). Empty: every signed-in user.</summary>
    public IReadOnlyList<string> AvailableToRoles { get; init; } = [];

    /// <summary>Tenants that get the module. Empty: every tenant, and requests without a tenant.</summary>
    public IReadOnlyList<string> AvailableToTenants { get; init; } = [];

    /// <summary>Default layout key of the module's pages.</summary>
    public string? Layout { get; init; }

    /// <summary>First path segments the module's pages live under; navigating there loads the module.</summary>
    public IReadOnlyList<string> RoutePrefixes { get; init; } = [];

    /// <summary>Client modules (ids) loaded before this one. The manifest includes them whenever this module is included.</summary>
    public IReadOnlyList<string> Dependencies { get; init; } = [];

    public IReadOnlyList<string> Styles { get; init; } = [];
    public IReadOnlyList<string> Scripts { get; init; } = [];
    public IReadOnlyList<ClientModuleNavItem> Nav { get; init; } = [];
}

/// <summary>One stored file of a version: its name, SHA-256 (hex, lowercase) and size.</summary>
public sealed record ClientModuleFile(string Name, string Sha256, long Size);

/// <summary>An installed version. Files are stored under files/{id}/{version}/.</summary>
public sealed record ClientModuleVersion
{
    public required string Version { get; init; }
    public required ClientModuleKind Kind { get; init; }

    /// <summary>The .dll with [assembly: ClientModule], or the .nupkg.</summary>
    public required ClientModuleFile Primary { get; init; }

    /// <summary>Other assemblies of a .zip (or a seed folder), loaded before the primary one.</summary>
    public IReadOnlyList<ClientModuleFile> ExtraAssemblies { get; init; } = [];

    /// <summary>Identifies the content: equal hashes, same files.</summary>
    public required string PackageHash { get; init; }

    /// <summary>"upload" or "seed" (shipped with the WebApi release).</summary>
    public required string Source { get; init; }

    public DateTimeOffset UploadedAt { get; init; }
    public string? UploadedBy { get; init; }

    /// <summary>@page templates found in the module, for information.</summary>
    public IReadOnlyList<string> Routes { get; init; } = [];

    /// <summary>Layout keys ([LayoutKey]) the module provides.</summary>
    public IReadOnlyList<string> Layouts { get; init; } = [];
}

/// <summary>A client module in the catalog.</summary>
public sealed class ClientModuleRecord
{
    public required string Id { get; init; }
    public ClientModuleSettings Settings { get; set; } = new();

    /// <summary>Shipped with the WebApi release (CoreClientModules) and seeded on startup: it can be disabled, not deleted.</summary>
    public bool Core { get; set; }

    /// <summary>False: left out of every manifest; its files are not served.</summary>
    public bool Enabled { get; set; } = true;

    /// <summary>The version the manifest hands out.</summary>
    public required string ActiveVersion { get; set; }

    public List<ClientModuleVersion> Versions { get; set; } = [];
    public DateTimeOffset InstalledAt { get; init; }
    public DateTimeOffset UpdatedAt { get; set; }
    public string? UpdatedBy { get; set; }

    public ClientModuleVersion? Active => Versions.FirstOrDefault(v => v.Version == ActiveVersion);
}

/// <summary>
/// One module of the client manifest: the shape of the client app's module descriptor. URLs are relative to the
/// WebApi base address (the gateway) and carry the file's hash, so a cached copy is never stale.
/// </summary>
public sealed record ClientModuleDescriptor(
    string Id,
    string Name,
    string Version,
    string Kind, // "dll" or "nupkg", as the client's module catalog spells it
    string Url,
    string Sha256,
    IReadOnlyList<string> ExtraAssemblies,
    IReadOnlyList<string> ExtraSha256,
    ClientModuleLoadStrategy LoadStrategy,
    bool LoadOnStartup,
    bool Hidden,
    bool RequiresAuth,
    string? RequiredRole,
    IReadOnlyList<string> AvailableToRoles,
    IReadOnlyList<string> RoutePrefixes,
    string? Layout,
    IReadOnlyList<string> Dependencies,
    IReadOnlyList<string> Styles,
    IReadOnlyList<string> Scripts,
    IReadOnlyList<ClientModuleNavItem> Nav);

/// <summary>The modules the caller may use; <see cref="ETag"/> changes whenever the list does.</summary>
public sealed record ClientModuleManifest(string ETag, IReadOnlyList<ClientModuleDescriptor> Modules);

/// <summary>An uploaded package, checked and waiting for the admin to install or discard it.</summary>
public sealed record ClientModuleUpload
{
    public required string Token { get; init; }
    public required string FileName { get; init; }
    public required string Id { get; init; }
    public required string Version { get; init; }
    public required ClientModuleKind Kind { get; init; }

    /// <summary>Read from [assembly: ClientModule] (and client-module.json in a .zip): the settings of a new module.</summary>
    public required ClientModuleSettings Detected { get; init; }

    /// <summary>The installed module's settings, kept when this version is installed, unless the install request sends others.</summary>
    public ClientModuleSettings? Current { get; init; }

    public string? CurrentVersion { get; init; }
    public bool IsCore { get; init; }

    /// <summary>This version is installed already.</summary>
    public bool VersionExists { get; init; }

    /// <summary>...with exactly these files (installing again only applies settings and activation).</summary>
    public bool SamePackage { get; init; }

    /// <summary>The files that will be stored, the module's own first (a .nupkg is one file).</summary>
    public IReadOnlyList<ClientModuleFile> Files { get; init; } = [];
    public IReadOnlyList<string> Routes { get; init; } = [];
    public IReadOnlyList<string> Layouts { get; init; } = [];
    public IReadOnlyList<string> Warnings { get; init; } = [];
    public DateTimeOffset ExpiresAt { get; init; }
}

/// <param name="Settings">Null: a new module gets the detected settings, an installed one keeps its own.</param>
/// <param name="Activate">Make this the version the manifest hands out (default true).</param>
/// <param name="Replace">The same version is installed with other files: replace them (default false: 409).</param>
public sealed record InstallClientModule(ClientModuleSettings? Settings = null, bool Activate = true, bool Replace = false);

/// <summary>A rule the catalog refuses; <see cref="StatusCode"/> is the HTTP answer.</summary>
public sealed class ClientModuleException(string message, int statusCode = 400) : Exception(message)
{
    public int StatusCode { get; } = statusCode;
}
