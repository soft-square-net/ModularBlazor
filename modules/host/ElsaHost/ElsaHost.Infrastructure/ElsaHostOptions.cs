namespace soft.square.net.ModularBlazor.Host.Modules.ElsaHost.Infrastructure;

/// <summary>Configuration section "ElsaHost".</summary>
public sealed class ElsaHostOptions
{
    public const string SectionName = "ElsaHost";

    /// <summary>Applies Elsa's own migrations at startup (development only; in production run them with dotnet ef).</summary>
    public bool RunMigrations { get; set; }

    /// <summary>Database schema of the Elsa tables.</summary>
    public string Schema { get; set; } = "Elsa";

    /// <summary>Route prefix of the Elsa API (Elsa's default).</summary>
    public string ApiBasePath { get; set; } = "/elsa/api";

    /// <summary>Elsa Studio and other designers call the API with this permission; requests without it get 403.</summary>
    public bool RequirePermissions { get; set; } = true;
}
