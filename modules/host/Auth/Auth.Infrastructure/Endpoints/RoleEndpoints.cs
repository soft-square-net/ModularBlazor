using MediatR;
using soft.square.net.ModularBlazor.Core.Authorization;
using soft.square.net.ModularBlazor.Core.Pagination;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Application.Common;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Application.Roles;
using soft.square.net.ModularBlazor.Infrastructure.Security;

namespace soft.square.net.ModularBlazor.Host.Modules.Auth.Infrastructure.Endpoints;

public sealed record UpdateRoleRequest(string Name, string? Description);
public sealed record SetPermissionsRequest(string[] Permissions);

/// <summary>Role and permission management: /api/v1/identity/roles and /permissions.</summary>
public sealed class RoleEndpoints : ICarterModule
{
    public void AddRoutes(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup($"{IdentityRoutes.Base}/roles").WithTags("Roles");

        group.MapGet("/", async ([AsParameters] PaginationFilter filter, ISender sender, CancellationToken ct)
                => Results.Ok(await sender.Send(new SearchRolesQuery(filter), ct)))
            .RequirePermission(Permissions.Roles.View)
            .WithName("SearchRoles").WithSummary("Page through roles")
            .Produces<PagedResponse<RoleDto>>();

        group.MapGet("/{id:guid}", async (Guid id, ISender sender, CancellationToken ct)
                => Results.Ok(await sender.Send(new GetRoleQuery(id), ct)))
            .RequirePermission(Permissions.Roles.View)
            .WithName("GetRole").WithSummary("A role with its permissions")
            .Produces<RoleDetailDto>().ProducesProblem(StatusCodes.Status404NotFound);

        group.MapPost("/", async (CreateRoleCommand command, ISender sender, CancellationToken ct)
                => Results.Ok(await sender.Send(command, ct)))
            .RequirePermission(Permissions.Roles.Create)
            .WithName("CreateRole").WithSummary("Create a role")
            .Produces<RoleDetailDto>().ProducesValidationProblem();

        group.MapPut("/{id:guid}", async (Guid id, UpdateRoleRequest request, ISender sender, CancellationToken ct)
                => Results.Ok(await sender.Send(new UpdateRoleCommand(id, request.Name, request.Description), ct)))
            .RequirePermission(Permissions.Roles.Update)
            .WithName("UpdateRole").WithSummary("Rename a role / change its description")
            .Produces<RoleDetailDto>().ProducesValidationProblem();

        group.MapDelete("/{id:guid}", async (Guid id, ISender sender, CancellationToken ct) =>
            {
                await sender.Send(new DeleteRoleCommand(id), ct);
                return Results.NoContent();
            })
            .RequirePermission(Permissions.Roles.Delete)
            .WithName("DeleteRole").WithSummary("Delete a role (not a system role, not one in use)")
            .Produces(StatusCodes.Status204NoContent);

        group.MapGet("/{id:guid}/permissions", async (Guid id, ISender sender, CancellationToken ct)
                => Results.Ok((await sender.Send(new GetRoleQuery(id), ct)).Permissions))
            .RequirePermission(Permissions.Roles.View)
            .WithName("GetRolePermissions").WithSummary("The permissions of a role")
            .Produces<IReadOnlyList<string>>();

        group.MapPut("/{id:guid}/permissions", async (Guid id, SetPermissionsRequest request, ISender sender, CancellationToken ct)
                => Results.Ok(await sender.Send(new SetRolePermissionsCommand(id, request.Permissions), ct)))
            .RequirePermission(Permissions.Roles.Update)
            .WithName("SetRolePermissions").WithSummary("Set a role's permissions (replaces the current ones)")
            .Produces<RoleDetailDto>().ProducesValidationProblem();

        app.MapGet($"{IdentityRoutes.Base}/permissions", async (ISender sender, CancellationToken ct)
                => Results.Ok(await sender.Send(new GetPermissionsQuery(), ct)))
            .RequirePermission(Permissions.Roles.View)
            .WithTags("Roles").WithName("GetPermissions").WithSummary("Every permission a role can be granted")
            .Produces<IReadOnlyList<string>>();
    }
}
