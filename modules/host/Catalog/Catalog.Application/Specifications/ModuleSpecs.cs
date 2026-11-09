using Ardalis.Specification;
using soft.square.net.ModularBlazor.Host.Modules.Catalog.Domain;

namespace soft.square.net.ModularBlazor.Host.Modules.Catalog.Application.Specifications;

/// <summary>Enabled modules loaded before sign-in.</summary>
public sealed class CoreModulesSpec : Specification<ModuleRegistration>
{
    public CoreModulesSpec() => Query.Where(m => m.Enabled && m.LoadOnStartup).OrderBy(m => m.SortOrder);
}

/// <summary>Enabled modules loaded on navigation. The role filter runs in memory (roles are stored as JSON).</summary>
public sealed class UserModulesSpec : Specification<ModuleRegistration>
{
    public UserModulesSpec() => Query.Where(m => m.Enabled && !m.LoadOnStartup).OrderBy(m => m.SortOrder);
}

/// <summary>Every registration, enabled or not (the management page).</summary>
public sealed class AllModulesSpec : Specification<ModuleRegistration>
{
    public AllModulesSpec() => Query.OrderBy(m => m.SortOrder).ThenBy(m => m.Id);
}

public sealed class ModuleByIdSpec : Specification<ModuleRegistration>, ISingleResultSpecification<ModuleRegistration>
{
    public ModuleByIdSpec(string id) => Query.Where(m => m.Id == id);
}
