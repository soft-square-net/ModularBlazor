using System.Runtime.Loader;
using Microsoft.AspNetCore.Authorization;
using soft.square.net.WebApi.Contracts.Security;

namespace soft.square.net.WebApi.Modularity;

/// <summary>
/// Activation-time rules for a module's endpoint authorization (see the auth design):
/// <list type="bullet">
/// <item>every permission an endpoint requires is declared in the manifest, or is a platform permission;</item>
/// <item>no authorization requirement type from the module's own assemblies: the host's authorization pipeline would
/// hold it (and the module's load context) after unload, and host handlers could not evaluate it anyway;</item>
/// <item>no named policies: the host registers none for modules, so a name would fail at request time.</item>
/// </list>
/// A violation fails activation with 400, before any route goes live.
/// </summary>
internal static class ModuleAuthorization
{
    public static void Validate(string moduleId, IReadOnlySet<string> declared, IEnumerable<Endpoint> endpoints, AssemblyLoadContext moduleContext)
    {
        var problems = new List<string>();
        foreach (var endpoint in endpoints)
        {
            var name = endpoint is RouteEndpoint route ? route.RoutePattern.RawText : endpoint.DisplayName;

            foreach (var data in endpoint.Metadata.GetOrderedMetadata<IAuthorizeData>())
                if (!string.IsNullOrEmpty(data.Policy))
                    problems.Add($"{name}: named policy '{data.Policy}' (use RequirePermission instead)");

            foreach (var policy in endpoint.Metadata.GetOrderedMetadata<AuthorizationPolicy>())
            foreach (var requirement in policy.Requirements)
            {
                if (AssemblyLoadContext.GetLoadContext(requirement.GetType().Assembly) == moduleContext)
                    problems.Add($"{name}: authorization requirement type {requirement.GetType().Name} is defined by the module");
                else if (requirement is PermissionRequirement permissions)
                    problems.AddRange(permissions.AnyOf
                        .Where(p => !declared.Contains(p) && !PlatformPermissions.IsPlatform(p))
                        .Select(p => $"{name}: permission '{p}' is not declared in the manifest"));
            }
        }

        if (problems.Count > 0)
            throw new ModuleException($"Module '{moduleId}' cannot be activated: {string.Join("; ", problems.Distinct())}.");
    }
}
