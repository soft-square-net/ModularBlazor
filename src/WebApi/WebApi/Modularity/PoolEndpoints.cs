using Carter;
using Microsoft.Extensions.Options;

namespace soft.square.net.WebApi.Modularity;

/// <summary>Which pool and instance answered: shows gateway routing and replica load balancing.</summary>
public sealed class PoolEndpoints : ICarterModule
{
    public void AddRoutes(IEndpointRouteBuilder app)
    {
        app.MapGet("/api/pool", (IOptions<ModuleRuntimeOptions> options, IConfiguration configuration) => new PoolInfo(
                options.Value.Pool,
                options.Value.Role.ToString(),
                options.Value.Enabled.Length == 0 ? ["*"] : options.Value.Enabled,
                ModuleInstance.Id,
                // Names only, never the values: which infrastructure this instance was wired to.
                configuration.GetSection("ConnectionStrings").GetChildren().Select(c => c.Key).Order().ToArray()))
            .WithTags("Pool")
            .WithName("Pool_Get"); // operation id: PoolClient.GetAsync in the generated host client
    }
}

/// <summary>A named type (not an anonymous one) so the OpenAPI document and the generated client get a schema.</summary>
public sealed record PoolInfo(string Pool, string Role, IReadOnlyList<string> EnabledModules, string Instance, IReadOnlyList<string> Connections);
