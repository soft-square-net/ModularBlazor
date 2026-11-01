using System.Reflection;

namespace ModularBlazor.Host.Modules.Catalog;

/// <summary>Lets the host find this module's assembly so Carter can register its slices.</summary>
public static class CatalogModuleInfo
{
    public static Assembly Assembly => typeof(CatalogModuleInfo).Assembly;
}
