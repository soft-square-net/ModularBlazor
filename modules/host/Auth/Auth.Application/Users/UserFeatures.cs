using FluentValidation;
using MediatR;
using soft.square.net.ModularBlazor.Core.Abstractions;
using soft.square.net.ModularBlazor.Core.Authorization;
using soft.square.net.ModularBlazor.Core.Exceptions;
using soft.square.net.ModularBlazor.Core.Pagination;
using soft.square.net.ModularBlazor.Core.Persistence;
using soft.square.net.ModularBlazor.Core.Specifications;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Application.Common;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Application.Common.Specifications;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Domain;

namespace soft.square.net.ModularBlazor.Host.Modules.Auth.Application.Users;

public static class PasswordRules
{
    /// <summary>At least 8 characters with an upper-case letter, a lower-case letter, a digit and a symbol.</summary>
    public static IRuleBuilderOptions<T, string> MustBeStrong<T>(this IRuleBuilder<T, string> rule)
        => rule.NotEmpty().MinimumLength(8).MaximumLength(128)
            .Matches("[A-Z]").WithMessage("Use at least one upper-case letter.")
            .Matches("[a-z]").WithMessage("Use at least one lower-case letter.")
            .Matches("[0-9]").WithMessage("Use at least one digit.")
            .Matches("[^a-zA-Z0-9]").WithMessage("Use at least one symbol.");
}

/// <summary>Loads a user's roles and builds the detail DTO.</summary>
public sealed class UserDetails(UserAccessResolver access)
{
    public async Task<UserDetailDto> BuildAsync(User user, CancellationToken cancellationToken)
    {
        var (roles, _) = await access.ResolveAsync(user, cancellationToken);
        return new UserDetailDto(user.ToDto(), roles);
    }
}

// ---- create ----

public sealed record CreateUserCommand(
    string UserName, string Email, string Password, string? FirstName = null, string? LastName = null,
    string[]? Roles = null) : IRequest<UserDetailDto>;

public sealed class CreateUserCommandValidator : AbstractValidator<CreateUserCommand>
{
    public CreateUserCommandValidator()
    {
        RuleFor(c => c.UserName).NotEmpty().MaximumLength(100).Matches("^[a-zA-Z0-9._@-]+$")
            .WithMessage("Use letters, digits and . _ @ - only.");
        RuleFor(c => c.Email).NotEmpty().EmailAddress().MaximumLength(256);
        RuleFor(c => c.Password).MustBeStrong();
        RuleFor(c => c.FirstName).MaximumLength(100);
        RuleFor(c => c.LastName).MaximumLength(100);
    }
}

public sealed class CreateUserCommandHandler(
    IRepository<User> users, IReadRepository<Role> roles, IPasswordService passwords, UserDetails details)
    : IRequestHandler<CreateUserCommand, UserDetailDto>
{
    public async Task<UserDetailDto> Handle(CreateUserCommand c, CancellationToken cancellationToken)
    {
        if (await users.AnyAsync(new UserByUserNameOrEmailSpec(c.UserName, c.Email), cancellationToken))
            throw new ConflictException("A user with this user name or email already exists.");

        var roleNames = c.Roles is { Length: > 0 } ? c.Roles : [RoleNames.Basic];
        var found = await roles.ListAsync(new RolesByNamesSpec(roleNames), cancellationToken);
        var missing = roleNames.Where(n => found.All(r => r.NormalizedName != Role.Normalize(n))).ToList();
        if (missing.Count > 0)
            throw new NotFoundException($"Unknown role(s): {string.Join(", ", missing)}.");

        var user = User.Create(c.UserName, c.Email, passwords.Hash(c.Password), c.FirstName, c.LastName);
        user.SetRoles(found.Select(r => r.Id));
        await users.AddAsync(user, cancellationToken);

        return await details.BuildAsync(user, cancellationToken);
    }
}

// ---- update ----

public sealed record UpdateUserCommand(Guid Id, string Email, string? FirstName, string? LastName) : IRequest<UserDetailDto>;

public sealed class UpdateUserCommandValidator : AbstractValidator<UpdateUserCommand>
{
    public UpdateUserCommandValidator()
    {
        RuleFor(c => c.Email).NotEmpty().EmailAddress().MaximumLength(256);
        RuleFor(c => c.FirstName).MaximumLength(100);
        RuleFor(c => c.LastName).MaximumLength(100);
    }
}

