namespace soft.square.net.ModularBlazor.Host.Modules.Catalog.Infrastructure.Packages;

/// <summary>Configuration section "ModuleStore".</summary>
public sealed class ModuleStoreOptions
{
    public const string SectionName = "ModuleStore";

    /// <summary>
    /// Folder of the module store, relative to the working directory (the Host project folder when started with
    /// dotnet run): assets/modules/client and assets/modules/host. The Host project imports host/host-modules.props
    /// from here, so keep it under the Host project.
    /// </summary>
    public string Path { get; set; } = "assets/modules";

    /// <summary>
    /// Accepts uploaded packages. Off by default: an uploaded host module runs inside the API after the next build,
    /// so enable it only where that is intended (development, a controlled admin).
    /// </summary>
    public bool AllowUpload { get; set; }

    public int MaxUploadMb { get; set; } = 100;

    public string FullPath => System.IO.Path.GetFullPath(Path);
}
