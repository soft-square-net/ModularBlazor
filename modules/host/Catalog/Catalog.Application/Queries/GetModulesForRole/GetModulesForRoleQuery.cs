using FluentValidation;
using MediatR;
using soft.square.net.Share.All;
using soft.square.net.ModularBlazor.Core.Persistence;
using soft.square.net.ModularBlazor.Host.Modules.Catalog.Application.Specifications;
using soft.square.net.ModularBlazor.Host.Modules.Catalog.Domain;

namespace soft.square.net.ModularBlazor.Host.Modules.Catalog.Application.Queries.GetModulesForRole;

/// <summary>Metadata of the modules a signed-in user with these roles may use.</summary>
public sealed record GetModulesForRoleQuery(string[] Roles) : IRequest<ModuleManifest>;

public sealed class GetModulesForRoleQueryValidator : AbstractValidator<GetModulesForRoleQuery>
{
    public GetModulesForRoleQueryValidator() => RuleFor(q => q.Roles).NotNull();
}

public sealed class GetModulesForRoleQueryHandler(IReadRepository<ModuleRegistration> modules)
    : IRequestHandler<GetModulesForRoleQuery, ModuleManifest>
{
    public async Task<ModuleManifest> Handle(GetModulesForRoleQuery request, CancellationToken cancellationToken)
    {
        var all = await modules.ListAsync(new UserModulesSpec(), cancellationToken);
        return all.Where(m => m.IsAvailableTo(request.Roles)).ToManifest();
    }
}
