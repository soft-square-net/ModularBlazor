using MediatR;
using soft.square.net.ModularBlazor.Abstractions;
using soft.square.net.ModularBlazor.Core.Persistence;
using soft.square.net.ModularBlazor.Host.Modules.Catalog.Application.Specifications;
using soft.square.net.ModularBlazor.Host.Modules.Catalog.Domain;

namespace soft.square.net.ModularBlazor.Host.Modules.Catalog.Application.Queries.GetCoreModules;

/// <summary>Modules every visitor needs before sign-in (layouts, login page).</summary>
public sealed record GetCoreModulesQuery : IRequest<ModuleManifest>;

public sealed class GetCoreModulesQueryHandler(IReadRepository<ModuleRegistration> modules)
    : IRequestHandler<GetCoreModulesQuery, ModuleManifest>
{
    public async Task<ModuleManifest> Handle(GetCoreModulesQuery request, CancellationToken cancellationToken)
        => (await modules.ListAsync(new CoreModulesSpec(), cancellationToken)).ToManifest();
}
