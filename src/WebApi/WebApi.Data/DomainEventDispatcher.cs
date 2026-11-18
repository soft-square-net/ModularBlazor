using Microsoft.Extensions.DependencyInjection;
using soft.square.net.WebApi.SharedKernel;

namespace soft.square.net.WebApi.Data;

/// <summary>
/// Hands a domain event to its <see cref="IDomainEventHandler{TEvent}"/>s, resolved from the module's scope. Registered
/// by <see cref="TenantDbServiceCollectionExtensions.AddTenantDbContext{TContext}"/>; a <see cref="TenantDbContext"/>
/// uses it when its constructor receives it.
/// <para>
/// Unload-safe: nothing is cached here or in any static. A cache keyed by event type in this host-shipped assembly would
/// keep the module's assembly alive after unload (the reason the platform does not use MediatR). Handler lookups are
/// cached only by the module's own container, which is disposed with the module.
/// </para>
/// </summary>
public sealed class DomainEventDispatcher(IServiceProvider services)
{
    public async Task DispatchAsync(IDomainEvent domainEvent, CancellationToken cancellationToken = default)
    {
        ArgumentNullException.ThrowIfNull(domainEvent);
        var handlerType = typeof(IDomainEventHandler<>).MakeGenericType(domainEvent.GetType());
        foreach (var handler in services.GetServices(handlerType))
            await ((IDomainEventHandler)handler!).HandleAsync(domainEvent, cancellationToken).ConfigureAwait(false);
    }
}
