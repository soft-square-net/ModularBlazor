using MediatR;
using soft.square.net.ModularBlazor.Core.Abstractions;

namespace soft.square.net.ModularBlazor.Host.Modules.ElsaHost.Application.Queries;

/// <summary>What the embedded Elsa engine looks like to the caller: where its API is and which tenant it will act for.</summary>
public sealed record ElsaInfoDto(string ApiBasePath, string TenantId, string Schema);

public sealed record GetElsaInfoQuery : IRequest<ElsaInfoDto>;

/// <summary>Where the module is mounted and the database schema it uses (supplied by the Infrastructure project).</summary>
public sealed record ElsaHostSettings(string ApiBasePath, string Schema);

public sealed class GetElsaInfoQueryHandler(ICurrentTenant tenant, ElsaHostSettings settings)
    : IRequestHandler<GetElsaInfoQuery, ElsaInfoDto>
{
    public Task<ElsaInfoDto> Handle(GetElsaInfoQuery request, CancellationToken cancellationToken)
        => Task.FromResult(new ElsaInfoDto(settings.ApiBasePath, tenant.Id, settings.Schema));
}
