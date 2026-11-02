using System.ComponentModel.DataAnnotations.Schema;

namespace soft.square.net.ModularBlazor.Core.Domain;

/// <summary>Base class for entities: an id and the domain events the entity raised.</summary>
public abstract class BaseEntity<TId> : IEntity<TId>, IHasDomainEvents where TId : notnull
{
    private readonly List<IDomainEvent> _domainEvents = [];

    public TId Id { get; protected set; } = default!;

    [NotMapped]
    public IReadOnlyCollection<IDomainEvent> DomainEvents => _domainEvents.AsReadOnly();

    protected void AddDomainEvent(IDomainEvent domainEvent) => _domainEvents.Add(domainEvent);

    public void ClearDomainEvents() => _domainEvents.Clear();
}

/// <summary>Consistency boundary. Repositories (IRepository&lt;T&gt;) exist only for aggregate roots.</summary>
public abstract class AggregateRoot<TId> : BaseEntity<TId>, IAggregateRoot where TId : notnull;

/// <summary>An aggregate root with audit fields (filled on save) and soft delete (deleting marks the row instead).</summary>
public abstract class AuditableAggregateRoot<TId> : AggregateRoot<TId>, IAuditableEntity, ISoftDeletable
    where TId : notnull
{
    public DateTime CreatedOnUtc { get; private set; }
    public string? CreatedBy { get; private set; }
    public DateTime? LastModifiedOnUtc { get; private set; }
    public string? LastModifiedBy { get; private set; }

    public bool IsDeleted { get; private set; }
    public DateTime? DeletedOnUtc { get; private set; }
    public string? DeletedBy { get; private set; }

    void IAuditableEntity.MarkCreated(DateTime atUtc, string? by)
    {
        CreatedOnUtc = atUtc;
        CreatedBy = by;
    }

    void IAuditableEntity.MarkModified(DateTime atUtc, string? by)
    {
        LastModifiedOnUtc = atUtc;
        LastModifiedBy = by;
    }

    void ISoftDeletable.MarkDeleted(DateTime atUtc, string? by)
    {
        IsDeleted = true;
        DeletedOnUtc = atUtc;
        DeletedBy = by;
    }
}

/// <summary>Filled by the persistence layer when the entity is saved.</summary>
public interface IAuditableEntity
{
    DateTime CreatedOnUtc { get; }
    string? CreatedBy { get; }
    DateTime? LastModifiedOnUtc { get; }
    string? LastModifiedBy { get; }

    void MarkCreated(DateTime atUtc, string? by);
    void MarkModified(DateTime atUtc, string? by);
}

/// <summary>Deleting such an entity sets IsDeleted instead of removing the row; queries hide deleted rows.</summary>
public interface ISoftDeletable
{
    bool IsDeleted { get; }
    DateTime? DeletedOnUtc { get; }
    string? DeletedBy { get; }

    void MarkDeleted(DateTime atUtc, string? by);
}

/// <summary>Value object: equal when all its components are equal.</summary>
public abstract class ValueObject : IEquatable<ValueObject>
{
    protected abstract IEnumerable<object?> GetEqualityComponents();

    public bool Equals(ValueObject? other)
        => other is not null && GetType() == other.GetType()
           && GetEqualityComponents().SequenceEqual(other.GetEqualityComponents());

    public override bool Equals(object? obj) => obj is ValueObject other && Equals(other);

    public override int GetHashCode()
        => GetEqualityComponents().Aggregate(0, (hash, c) => HashCode.Combine(hash, c));

    public static bool operator ==(ValueObject? left, ValueObject? right) => Equals(left, right);
    public static bool operator !=(ValueObject? left, ValueObject? right) => !Equals(left, right);
}
