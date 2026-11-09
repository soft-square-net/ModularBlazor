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

    /// <summary>
    /// Host modules (API extensions) this client module needs. Missing ones are downloaded and enabled first; the client
    /// module is switched on once they are running. Only done when <see cref="ApproveHostInstall"/> is true.
    /// </summary>
    public HostDependencyRequest[] HostDependencies { get; set; } = [];

    /// <summary>The administrator has seen the plan (RegistrationPlanDto) and agreed to install the host modules in it.</summary>
    public bool ApproveHostInstall { get; set; }
}

/// <summary>A host module a client module needs: an assembly name or NuGet package id, optionally a version and a source.</summary>
public sealed class HostDependencyRequest
{
    /// <summary>Assembly name (dll) or NuGet package id (nupkg), e.g. "soft.square.net.Module.Reports.Host".</summary>
    public string Package { get; set; } = "";

    /// <summary>Exact version. Empty: any version already in the store.</summary>
    public string? Version { get; set; }

    /// <summary>https address of the .dll / .nupkg to download when the store has none. Empty: nuget.org (needs a version).</summary>
    public string? SourceUrl { get; set; }
}

public enum HostDependencyState
{
    /// <summary>Enabled and part of the running API: nothing to do.</summary>
    Running,

    /// <summary>Enabled but not built into the running API yet: needs a restart.</summary>
    EnabledPendingRestart,

    /// <summary>In the module store but disabled: will be enabled.</summary>
    InStore,

    /// <summary>Not in the store: will be downloaded from <c>Source</c> and enabled.</summary>
    WillDownload,

    /// <summary>Not in the store and no way to get it (no version or source given).</summary>
    Unavailable
}

public sealed record HostDependencyPlanItem(string Package, string? Version, HostDependencyState State, string? Source, string? Problem);

/// <summary>What registering a client module would change on the host: shown to the administrator before approval.</summary>
public sealed record RegistrationPlanDto(IReadOnlyList<HostDependencyPlanItem> Dependencies, bool NeedsApproval, bool NeedsRestart, bool Blocked);

/// <summary>A registered client module as the management page sees it.</summary>
public sealed record ModuleRegistrationDto(
    string Id, string Name, string Version, ModuleKind Kind, string Url, string? Sha256, bool Enabled,
    bool LoadOnStartup, bool Hidden, bool RequiresAuth, string? RequiredRole, string? Layout,
    string[] AvailableToRoles, string[] RoutePrefixes, string[] Dependencies, string[] Styles, string[] Scripts,
    ModuleNavItem[] Nav,
    string? PackageId, string? FileName, long? SizeBytes, DateTime? UploadedUtc,
    string[] HostDependencies, bool WaitingForHost, ModuleRouteDto[] Routes);
