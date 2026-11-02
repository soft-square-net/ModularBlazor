using FluentValidation;
using MediatR;
using soft.square.net.ModularBlazor.Core.Authorization;
using soft.square.net.ModularBlazor.Core.Exceptions;
using soft.square.net.ModularBlazor.Core.Pagination;
using soft.square.net.ModularBlazor.Core.Persistence;
using soft.square.net.ModularBlazor.Core.Specifications;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Application.Common;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Application.Common.Specifications;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Domain;

namespace soft.square.net.ModularBlazor.Host.Modules.Auth.Application.Roles;

public sealed record CreateRoleCommand(string Name, string? Description) : IRequest<RoleDetailDto>;

public sealed class CreateRoleCommandValidator : AbstractValidator<CreateRoleCommand>
{
    public CreateRoleCommandValidator()
    {
        RuleFor(c => c.Name).NotEmpty().MaximumLength(100);
        RuleFor(c => c.Description).MaximumLength(500);
    }
}

public sealed class CreateRoleCommandHandler(IRepository<Role> roles) : IRequestHandler<CreateRoleCommand, RoleDetailDto>
{
    public async Task<RoleDetailDto> Handle(CreateRoleCommand c, CancellationToken cancellationToken)
    {
        if (await roles.AnyAsync(new RoleByNameSpec(c.Name), cancellationToken))
            throw new ConflictException($"A role '{c.Name}' already exists.");

        var role = await roles.AddAsync(Role.Create(c.Name, c.Description), cancellationToken);
        return new RoleDetailDto(role.ToDto(), []);
    }
}

public sealed record UpdateRoleCommand(Guid Id, string Name, string? Description) : IRequest<RoleDetailDto>;

public sealed class UpdateRoleCommandValidator : AbstractValidator<UpdateRoleCommand>
{
    public UpdateRoleCommandValidator()
    {
        RuleFor(c => c.Name).NotEmpty().MaximumLength(100);
        RuleFor(c => c.Description).MaximumLength(500);
    }
}

public sealed class UpdateRoleCommandHandler(IRepository<Role> roles) : IRequestHandler<UpdateRoleCommand, RoleDetailDto>
{
    public async Task<RoleDetailDto> Handle(UpdateRoleCommand c, CancellationToken cancellationToken)
    {
        var role = await roles.FirstOrDefaultAsync(new RoleByIdSpec(c.Id), cancellationToken)
                   ?? throw new NotFoundException($"Role '{c.Id}' was not found.");

        var sameName = await roles.FirstOrDefaultAsync(new RoleByNameSpec(c.Name), cancellationToken);
        if (sameName is not null && sameName.Id != role.Id)
            throw new ConflictException($"A role '{c.Name}' already exists.");

        role.Update(c.Name, c.Description);
        await roles.SaveChangesAsync(cancellationToken);
        return new RoleDetailDto(role.ToDto(), role.Permissions.Select(p => p.Permission).ToList());
    }
}

public sealed record DeleteRoleCommand(Guid Id) : IRequest;

/// <summary>Soft delete. System roles, and roles still assigned to users, cannot be deleted.</summary>
public sealed class DeleteRoleCommandHandler(IRepository<Role> roles, IReadRepository<User> users) : IRequestHandler<DeleteRoleCommand>
{
    public async Task Handle(DeleteRoleCommand c, CancellationToken cancellationToken)
    {
        var role = await roles.FirstOrDefaultAsync(new RoleByIdSpec(c.Id), cancellationToken)
                   ?? throw new NotFoundException($"Role '{c.Id}' was not found.");

        role.EnsureDeletable();
        if (await users.AnyAsync(new UsersInRoleSpec(role.Id), cancellationToken))
            throw new ConflictException($"The role '{role.Name}' is still assigned to users.");

        await roles.DeleteAsync(role, cancellationToken);
    }
}

public sealed record SetRolePermissionsCommand(Guid Id, string[] Permissions) : IRequest<RoleDetailDto>;

public sealed class SetRolePermissionsCommandValidator : AbstractValidator<SetRolePermissionsCommand>
{
    public SetRolePermissionsCommandValidator()
    {
        RuleFor(c => c.Permissions).NotNull();
        RuleForEach(c => c.Permissions).Must(p => Core.Authorization.Permissions.All.Contains(p))
            .WithMessage("'{PropertyValue}' is not a known permission.");
    }
}

public sealed class SetRolePermissionsCommandHandler(IRepository<Role> roles)
    : IRequestHandler<SetRolePermissionsCommand, RoleDetailDto>
{
    public async Task<RoleDetailDto> Handle(SetRolePermissionsCommand c, CancellationToken cancellationToken)
    {
        var role = await roles.FirstOrDefaultAsync(new RoleByIdSpec(c.Id), cancellationToken)
                   ?? throw new NotFoundException($"Role '{c.Id}' was not found.");

        // The admin role always holds every permission.
        if (role.NormalizedName == Role.Normalize(RoleNames.Admin))
            throw new ConflictException("The admin role always has every permission.");

        role.SetPermissions(c.Permissions);
        await roles.SaveChangesAsync(cancellationToken);
        return new RoleDetailDto(role.ToDto(), role.Permissions.Select(p => p.Permission).OrderBy(p => p).ToList());
    }
}

public sealed record SearchRolesQuery(PaginationFilter Filter) : IRequest<PagedResponse<RoleDto>>;

public sealed class SearchRolesQueryHandler(IReadRepository<Role> roles)
    : IRequestHandler<SearchRolesQuery, PagedResponse<RoleDto>>
{
    public Task<PagedResponse<RoleDto>> Handle(SearchRolesQuery q, CancellationToken cancellationToken)
    {
        var filter = q.Filter.RestrictTo(RolesByPaginationFilterSpec.Fields);
        return roles.PaginatedListAsync(new RolesByPaginationFilterSpec(filter), filter, cancellationToken);
    }
}

public sealed record GetRoleQuery(Guid Id) : IRequest<RoleDetailDto>;

public sealed class GetRoleQueryHandler(IReadRepository<Role> roles) : IRequestHandler<GetRoleQuery, RoleDetailDto>
{
    public async Task<RoleDetailDto> Handle(GetRoleQuery q, CancellationToken cancellationToken)
    {
        var role = await roles.FirstOrDefaultAsync(new RoleByIdSpec(q.Id), cancellationToken)
                   ?? throw new NotFoundException($"Role '{q.Id}' was not found.");
        return new RoleDetailDto(role.ToDto(), role.Permissions.Select(p => p.Permission).OrderBy(p => p).ToList());
    }
}

/// <summary>Every permission that exists (what a role can be granted).</summary>
public sealed record GetPermissionsQuery : IRequest<IReadOnlyList<string>>;

public sealed class GetPermissionsQueryHandler : IRequestHandler<GetPermissionsQuery, IReadOnlyList<string>>
{
    public Task<IReadOnlyList<string>> Handle(GetPermissionsQuery q, CancellationToken cancellationToken)
        => Task.FromResult(Core.Authorization.Permissions.All);
}