public sealed class UpdateUserCommandHandler(IRepository<User> users, UserDetails details)
    : IRequestHandler<UpdateUserCommand, UserDetailDto>
{
    public async Task<UserDetailDto> Handle(UpdateUserCommand c, CancellationToken cancellationToken)
    {
        var user = await users.FirstOrDefaultAsync(new UserWithRolesSpec(c.Id), cancellationToken)
                   ?? throw new NotFoundException($"User '{c.Id}' was not found.");

        var other = await users.FirstOrDefaultAsync(new UserByUserNameOrEmailSpec(user.UserName, c.Email), cancellationToken);
        if (other is not null && other.Id != user.Id)
            throw new ConflictException("Another user already has this email.");

        user.UpdateDetails(c.Email, c.FirstName, c.LastName);
        await users.SaveChangesAsync(cancellationToken);
        return await details.BuildAsync(user, cancellationToken);
    }
}

// ---- status, delete ----

public sealed record ToggleUserStatusCommand(Guid Id, bool Activate) : IRequest<UserDto>;

public sealed class ToggleUserStatusCommandHandler(IRepository<User> users, ICurrentUser currentUser)
    : IRequestHandler<ToggleUserStatusCommand, UserDto>
{
    public async Task<UserDto> Handle(ToggleUserStatusCommand c, CancellationToken cancellationToken)
    {
        var user = await users.FirstOrDefaultAsync(new UserWithRolesSpec(c.Id), cancellationToken)
                   ?? throw new NotFoundException($"User '{c.Id}' was not found.");

        if (!c.Activate && user.Id.ToString() == currentUser.UserId)
            throw new ConflictException("You cannot deactivate your own account.");

        if (c.Activate) user.Activate(); else user.Deactivate();
        await users.SaveChangesAsync(cancellationToken);
        return user.ToDto();
    }
}

public sealed record DeleteUserCommand(Guid Id) : IRequest;

/// <summary>Soft delete: the row stays, marked deleted, and the user can no longer sign in.</summary>
public sealed class DeleteUserCommandHandler(IRepository<User> users, ICurrentUser currentUser)
    : IRequestHandler<DeleteUserCommand>
{
    public async Task Handle(DeleteUserCommand c, CancellationToken cancellationToken)
    {
        var user = await users.FirstOrDefaultAsync(new UserWithRolesSpec(c.Id), cancellationToken)
                   ?? throw new NotFoundException($"User '{c.Id}' was not found.");

        if (user.Id.ToString() == currentUser.UserId)
            throw new ConflictException("You cannot delete your own account.");

        await users.DeleteAsync(user, cancellationToken);
    }
}

// ---- roles of a user ----

public sealed record AssignUserRolesCommand(Guid Id, string[] Roles) : IRequest<UserDetailDto>;

public sealed class AssignUserRolesCommandValidator : AbstractValidator<AssignUserRolesCommand>
{
    public AssignUserRolesCommandValidator() => RuleFor(c => c.Roles).NotNull();
}

public sealed class AssignUserRolesCommandHandler(IRepository<User> users, IReadRepository<Role> roles, UserDetails details)
    : IRequestHandler<AssignUserRolesCommand, UserDetailDto>
{
    public async Task<UserDetailDto> Handle(AssignUserRolesCommand c, CancellationToken cancellationToken)
    {
        var user = await users.FirstOrDefaultAsync(new UserWithRolesSpec(c.Id), cancellationToken)
                   ?? throw new NotFoundException($"User '{c.Id}' was not found.");

        var found = await roles.ListAsync(new RolesByNamesSpec(c.Roles), cancellationToken);
        var missing = c.Roles.Where(n => found.All(r => r.NormalizedName != Role.Normalize(n))).ToList();
        if (missing.Count > 0)
            throw new NotFoundException($"Unknown role(s): {string.Join(", ", missing)}.");

        user.SetRoles(found.Select(r => r.Id));
        await users.SaveChangesAsync(cancellationToken);
        return await details.BuildAsync(user, cancellationToken);
    }
}

// ---- passwords ----

/// <summary>The signed-in user changes their own password.</summary>
public sealed record ChangePasswordCommand(string CurrentPassword, string NewPassword) : IRequest;

public sealed class ChangePasswordCommandValidator : AbstractValidator<ChangePasswordCommand>
{
    public ChangePasswordCommandValidator()
    {
        RuleFor(c => c.CurrentPassword).NotEmpty();
        RuleFor(c => c.NewPassword).MustBeStrong().NotEqual(c => c.CurrentPassword)
            .WithMessage("The new password must differ from the current one.");
    }
}

