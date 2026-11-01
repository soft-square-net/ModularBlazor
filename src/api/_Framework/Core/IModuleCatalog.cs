using soft.square.net.ModularBlazor.Abstractions;

namespace soft.square.net.ModularBlazor.Core;

/// <summary>Source of module metadata served to the Blazor client.</summary>
public interface IModuleCatalog
{
    /// <summary>Modules every visitor needs before sign-in (layouts, login page).</summary>
    ModuleManifest GetCoreModules();

    /// <summary>Modules a signed-in user with this role may use.</summary>
    ModuleManifest GetModulesForRole(string role);
}
