using Finbuckle.MultiTenant.Abstractions;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;

namespace soft.square.net.ModularBlazor.Infrastructure.MultiTenancy;

public static class TenantStatusMiddleware
{
    /// <summary>Refuses (403) requests of a tenant that is deactivated or whose subscription ended. Add after UseMultiTenant.</summary>
    public static IApplicationBuilder UseTenantStatus(this IApplicationBuilder app)
        => app.Use(async (context, next) =>
        {
            var tenant = context.RequestServices.GetService<IMultiTenantContextAccessor<AppTenantInfo>>()
                ?.MultiTenantContext?.TenantInfo;

            if (tenant is not null)
            {
                var now = context.RequestServices.GetRequiredService<TimeProvider>().GetUtcNow().UtcDateTime;
                if (!tenant.IsValid(now))
                {
                    var reason = tenant.IsActive ? "its subscription has expired" : "it is deactivated";
                    await Results.Problem($"Tenant '{tenant.Identifier}' cannot be used: {reason}.",
                        statusCode: StatusCodes.Status403Forbidden).ExecuteAsync(context);
                    return;
                }
            }

            await next();
        });
}
