using Microsoft.AspNetCore.Builder;

namespace soft.square.net.WebApi.Contracts;

/// <summary>
/// Optional, implemented by a module's <see cref="IRuntimeModule"/> class: the module gets a private ASP.NET Core
/// pipeline behind a catch-all route under its prefix, <c>/api/{RoutePrefix}/{**path}</c>. Use it to host a library
/// that wires itself with middleware and its own endpoints (<c>app.UseXyz()</c>, <c>UseRouting</c>/<c>UseEndpoints</c>)
/// instead of Carter modules.
/// <list type="bullet">
/// <item>Built once per loaded copy, on Api pools, from the module's services (<c>app.ApplicationServices</c> is the
/// module's container, which falls back to the host).</item>
/// <item>Runs like <c>app.Map("/api/{RoutePrefix}", ...)</c>: <c>Request.PathBase</c> ends with the prefix and
/// <c>Request.Path</c> is the rest, so routes inside the pipeline are relative ("/hello" serves /api/{prefix}/hello).</item>
/// <item>Runs after the host's middleware for the same <c>HttpContext</c>: tenant resolution, authentication
/// (<c>HttpContext.User</c>) and authorization of the catch-all endpoint have already happened.
/// <c>RequestServices</c> is a module scope.</item>
/// <item>The module's Carter routes, if any, are more specific and win over the catch-all.</item>
/// </list>
/// </summary>
public interface IModulePipeline
{
    /// <summary>Adds the module's middleware and endpoints to its private pipeline.</summary>
    void ConfigurePipeline(IApplicationBuilder app);

    /// <summary>
    /// Conventions for the host-side catch-all endpoint, e.g. <c>.TenantOptional()</c> or <c>.RequireAuthorization()</c>.
    /// They apply to every request the pipeline serves.
    /// </summary>
    void ConfigureEndpoint(IEndpointConventionBuilder endpoint) { }
}
