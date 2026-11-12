using System.Reflection;
using Microsoft.Extensions.Options;
using soft.square.net.WebApi.Contracts;

namespace soft.square.net.WebApi.Modularity;

/// <summary>
/// Private ASP.NET Core pipelines of modules that implement <see cref="IModulePipeline"/>: one catch-all endpoint
/// <c>/api/{prefix}/{**path}</c> per module that runs a pipeline built from the module's own container.
/// <para>
/// Routing inside the pipeline (<c>UseRouting</c> / <c>UseEndpoints</c>) must stay module-local, or it would pin the
/// module and leak its endpoints into the host's route table:
/// </para>
/// <list type="bullet">
/// <item><c>UseEndpoints</c> adds its data sources to <c>IOptions&lt;RouteOptions&gt;.EndpointDataSources</c>; in the
/// host's options they would join the host's global endpoint list forever. The module gets its own RouteOptions.</item>
/// <item>The host's <c>DfaMatcherFactory</c> resolves the matcher's disposable <c>DataSourceDependentMatcher.Lifetime</c>
/// as a transient from the host root, which keeps it (and the module's endpoints) until the host is disposed. The module
/// gets its own factory and lifetime registration, so they are disposed with the module's container.</item>
/// </list>
/// Both are internal framework types reached by reflection, like <see cref="FrameworkCaches"/>: re-verify after a .NET upgrade.
/// </summary>
internal static class ModulePipelines
{
    private static readonly Assembly Routing = typeof(RouteOptions).Assembly;
    private static readonly Type? MatcherFactory = Routing.GetType("Microsoft.AspNetCore.Routing.Matching.MatcherFactory");
    private static readonly Type? DfaMatcherFactory = Routing.GetType("Microsoft.AspNetCore.Routing.Matching.DfaMatcherFactory");
    private static readonly Type? MatcherLifetime = Routing.GetType("Microsoft.AspNetCore.Routing.Matching.DataSourceDependentMatcher+Lifetime");
    private static readonly PropertyInfo? EndpointDataSources =
        typeof(RouteOptions).GetProperty("EndpointDataSources", BindingFlags.Instance | BindingFlags.NonPublic);

    /// <summary>Module-local routing services for the private pipeline. Called while the module's services are registered.</summary>
    public static void AddPipelineServices(IServiceCollection services, IServiceProvider hostRoot, ILogger log)
    {
        var host = hostRoot.GetRequiredService<IOptions<RouteOptions>>().Value;
        var options = new RouteOptions
        {
            LowercaseUrls = host.LowercaseUrls,
            LowercaseQueryStrings = host.LowercaseQueryStrings,
            AppendTrailingSlash = host.AppendTrailingSlash,
            SuppressCheckForUnhandledSecurityMetadata = host.SuppressCheckForUnhandledSecurityMetadata
        };
        foreach (var (name, type) in host.ConstraintMap) options.ConstraintMap[name] = type;

        if (EndpointDataSources is null || MatcherFactory is null || DfaMatcherFactory is null || MatcherLifetime is null)
        {
            // Pipelines still work; routing inside them would pin the module and leak into the host's route table.
            log.LogWarning("Routing internals changed (RouteOptions.EndpointDataSources / DfaMatcherFactory not found); " +
                           "module pipelines that use UseRouting/UseEndpoints may not unload");
            return;
        }

        EndpointDataSources.SetValue(options, new List<EndpointDataSource>());
        services.AddSingleton<IOptions<RouteOptions>>(Options.Create(options));
        services.AddSingleton(MatcherFactory, sp => Activator.CreateInstance(DfaMatcherFactory, sp)!);
        services.AddTransient(MatcherLifetime);
    }

    /// <summary>Builds the module's pipeline and maps the catch-all endpoint that runs it.</summary>
    /// <param name="group">The module's route group (<c>/api/{prefix}</c>, module metadata already applied).</param>
    /// <param name="pathBase">The group's path, which becomes the pipeline's PathBase.</param>
    public static void Map(IEndpointRouteBuilder group, IModulePipeline pipeline, IServiceProvider moduleRoot, string pathBase, string moduleId)
    {
        var app = new ModuleRouteBuilder(moduleRoot).CreateApplicationBuilder();
        pipeline.ConfigurePipeline(app);
        var next = app.Build(); // a request no middleware handles ends in 404
        var prefix = new PathString(pathBase);

        var endpoint = group.Map("/{**path}", context => InvokeAsync(context, next, prefix))
            .WithDisplayName($"Module {moduleId} pipeline")
            .ExcludeFromDescription();
        pipeline.ConfigureEndpoint(endpoint);
    }

    /// <summary>
    /// Runs the private pipeline like <c>app.Map(prefix, ...)</c>: PathBase gains the prefix, the endpoint and route
    /// values the host matched are cleared so the pipeline's own UseRouting matches again; all of it is restored after.
    /// Same HttpContext: User, Items, features and the module RequestServices scope flow through.
    /// </summary>
    private static async Task InvokeAsync(HttpContext context, RequestDelegate next, PathString prefix)
    {
        var request = context.Request;
        var (pathBase, path, routeValues, endpoint) = (request.PathBase, request.Path, request.RouteValues, context.GetEndpoint());

        if (path.StartsWithSegments(prefix, out var matched, out var remaining))
        {
            request.PathBase = pathBase.Add(matched);
            request.Path = remaining;
        }
        context.SetEndpoint(null);
        request.RouteValues = new RouteValueDictionary();
        try
        {
            await next(context);
        }
        finally
        {
            request.PathBase = pathBase;
            request.Path = path;
            request.RouteValues = routeValues;
            context.SetEndpoint(endpoint);
        }
    }
}
