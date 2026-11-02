using MediatR;

namespace soft.square.net.ModularBlazor.Core.Domain;

/// <summary>An event raised by an entity. Published through MediatR (INotification) after the changes are saved.</summary>
public interface IDomainEvent : INotification
{
    Guid EventId { get; }
    DateTimeOffset OccurredOnUtc { get; }
    string? CorrelationId { get; }
    string? TenantId { get; }
}

/// <summary>Implemented by entities that raise domain events (BaseEntity does).</summary>
public interface IHasDomainEvents
{
    IReadOnlyCollection<IDomainEvent> DomainEvents { get; }
    void ClearDomainEvents();
}

/// <summary>Base record for domain events. Derive a positional record and create it with <see cref="Create{T}"/>.</summary>
public abstract record DomainEvent(
    Guid EventId,
    DateTimeOffset OccurredOnUtc,
    string? CorrelationId = null,
    string? TenantId = null) : IDomainEvent
{
    /// <summary>Creates an event with a new id and the current UTC time.</summary>
    public static T Create<T>(Func<Guid, DateTimeOffset, T> factory) where T : DomainEvent
    {
        ArgumentNullException.ThrowIfNull(factory);
        return factory(Guid.NewGuid(), DateTimeOffset.UtcNow);
    }
}
