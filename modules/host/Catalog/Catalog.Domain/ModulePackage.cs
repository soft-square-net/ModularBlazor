using soft.square.net.Share.All;

namespace soft.square.net.ModularBlazor.Host.Modules.Catalog.Domain;

public enum ModuleTarget
{
    /// <summary>Extends the API: referenced at build time, loaded when the app starts.</summary>
    Host,

    /// <summary>For the Blazor client: stored here and downloaded by the client.</summary>
    Client
}

/// <summary>A module package (.dll / .nupkg) kept in the module store.</summary>
public sealed class ModulePackage
{
    public string Id { get; set; } = Guid.NewGuid().ToString("N");
    public string Name { get; set; } = "";

    /// <summary>The assembly name (dll) or NuGet package id (nupkg).</summary>
    public string PackageId { get; set; } = "";

    public string Version { get; set; } = "1.0.0";
    public ModuleTarget Target { get; set; }
    public ModuleKind Kind { get; set; }
    public string FileName { get; set; } = "";
    public string Sha256 { get; set; } = "";
    public long SizeBytes { get; set; }

    /// <summary>Host packages: included in the next build. Client packages: offered for download.</summary>
    public bool Enabled { get; set; }

    /// <summary>A JSON object injected into configuration as Modules:&lt;Name&gt; (host packages).</summary>
    public string? Configuration { get; set; }

    public DateTime UploadedUtc { get; set; } = DateTime.UtcNow;
    public string? UploadedBy { get; set; }
}
