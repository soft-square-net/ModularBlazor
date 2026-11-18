namespace soft.square.net.WebApi.SharedKernel;

/// <summary>
/// Something that happened inside an aggregate, e.g. <c>record NoteArchived(Guid NoteId) : IDomainEvent</c>.
/// Domain events stay inside one module: their handlers run in the save that raised them. Work outside the module's
/// database (mail, the broker, other modules) belongs in an outbox written by a handler.
/// </summary>
public interface IDomainEvent;

/// <summary>An entity that collects domain events (<see cref="AggregateRoot{TId}"/> does).</summary>
public interface IHasDomainEvents
{
    bool HasDomainEvents { get; }

    /// <summary>Returns the pending events and forgets them. A method, so EF Core never tries to map it.</summary>
    IReadOnlyList<IDomainEvent> TakeDomainEvents();
}

/// <summary>Non-generic view of a handler, so the dispatcher needs neither <c>dynamic</c> nor reflection caches.</summary>
public interface IDomainEventHandler
{
    Task HandleAsync(IDomainEvent domainEvent, CancellationToken cancellationToken);
}

/// <summary>
/// Handles one event type; register it in the module's <c>ConfigureServices</c>:
/// <c>services.AddScoped&lt;IDomainEventHandler&lt;NoteArchived&gt;, CountArchivedNotes&gt;()</c>.
/// <list type="bullet">
/// <item>It runs before the save that raised the event writes anything, in the same scope and DbContext.</item>
/// <item>It changes tracked entities and never saves: that save writes its changes too, all or nothing. Calling
/// SaveChanges, or IRepository Add/Update/Delete (they save at once), from a handler throws.</item>
/// <item>Aggregates it changes may raise more events; they are handled in the next round of the same save.</item>
/// </list>
/// </summary>
public interface IDomainEventHandler<TEvent> : IDomainEventHandler where TEvent : IDomainEvent
{
    Task HandleAsync(TEvent domainEvent, CancellationToken cancellationToken);

    Task IDomainEventHandler.HandleAsync(IDomainEvent domainEvent, CancellationToken cancellationToken) =>
        HandleAsync((TEvent)domainEvent, cancellationToken);
}
