namespace soft.square.net.WebApi.SharedKernel;

/// <summary>Marks a consistency boundary. Repositories (<see cref="IRepository{T}"/>) exist only for aggregate roots.</summary>
public interface IAggregateRoot;

/// <summary>Base class for entities: identity by id.</summary>
public abstract class EntityBase<TId> where TId : notnull
{
    public TId Id { get; protected set; } = default!;
}

/// <summary>
/// An entity that is the root of an aggregate. It can raise domain events (<see cref="Raise"/>); the module's
/// TenantDbContext hands them to their handlers inside the same SaveChangesAsync, before anything is written.
/// </summary>
public abstract class AggregateRoot<TId> : EntityBase<TId>, IAggregateRoot, IHasDomainEvents where TId : notnull
{
    // A field, never a mapped property: EF Core ignores it.
    private List<IDomainEvent>? _domainEvents;

    /// <summary>Records an event; it is handled when the aggregate is next saved with SaveChangesAsync.</summary>
    protected void Raise(IDomainEvent domainEvent)
    {
        ArgumentNullException.ThrowIfNull(domainEvent);
        (_domainEvents ??= []).Add(domainEvent);
    }

    bool IHasDomainEvents.HasDomainEvents => _domainEvents is { Count: > 0 };

    IReadOnlyList<IDomainEvent> IHasDomainEvents.TakeDomainEvents()
    {
        var taken = _domainEvents ?? [];
        _domainEvents = null;
        return taken;
    }
}

/// <summary>
/// A row that belongs to one tenant. The data layer (TenantDbContext) stamps it on insert, refuses to save it for
/// another tenant and filters every query by it. With a database per tenant this is defence in depth; it also keeps
/// the model ready for tenants pooled in a shared database.
/// </summary>
public interface ITenantOwned
{
    string TenantId { get; set; }
}

/// <summary>A business rule was violated. Endpoints map it to 409 (or 400) problem details.</summary>
public class DomainException(string message) : Exception(message);
