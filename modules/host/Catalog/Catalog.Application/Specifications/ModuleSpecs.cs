using Ardalis.Specification;
using soft.square.net.ModularBlazor.Host.Modules.Catalog.Domain;

namespace soft.square.net.ModularBlazor.Host.Modules.Catalog.Application.Specifications;

/// <summary>Modules loaded before sign-in.</summary>
public sealed class CoreModulesSpec : Specification<ModuleRegistration>
{
    public CoreModulesSpec() => Query.Where(m => m.LoadOnStartup).OrderBy(m => m.SortOrder);
}

/// <summary>Modules loaded on navigation. The role filter runs in memory (roles are stored as JSON).</summary>
public sealed class UserModulesSpec : Specification<ModuleRegistration>
{
    public UserModulesSpec() => Query.Where(m => !m.LoadOnStartup).OrderBy(m => m.SortOrder);
}
