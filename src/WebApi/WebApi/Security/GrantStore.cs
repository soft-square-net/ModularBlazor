using System.Text.Json;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;
using soft.square.net.WebApi.Contracts.Security;
using soft.square.net.WebApi.Contracts.Tenancy;
using soft.square.net.WebApi.Modularity;

namespace soft.square.net.WebApi.Security;

/// <summary>The scoped <see cref="IGrantStore"/> of the current tenant. Every write clears the users' cached rights everywhere.</summary>
internal sealed class GrantStore(ITenantContext tenant, IGrantRepository repository, IGrantChangeBus bus, IHttpContextAccessor http,
    TimeProvider clock) : IGrantStore
{
    private string TenantId => tenant.Required.Id;

    private string? Actor => http.HttpContext?.User.FindFirst(PlatformClaims.Subject)?.Value;

    public Task<IReadOnlyList<AccessGrant>> ListAsync(string? userId = null, string? source = null, CancellationToken ct = default) =>
        repository.ListAsync(TenantId, userId, source, ct);

    public async Task<AccessGrant> AddAsync(NewGrant grant, string source = GrantSources.Standing, CancellationToken ct = default)
    {
        var created = Create(grant, source);
        await repository.AddAsync(created, ct);
        await bus.ChangedAsync(TenantId, [created.UserId], ct);
        return created;
    }

    public async Task<bool> RevokeAsync(Guid id, CancellationToken ct = default)
    {
        if (await repository.RemoveAsync(TenantId, id, ct) is not { } userId) return false;
        await bus.ChangedAsync(TenantId, [userId], ct);
        return true;
    }

    public async Task<int> EndAsync(string userId, string source, DateTimeOffset at, CancellationToken ct = default)
    {
        var ended = await repository.EndAsync(TenantId, userId, source, at, ct);
        if (ended > 0) await bus.ChangedAsync(TenantId, [userId], ct);
        return ended;
    }

    public async Task ReplaceSourceAsync(string source, IReadOnlyCollection<NewGrant> grants, CancellationToken ct = default)
    {
        var users = await repository.ReplaceSourceAsync(TenantId, source, grants.Select(g => Create(g, source)).ToArray(), ct);
        if (users.Count > 0) await bus.ChangedAsync(TenantId, users, ct);
    }

    private AccessGrant Create(NewGrant grant, string source)
    {
        if (string.IsNullOrWhiteSpace(grant.UserId) || string.IsNullOrWhiteSpace(grant.Permission) || string.IsNullOrWhiteSpace(grant.Scope))
            throw new ArgumentException("A grant needs a user, a permission and a scope.");
        if (grant.ValidFrom is { } from && grant.ValidTo is { } to && to <= from)
            throw new ArgumentException("A grant's end must be after its start.");
        if (PlatformPermissions.IsPlatform(grant.Permission) && grant.Permission != PlatformPermissions.GrantsManage)
            throw new ArgumentException($"'{grant.Permission}' is a platform permission; it comes from platform roles, not tenant grants.");
        return new AccessGrant(Guid.NewGuid(), TenantId, grant.UserId, grant.Permission, grant.Scope, grant.ValidFrom, grant.ValidTo,
            source, clock.GetUtcNow(), Actor);
    }
}

/// <summary>Published after grants changed; every replica drops the cached grants of those users.</summary>
public sealed record GrantsChanged(string TenantId, IReadOnlyCollection<string>? UserIds, string Origin, DateTimeOffset At);

internal interface IGrantChangeBus
{
    /// <summary>Drops the users' cached grants here, then tells every other replica to do the same.</summary>
    Task ChangedAsync(string tenantId, IReadOnlyCollection<string>? userIds, CancellationToken ct);
}

internal sealed class LocalGrantChangeBus(GrantCache cache) : IGrantChangeBus
{
    public Task ChangedAsync(string tenantId, IReadOnlyCollection<string>? userIds, CancellationToken ct)
    {
        cache.Invalidate(tenantId, userIds);
        return Task.CompletedTask;
    }
}

/// <summary>RabbitMQ fanout "access.grants.changed": one exclusive queue per replica, like "tenants.changed".</summary>
internal sealed class RabbitMqGrantChangeBus(IConnection connection, GrantCache cache, ILogger<RabbitMqGrantChangeBus> log) : IGrantChangeBus, IAsyncDisposable
{
    public const string Exchange = "access.grants.changed";

    private readonly SemaphoreSlim _lock = new(1, 1);
    private IChannel? _channel;

    public static Task DeclareAsync(IChannel channel, CancellationToken ct) =>
        channel.ExchangeDeclareAsync(Exchange, ExchangeType.Fanout, durable: true, autoDelete: false, cancellationToken: ct);

    public async Task ChangedAsync(string tenantId, IReadOnlyCollection<string>? userIds, CancellationToken ct)
    {
        cache.Invalidate(tenantId, userIds);
        await _lock.WaitAsync(ct);
        try
        {
            if (_channel is not { IsOpen: true })
            {
                _channel = await connection.CreateChannelAsync(cancellationToken: ct);
                await DeclareAsync(_channel, ct);
            }
            var properties = new BasicProperties { ContentType = "application/json", MessageId = Guid.NewGuid().ToString("n"), Type = nameof(GrantsChanged) };
            await _channel.BasicPublishAsync(Exchange, routingKey: string.Empty, mandatory: false, properties,
                JsonSerializer.SerializeToUtf8Bytes(new GrantsChanged(tenantId, userIds, ModuleInstance.Id, DateTimeOffset.UtcNow)), ct);
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            // Stored already; other replicas' caches expire within GrantCache.Lifetime.
            log.LogWarning(e, "Could not publish the grant change of tenant {Tenant}", tenantId);
            _channel = null;
        }
        finally { _lock.Release(); }
    }

    public async ValueTask DisposeAsync()
    {
        if (_channel is not null) await _channel.DisposeAsync();
    }
}

internal sealed class GrantChangeSubscriber(IConnection connection, GrantCache cache, ILogger<GrantChangeSubscriber> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await using var channel = await connection.CreateChannelAsync(cancellationToken: stoppingToken);
        await RabbitMqGrantChangeBus.DeclareAsync(channel, stoppingToken);
        var queue = await channel.QueueDeclareAsync(queue: string.Empty, durable: false, exclusive: true, autoDelete: true, cancellationToken: stoppingToken);
        await channel.QueueBindAsync(queue.QueueName, RabbitMqGrantChangeBus.Exchange, routingKey: string.Empty, cancellationToken: stoppingToken);

        var consumer = new AsyncEventingBasicConsumer(channel);
        consumer.ReceivedAsync += (_, message) =>
        {
            try
            {
                if (JsonSerializer.Deserialize<GrantsChanged>(message.Body.Span) is { } change && change.Origin != ModuleInstance.Id)
                    cache.Invalidate(change.TenantId, change.UserIds);
            }
            catch (JsonException e) { log.LogWarning(e, "Ignored a malformed grant change message"); }
            return Task.CompletedTask;
        };
        await channel.BasicConsumeAsync(queue.QueueName, autoAck: true, consumer, stoppingToken);

        try { await Task.Delay(Timeout.Infinite, stoppingToken); }
        catch (OperationCanceledException) { }
    }
}
