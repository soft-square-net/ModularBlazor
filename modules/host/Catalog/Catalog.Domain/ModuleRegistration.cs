// using soft.square.net.ModularBlazor.Abstractions;
using soft.square.net.ModularBlazor.Core.Domain;
using soft.square.net.Share.All;

namespace soft.square.net.ModularBlazor.Host.Modules.Catalog.Domain;

/// <summary>
/// A client module (.dll / .nupkg) the Blazor client may download, with what it needs to know before
/// loading it. Aggregate root of the Catalog module.
/// </summary>
public sealed class ModuleRegistration : AuditableAggregateRoot<string>
{
    private ModuleRegistration() { } // EF Core

    public ModuleRegistration(string id, string name, string version, ModuleKind kind, string url)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(id);
        ArgumentException.ThrowIfNullOrWhiteSpace(url);

        Id = id;
        Name = name;
        Version = version;
        Kind = kind;
        Url = url;
    }

    public string Name { get; private set; } = "";
    public string Version { get; private set; } = "1.0.0";
    public ModuleKind Kind { get; private set; }
    public string Url { get; private set; } = "";

    /// <summary>Optional hex SHA-256 of the file the client downloads.</summary>
    public string? Sha256 { get; set; }

    /// <summary>True: part of the core set loaded before sign-in. False: a user module, loaded on navigation.</summary>
    public bool LoadOnStartup { get; set; }

    public bool Hidden { get; set; }
    public bool RequiresAuth { get; set; }
    public string? RequiredRole { get; set; }
    public string? Layout { get; set; }

    /// <summary>Roles a user module is offered to. Empty: every signed-in user.</summary>
    public string[] AvailableToRoles { get; set; } = [];

    public string[] RoutePrefixes { get; set; } = [];
    public string[] Dependencies { get; set; } = [];
    public string[] ExtraAssemblies { get; set; } = [];
    public string[] Styles { get; set; } = [];
    public ModuleNavItem[] Nav { get; set; } = [];

    /// <summary>Position in the manifest (menu order follows Nav.Order).</summary>
    public int SortOrder { get; set; }

    /// <summary>Unrestricted modules are open to everyone; otherwise any one matching role is enough.</summary>
    public bool IsAvailableTo(IEnumerable<string> roles)
        => AvailableToRoles.Length == 0
           || roles.Any(r => AvailableToRoles.Contains(r, StringComparer.OrdinalIgnoreCase));
}
