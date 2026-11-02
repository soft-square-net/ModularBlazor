using MediatR;
using soft.square.net.ModularBlazor.Core.Pagination;
using soft.square.net.ModularBlazor.Core.Tenancy;
using soft.square.net.ModularBlazor.Host.Modules.Multitenancy.Application;
using soft.square.net.ModularBlazor.Host.Modules.Multitenancy.Application.Commands;
using soft.square.net.ModularBlazor.Host.Modules.Multitenancy.Application.Queries;
using soft.square.net.ModularBlazor.Core.Authorization;
using soft.square.net.ModularBlazor.Infrastructure.Security;

namespace soft.square.net.ModularBlazor.Host.Modules.Multitenancy.Infrastructure.Endpoints;

public sealed record RenewTenantRequest(int Months);

/// <summary>Tenant management: /api/v1/tenants (JWT or API key with the Tenants permissions).</summary>
public sealed class TenantEndpoints : ICarterModule
{
    public void AddRoutes(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup("/api/v1/tenants").WithTags("Tenants");

        group.MapPost("/", async (CreateTenantCommand command, ISender sender, CancellationToken ct)
                => Results.Ok(await sender.Send(command, ct)))
            .WithName("CreateTenant")
            .RequirePermission(Permissions.Tenants.Create)
            .WithSummary("Create a tenant and provision its database")
            .Produces<TenantResult>()
            .ProducesValidationProblem();

        group.MapGet("/", async ([AsParameters] PaginationFilter filter, ISender sender, CancellationToken ct)
                => Results.Ok(await sender.Send(new SearchTenantsQuery(filter), ct)))
            .WithName("SearchTenants")
            .RequirePermission(Permissions.Tenants.View)
            .WithSummary("Page through tenants (keyword, orderBy, pageNumber, pageSize)")
            .Produces<PagedResponse<TenantDto>>();

        group.MapGet("/provisioning", async ([AsParameters] PaginationFilter filter, ISender sender, CancellationToken ct)
                => Results.Ok(await sender.Send(new SearchProvisioningsQuery(filter), ct)))
            .WithName("SearchProvisionings")
            .RequirePermission(Permissions.Tenants.View)
            .WithSummary("Page through tenant provisioning records")
            .Produces<PagedResponse<TenantProvisioningDto>>();

        group.MapGet("/{id}", async (string id, ISender sender, CancellationToken ct)
                => Results.Ok(await sender.Send(new GetTenantQuery(id), ct)))
            .WithName("GetTenant")
            .RequirePermission(Permissions.Tenants.View)
            .WithSummary("Get a tenant")
            .Produces<TenantDto>()
            .ProducesProblem(StatusCodes.Status404NotFound);

        group.MapPost("/{id}/activate", async (string id, ISender sender, CancellationToken ct)
                => Results.Ok(await sender.Send(new ActivateTenantCommand(id), ct)))
            .WithName("ActivateTenant")
            .RequirePermission(Permissions.Tenants.Update)
            .WithSummary("Activate a tenant")
            .Produces<TenantDto>();

        group.MapPost("/{id}/deactivate", async (string id, ISender sender, CancellationToken ct)
                => Results.Ok(await sender.Send(new DeactivateTenantCommand(id), ct)))
            .WithName("DeactivateTenant")
            .RequirePermission(Permissions.Tenants.Update)
            .WithSummary("Deactivate a tenant (not the root tenant)")
            .Produces<TenantDto>();

        group.MapPost("/{id}/upgrade", async (string id, RenewTenantRequest request, ISender sender, CancellationToken ct)
                => Results.Ok(await sender.Send(new RenewTenantCommand(id, request.Months), ct)))
            .WithName("UpgradeTenant")
            .RequirePermission(Permissions.Tenants.Update)
            .WithSummary("Extend a tenant's subscription by whole months")
            .Produces<TenantDto>()
            .ProducesValidationProblem();

        group.MapPost("/{id}/provisioning/retry", async (string id, ISender sender, CancellationToken ct)
                => Results.Ok(await sender.Send(new RetryProvisioningCommand(id), ct)))
            .WithName("RetryTenantProvisioning")
            .RequirePermission(Permissions.Tenants.Update)
            .WithSummary("Retry a failed provisioning")
            .Produces<TenantProvisioningDto>();
    }
}
