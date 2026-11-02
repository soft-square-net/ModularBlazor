using MediatR;
using soft.square.net.ModularBlazor.Core.Authorization;
using soft.square.net.ModularBlazor.Core.Pagination;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Application.Common;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Application.Users;
using soft.square.net.ModularBlazor.Infrastructure.Security;

namespace soft.square.net.ModularBlazor.Host.Modules.Auth.Infrastructure.Endpoints;

public sealed record UpdateUserRequest(string Email, string? FirstName, string? LastName);
public sealed record ToggleStatusRequest(bool Activate);
public sealed record AssignRolesRequest(string[] Roles);
public sealed record ResetPasswordRequest(string NewPassword);

/// <summary>User management: /api/v1/identity/users.</summary>
public sealed class UserEndpoints : ICarterModule
{
    public void AddRoutes(IEndpointRouteBuilder app)
    {
        var group = app.MapGroup($"{IdentityRoutes.Base}/users").WithTags("Users");

        group.MapPost("/register", async (CreateUserCommand command, ISender sender, CancellationToken ct)
                => Results.Ok(await sender.Send(command, ct)))
            .RequirePermission(Permissions.Users.Create)
            .WithName("RegisterUser").WithSummary("Create a user (default role: basic)")
            .Produces<UserDetailDto>().ProducesValidationProblem();

        group.MapGet("/", async ([AsParameters] PaginationFilter filter, ISender sender, CancellationToken ct)
                => Results.Ok(await sender.Send(new SearchUsersQuery(filter), ct)))
            .RequirePermission(Permissions.Users.View)
            .WithName("SearchUsers").WithSummary("Page through users (keyword, orderBy, pageNumber, pageSize)")
            .Produces<PagedResponse<UserDto>>();

        group.MapGet("/me", async (ISender sender, CancellationToken ct)
                => Results.Ok(await sender.Send(new GetMeQuery(), ct)))
            .RequireAuthorization()
            .WithName("GetMyProfile").WithSummary("The signed-in user's profile and roles")
            .Produces<UserDetailDto>();

        group.MapPost("/me/change-password", async (ChangePasswordCommand command, ISender sender, CancellationToken ct) =>
            {
                await sender.Send(command, ct);
                return Results.NoContent();
            })
            .RequireAuthorization()
            .WithName("ChangeMyPassword").WithSummary("Change the signed-in user's password")
            .Produces(StatusCodes.Status204NoContent).ProducesValidationProblem();

        group.MapGet("/{id:guid}", async (Guid id, ISender sender, CancellationToken ct)
                => Results.Ok(await sender.Send(new GetUserQuery(id), ct)))
            .RequirePermission(Permissions.Users.View)
            .WithName("GetUser").WithSummary("A user with roles")
            .Produces<UserDetailDto>().ProducesProblem(StatusCodes.Status404NotFound);

        group.MapPut("/{id:guid}", async (Guid id, UpdateUserRequest request, ISender sender, CancellationToken ct)
                => Results.Ok(await sender.Send(new UpdateUserCommand(id, request.Email, request.FirstName, request.LastName), ct)))
            .RequirePermission(Permissions.Users.Update)
            .WithName("UpdateUser").WithSummary("Update a user's email and name")
            .Produces<UserDetailDto>().ProducesValidationProblem();

        group.MapPost("/{id:guid}/toggle-status", async (Guid id, ToggleStatusRequest request, ISender sender, CancellationToken ct)
                => Results.Ok(await sender.Send(new ToggleUserStatusCommand(id, request.Activate), ct)))
            .RequirePermission(Permissions.Users.Update)
            .WithName("ToggleUserStatus").WithSummary("Activate or deactivate a user")
            .Produces<UserDto>();

        group.MapDelete("/{id:guid}", async (Guid id, ISender sender, CancellationToken ct) =>
            {
                await sender.Send(new DeleteUserCommand(id), ct);
                return Results.NoContent();
            })
            .RequirePermission(Permissions.Users.Delete)
            .WithName("DeleteUser").WithSummary("Delete a user (soft delete)")
            .Produces(StatusCodes.Status204NoContent);

        group.MapGet("/{id:guid}/roles", async (Guid id, ISender sender, CancellationToken ct)
                => Results.Ok((await sender.Send(new GetUserQuery(id), ct)).Roles))
            .RequirePermission(Permissions.Users.View)
            .WithName("GetUserRoles").WithSummary("The roles of a user")
            .Produces<IReadOnlyList<string>>();

        group.MapPost("/{id:guid}/roles", async (Guid id, AssignRolesRequest request, ISender sender, CancellationToken ct)
                => Results.Ok(await sender.Send(new AssignUserRolesCommand(id, request.Roles), ct)))
            .RequirePermission(Permissions.Users.Update)
            .WithName("AssignUserRoles").WithSummary("Set a user's roles (replaces the current ones)")
            .Produces<UserDetailDto>();

        group.MapGet("/{id:guid}/permissions", async (Guid id, ISender sender, CancellationToken ct)
                => Results.Ok(await sender.Send(new GetUserPermissionsQuery(id), ct)))
            .RequirePermission(Permissions.Users.View)
            .WithName("GetUserPermissions").WithSummary("The permissions a user holds through their roles")
            .Produces<IReadOnlyList<string>>();

        group.MapPost("/{id:guid}/reset-password", async (Guid id, ResetPasswordRequest request, ISender sender, CancellationToken ct) =>
            {
                await sender.Send(new ResetPasswordCommand(id, request.NewPassword), ct);
                return Results.NoContent();
            })
            .RequirePermission(Permissions.Users.Update)
            .WithName("ResetUserPassword").WithSummary("Set another user's password")
            .Produces(StatusCodes.Status204NoContent).ProducesValidationProblem();
    }
}
