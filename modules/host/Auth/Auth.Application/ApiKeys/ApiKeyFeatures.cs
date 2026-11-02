using FluentValidation;
using MediatR;
using soft.square.net.ModularBlazor.Core.Abstractions;
using soft.square.net.ModularBlazor.Core.Exceptions;
using soft.square.net.ModularBlazor.Core.Pagination;
using soft.square.net.ModularBlazor.Core.Persistence;
using soft.square.net.ModularBlazor.Core.Specifications;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Application.Common;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Application.Common.Specifications;
using soft.square.net.ModularBlazor.Host.Modules.Auth.Domain;

namespace soft.square.net.ModularBlazor.Host.Modules.Auth.Application.ApiKeys;

public static class ApiKeyFormat
{
    public const string Prefix = "mbk_";
}

/// <summary>Creates a key owned by the signed-in user. The key is returned once and never stored.</summary>
public sealed record CreateApiKeyCommand(string Name, DateTime? ExpiresUtc = null) : IRequest<CreatedApiKeyDto>;

public sealed class CreateApiKeyCommandValidator : AbstractValidator<CreateApiKeyCommand>
{
    public CreateApiKeyCommandValidator(TimeProvider clock)
    {
        RuleFor(c => c.Name).NotEmpty().MaximumLength(100);
        RuleFor(c => c.ExpiresUtc).Must(d => d is null || d > clock.GetUtcNow().UtcDateTime)
            .WithMessage("The expiry must be in the future.");
    }
}

public sealed class CreateApiKeyCommandHandler(IRepository<ApiKey> keys, ICurrentUser currentUser)
    : IRequestHandler<CreateApiKeyCommand, CreatedApiKeyDto>
{
    public async Task<CreatedApiKeyDto> Handle(CreateApiKeyCommand c, CancellationToken cancellationToken)
    {
        if (!Guid.TryParse(currentUser.UserId, out var ownerId))
            throw new CustomException("Not signed in.", System.Net.HttpStatusCode.Unauthorized);

        var key = ApiKeyFormat.Prefix + Hashing.NewSecret();
        var entity = ApiKey.Create(c.Name, key[..8], Hashing.Sha256Hex(key), ownerId, c.ExpiresUtc);
        await keys.AddAsync(entity, cancellationToken);

        return new CreatedApiKeyDto(entity.ToDto(), key);
    }
}

public sealed record SearchApiKeysQuery(PaginationFilter Filter) : IRequest<PagedResponse<ApiKeyDto>>;

public sealed class SearchApiKeysQueryHandler(IReadRepository<ApiKey> keys)
    : IRequestHandler<SearchApiKeysQuery, PagedResponse<ApiKeyDto>>
{
    public Task<PagedResponse<ApiKeyDto>> Handle(SearchApiKeysQuery q, CancellationToken cancellationToken)
    {
        var filter = q.Filter.RestrictTo(ApiKeysByPaginationFilterSpec.Fields);
        return keys.PaginatedListAsync(new ApiKeysByPaginationFilterSpec(filter), filter, cancellationToken);
    }
}

public sealed record RevokeApiKeyCommand(Guid Id) : IRequest;

public sealed class RevokeApiKeyCommandHandler(IRepository<ApiKey> keys, TimeProvider clock) : IRequestHandler<RevokeApiKeyCommand>
{
    public async Task Handle(RevokeApiKeyCommand c, CancellationToken cancellationToken)
    {
        var key = await keys.FirstOrDefaultAsync(new ApiKeyByIdSpec(c.Id), cancellationToken)
                  ?? throw new NotFoundException($"API key '{c.Id}' was not found.");

        key.Revoke(clock.GetUtcNow().UtcDateTime);
        await keys.SaveChangesAsync(cancellationToken);
    }
}
