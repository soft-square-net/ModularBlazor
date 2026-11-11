namespace soft.square.net.WebApi.SharedKernel;

/// <summary>Marks a consistency boundary. Repositories (<see cref="IRepository{T}"/>) exist only for aggregate roots.</summary>
public interface IAggregateRoot;

/// <summary>Base class for entities: identity by id.</summary>
public abstract class EntityBase<TId> where TId : notnull
{
    public TId Id { get; protected set; } = default!;
}

/// <summary>An entity that is the root of an aggregate.</summary>
public abstract class AggregateRoot<TId> : EntityBase<TId>, IAggregateRoot where TId : notnull;

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