public sealed class ChangePasswordCommandHandler(IRepository<User> users, IPasswordService passwords, ICurrentUser currentUser)
    : IRequestHandler<ChangePasswordCommand>
{
    public async Task Handle(ChangePasswordCommand c, CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(currentUser.UserId, out var id))
            throw new CustomException("Not signed in.", System.Net.HttpStatusCode.Unauthorized);

        var user = await users.FirstOrDefaultAsync(new UserWithRolesSpec(id), cancellationToken)
                   ?? throw new NotFoundException("The user was not found.");

        if (!passwords.Verify(user.PasswordHash, c.CurrentPassword))
            throw new CustomException("The current password is wrong.");

        user.SetPasswordHash(passwords.Hash(c.NewPassword));
        await users.SaveChangesAsync(cancellationToken);
    }
}

/// <summary>An administrator sets another user's password.</summary>
public sealed record ResetPasswordCommand(Guid Id, string NewPassword) : IRequest;

public sealed class ResetPasswordCommandValidator : AbstractValidator<ResetPasswordCommand>
{
    public ResetPasswordCommandValidator() => RuleFor(c => c.NewPassword).MustBeStrong();
}

public sealed class ResetPasswordCommandHandler(IRepository<User> users, IPasswordService passwords)
    : IRequestHandler<ResetPasswordCommand>
{
    public async Task Handle(ResetPasswordCommand c, CancellationToken cancellationToken)
    {
        var user = await users.FirstOrDefaultAsync(new UserWithRolesSpec(c.Id), cancellationToken)
                   ?? throw new NotFoundException($"User '{c.Id}' was not found.");

        user.SetPasswordHash(passwords.Hash(c.NewPassword));
        await users.SaveChangesAsync(cancellationToken);
    }
}

// ---- queries ----

public sealed record SearchUsersQuery(PaginationFilter Filter) : IRequest<PagedResponse<UserDto>>;

public sealed class SearchUsersQueryHandler(IReadRepository<User> users)
    : IRequestHandler<SearchUsersQuery, PagedResponse<UserDto>>
{
    public Task<PagedResponse<UserDto>> Handle(SearchUsersQuery q, CancellationToken cancellationToken)
    {
        var filter = q.Filter.RestrictTo(UsersByPaginationFilterSpec.Fields);
        return users.PaginatedListAsync(new UsersByPaginationFilterSpec(filter), filter, cancellationToken);
    }
}

public sealed record GetUserQuery(Guid Id) : IRequest<UserDetailDto>;

public sealed class GetUserQueryHandler(IReadRepository<User> users, UserDetails details)
    : IRequestHandler<GetUserQuery, UserDetailDto>
{
    public async Task<UserDetailDto> Handle(GetUserQuery q, CancellationToken cancellationToken)
    {
        var user = await users.FirstOrDefaultAsync(new UserWithRolesSpec(q.Id), cancellationToken)
                   ?? throw new NotFoundException($"User '{q.Id}' was not found.");
        return await details.BuildAsync(user, cancellationToken);
    }
}

/// <summary>The signed-in user's own profile.</summary>
public sealed record GetMeQuery : IRequest<UserDetailDto>;

public sealed class GetMeQueryHandler(IReadRepository<User> users, UserDetails details, ICurrentUser currentUser)
    : IRequestHandler<GetMeQuery, UserDetailDto>
{
    public async Task<UserDetailDto> Handle(GetMeQuery q, CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(currentUser.UserId, out var id))
            throw new CustomException("Not signed in.", System.Net.HttpStatusCode.Unauthorized);

        var user = await users.FirstOrDefaultAsync(new UserWithRolesSpec(id), cancellationToken)
                   ?? throw new NotFoundException("The user was not found.");
        return await details.BuildAsync(user, cancellationToken);
    }
}

public sealed record GetUserPermissionsQuery(Guid Id) : IRequest<IReadOnlyList<string>>;

public sealed class GetUserPermissionsQueryHandler(IReadRepository<User> users, UserAccessResolver access)
    : IRequestHandler<GetUserPermissionsQuery, IReadOnlyList<string>>
{
    public async Task<IReadOnlyList<string>> Handle(GetUserPermissionsQuery q, CancellationToken cancellationToken)
    {
        var user = await users.FirstOrDefaultAsync(new UserWithRolesSpec(q.Id), cancellationToken)
                   ?? throw new NotFoundException($"User '{q.Id}' was not found.");
        return (await access.ResolveAsync(user, cancellationToken)).Permissions;
    }
}
