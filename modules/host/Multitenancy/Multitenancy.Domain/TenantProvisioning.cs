using soft.square.net.ModularBlazor.Core.Domain;

namespace soft.square.net.ModularBlazor.Host.Modules.Multitenancy.Domain;

public enum ProvisioningStatus
{
    Pending,
    Running,
    Completed,
    Failed
}

/// <summary>Raised when a tenant's database provisioning ends (successfully or not).</summary>
public sealed record TenantProvisionedEvent(
    Guid EventId, DateTimeOffset OccurredOnUtc, string ProvisionedTenantId, bool Succeeded, string? Error)
    : DomainEvent(EventId, OccurredOnUtc);

/// <summary>
/// The record of creating and migrating/seeding one tenant's database. Lives in the default (platform)
/// database, not in the tenant's. Aggregate root of the Multitenancy module.
/// </summary>
public sealed class TenantProvisioning : AuditableAggregateRoot<Guid>
{
    private const int MaxErrorLength = 2000;

    private TenantProvisioning() { } // EF Core

    public string TenantId { get; private set; } = "";
    public ProvisioningStatus Status { get; private set; }
    public int Attempts { get; private set; }
    public string? Error { get; private set; }
    public DateTime? StartedUtc { get; private set; }
    public DateTime? CompletedUtc { get; private set; }

    public static TenantProvisioning Create(string tenantId)
    {
        ArgumentException.ThrowIfNullOrWhiteSpace(tenantId);
        return new TenantProvisioning { Id = Guid.NewGuid(), TenantId = tenantId, Status = ProvisioningStatus.Pending };
    }

    public void Start(DateTime utcNow)
    {
        if (Status == ProvisioningStatus.Running)
            throw new InvalidOperationException("Provisioning is already running.");
        if (Status == ProvisioningStatus.Completed)
            throw new InvalidOperationException("Provisioning already completed.");

        Status = ProvisioningStatus.Running;
        Attempts++;
        StartedUtc = utcNow;
        CompletedUtc = null;
        Error = null;
    }

    public void Complete(DateTime utcNow)
    {
        Status = ProvisioningStatus.Completed;
        CompletedUtc = utcNow;
        Error = null;
        AddDomainEvent(DomainEvent.Create(
            (id, at) => new TenantProvisionedEvent(id, at, TenantId, true, null)));
    }

    public void Fail(string error, DateTime utcNow)
    {
        Status = ProvisioningStatus.Failed;
        CompletedUtc = utcNow;
        Error = error.Length > MaxErrorLength ? error[..MaxErrorLength] : error;
        AddDomainEvent(DomainEvent.Create(
            (id, at) => new TenantProvisionedEvent(id, at, TenantId, false, Error)));
    }
}
