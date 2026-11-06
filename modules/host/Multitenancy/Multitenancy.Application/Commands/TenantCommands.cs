using FluentValidation;
using MediatR;
using soft.square.net.ModularBlazor.Core;
using soft.square.net.ModularBlazor.Core.Exceptions;
using soft.square.net.ModularBlazor.Core.Persistence;
using soft.square.net.ModularBlazor.Core.Tenancy.Abstractions;
using soft.square.net.ModularBlazor.Host.Modules.Multitenancy.Application.Specifications;
using soft.square.net.ModularBlazor.Host.Modules.Multitenancy.Domain;

namespace soft.square.net.ModularBlazor.Host.Modules.Multitenancy.Application.Commands;

public sealed record TenantResult(TenantDto Tenant, TenantProvisioningDto? Provisioning);

// ---- Create ----

public sealed record CreateTenantCommand(
    string Identifier, string Name, DatabaseProvider Provider, string ConnectionString,
    string? AdminEmail = null, DateTime? ValidUpto = null, string? Issuer = null) : IRequest<TenantResult>;

public sealed class CreateTenantCommandValidator : AbstractValidator<CreateTenantCommand>
{
    public CreateTenantCommandValidator()
    {
        RuleFor(c => c.Identifier).NotEmpty().Matches("^[a-zA-Z0-9][a-zA-Z0-9-]{1,62}$")
            .WithMessage("Use 2-63 letters, digits or hyphens.");
        RuleFor(c => c.Name).NotEmpty().MaximumLength(200);
        RuleFor(c => c.Provider).IsInEnum();
        RuleFor(c => c.ConnectionString).NotEmpty();
        RuleFor(c => c.AdminEmail).EmailAddress().When(c => !string.IsNullOrEmpty(c.AdminEmail));
    }
}

/// <summary>Creates the tenant, then provisions its database (migrate + seed), recording the outcome.</summary>
public sealed class CreateTenantCommandHandler(
    ITenantService tenants, IRepository<TenantProvisioning> provisionings, TenantProvisioningRunner runner)
    : IRequestHandler<CreateTenantCommand, TenantResult>
{
    public async Task<TenantResult> Handle(CreateTenantCommand c, CancellationToken cancellationToken)
    {
        var tenant = await tenants.CreateAsync(
            new CreateTenantRequest(c.Identifier, c.Name, c.Provider, c.ConnectionString, c.AdminEmail, c.ValidUpto, c.Issuer),
            cancellationToken);

        var provisioning = await provisionings.AddAsync(TenantProvisioning.Create(tenant.Id), cancellationToken);
        provisioning = await runner.RunAsync(provisioning, cancellationToken);

        return new TenantResult(tenant, provisioning.ToDto());
    }
}

// ---- Retry provisioning ----

public sealed record RetryProvisioningCommand(string TenantId) : IRequest<TenantProvisioningDto>;

public sealed class RetryProvisioningCommandHandler(
    IRepository<TenantProvisioning> provisionings, TenantProvisioningRunner runner)
    : IRequestHandler<RetryProvisioningCommand, TenantProvisioningDto>
{
    public async Task<TenantProvisioningDto> Handle(RetryProvisioningCommand c, CancellationToken cancellationToken)
    {
        var tenantId = c.TenantId.Trim().ToLowerInvariant();
        var provisioning = await provisionings.FirstOrDefaultAsync(new ProvisioningByTenantSpec(tenantId), cancellationToken)
                           ?? throw new NotFoundException($"No provisioning record for tenant '{c.TenantId}'.");

        if (provisioning.Status is ProvisioningStatus.Running or ProvisioningStatus.Completed)
            throw new ConflictException($"Provisioning is {provisioning.Status}; only a Failed or Pending one can be retried.");

        return (await runner.RunAsync(provisioning, cancellationToken)).ToDto();
    }
}

// ---- Activate / deactivate / renew ----

public sealed record ActivateTenantCommand(string Id) : IRequest<TenantDto>;

public sealed class ActivateTenantCommandHandler(ITenantService tenants) : IRequestHandler<ActivateTenantCommand, TenantDto>
{
    public Task<TenantDto> Handle(ActivateTenantCommand c, CancellationToken cancellationToken)
        => tenants.ActivateAsync(c.Id, cancellationToken);
}

public sealed record DeactivateTenantCommand(string Id) : IRequest<TenantDto>;

public sealed class DeactivateTenantCommandHandler(ITenantService tenants) : IRequestHandler<DeactivateTenantCommand, TenantDto>
{
    public Task<TenantDto> Handle(DeactivateTenantCommand c, CancellationToken cancellationToken)
        => tenants.DeactivateAsync(c.Id, cancellationToken);
}

/// <summary>Extends the tenant's subscription ("upgrade") by whole months.</summary>
public sealed record RenewTenantCommand(string Id, int Months) : IRequest<TenantDto>;

public sealed class RenewTenantCommandValidator : AbstractValidator<RenewTenantCommand>
{
    public RenewTenantCommandValidator() => RuleFor(c => c.Months).InclusiveBetween(1, 120);
}

public sealed class RenewTenantCommandHandler(ITenantService tenants) : IRequestHandler<RenewTenantCommand, TenantDto>
{
    public Task<TenantDto> Handle(RenewTenantCommand c, CancellationToken cancellationToken)
        => tenants.RenewAsync(c.Id, c.Months, cancellationToken);
}
