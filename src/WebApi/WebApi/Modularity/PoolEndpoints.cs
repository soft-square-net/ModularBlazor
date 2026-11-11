using Carter;
using Microsoft.Extensions.Options;

namespace soft.square.net.WebApi.Modularity;

/// <summary>Which pool and instance answered: shows gateway routing and replica load balancing.</summary>
public sealed class PoolEndpoints : ICarterModule
{
    public void AddRoutes(IEndpointRouteBuilder app)
    {
        app.MapGet("/api/pool", (IOptions<ModuleRuntimeOptions> options, IConfiguration configuration) => new
            {
                options.Value.Pool,
                Role = options.Value.Role.ToString(),
                EnabledModules = options.Value.Enabled.Length == 0 ? ["*"] : options.Value.Enabled,
                Instance = ModuleInstance.Id,
                // Names only, never the values: which infrastructure this instance was wired to.
                Connections = configuration.GetSection("ConnectionStrings").GetChildren().Select(c => c.Key).Order().ToArray()
            })
            .WithTags("Pool");
    }
}
