namespace soft.square.net.ModularBlazor.Host.Modules.Catalog.Domain;

/// <summary>A routable page found inside a client module when it was installed (table ModuleRoutes). Owned by the registration.</summary>
public sealed class ModuleRoute
{
    /// <summary>The @page template, e.g. "/reports/{Id:int}".</summary>
    public string Template { get; set; } = "";

    /// <summary>Full name of the page component.</summary>
    public string Component { get; set; } = "";

    /// <summary>Layout key from [UseLayout], if the page picks one.</summary>
    public string? Layout { get; set; }

    /// <summary>The page carries [Authorize].</summary>
    public bool RequiresAuth { get; set; }

    /// <summary>Roles of [Authorize(Roles = ...)].</summary>
    public string[] Roles { get; set; } = [];
}
