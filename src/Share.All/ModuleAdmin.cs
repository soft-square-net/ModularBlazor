namespace soft.square.net.Share.All;

/// <summary>What an administrator sends to register (or edit) a client module. Sent as JSON next to the uploaded file.</summary>
public sealed class ModuleRegistrationRequest
{
    /// <summary>Module id, e.g. "Module.Reports". Empty: derived from the assembly name.</summary>
    public string? Id { get; set; }

    public string? Name { get; set; }

    /// <summary>Offered to clients. A newly registered module starts disabled.</summary>
    public bool Enabled { get; set; }

    /// <summary>True: a core module (downloaded at startup, before sign-in). False: a user module (lazy).</summary>
    public bool LoadOnStartup { get; set; }

    public bool Hidden { get; set; }
    public bool RequiresAuth { get; set; }
    public string? RequiredRole { get; set; }
    public string? Layout { get; set; }
    public string[] AvailableToRoles { get; set; } = [];
    public string[] RoutePrefixes { get; set; } = [];
    public string[] Dependencies { get; set; } = [];
    public string[] Styles { get; set; } = [];
    public string[] Scripts { get; set; } = [];
    public ModuleNavItem[] Nav { get; set; } = [];
}

/// <summary>A registered client module as the management page sees it.</summary>
public sealed record ModuleRegistrationDto(
    string Id, string Name, string Version, ModuleKind Kind, string Url, string? Sha256, bool Enabled,
    bool LoadOnStartup, bool Hidden, bool RequiresAuth, string? RequiredRole, string? Layout,
    string[] AvailableToRoles, string[] RoutePrefixes, string[] Dependencies, string[] Styles, string[] Scripts,
    ModuleNavItem[] Nav,
    string? PackageId, string? FileName, long? SizeBytes, DateTime? UploadedUtc);
