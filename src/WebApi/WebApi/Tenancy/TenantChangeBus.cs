using System.Text.Json;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;
using soft.square.net.WebApi.Modularity;

namespace soft.square.net.WebApi.Tenancy;

/// <summary>Published after a tenant was written to the tenant store; every replica reloads its directory.</summary>
public sealed record TenantChanged(string TenantId, string Origin, DateTimeOffset At);

internal interface ITenantChangeBus
{
    Task PublishAsync(string tenantId, CancellationToken ct);
}

internal sealed class NullTenantChangeBus : ITenantChangeBus
{
    public Task PublishAsync(string tenantId, CancellationToken ct) => Task.CompletedTask;
}

/// <summary>
/// RabbitMQ fanout exchange "tenants.changed", the same pattern as "modules.state": one exclusive queue per replica,
/// and the message only says "reload" — the tenant store is the source of truth.
/// </summary>
internal sealed class RabbitMqTenantChangeBus(IConnection connection, ILogger<RabbitMqTenantChangeBus> log) : ITenantChangeBus, IAsyncDisposable
{
    public const string Exchange = "tenants.changed";

    private readonly SemaphoreSlim _lock = new(1, 1);
    private IChannel? _channel;

    public static Task DeclareAsync(IChannel channel, CancellationToken ct) =>
        channel.ExchangeDeclareAsync(Exchange, ExchangeType.Fanout, durable: true, autoDelete: false, cancellationToken: ct);

    public async Task PublishAsync(string tenantId, CancellationToken ct)
    {
        await _lock.WaitAsync(ct);
        try
        {
            if (_channel is not { IsOpen: true })
            {
                _channel = await connection.CreateChannelAsync(cancellationToken: ct);
                await DeclareAsync(_channel, ct);
            }
            var properties = new BasicProperties { ContentType = "application/json", MessageId = Guid.NewGuid().ToString("n"), Type = nameof(TenantChanged) };
            await _channel.BasicPublishAsync(Exchange, routingKey: string.Empty, mandatory: false, properties,
                JsonSerializer.SerializeToUtf8Bytes(new TenantChanged(tenantId, ModuleInstance.Id, DateTimeOffset.UtcNow)), ct);
            log.LogInformation("Published change of tenant {Tenant}", tenantId);
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            // Already in the tenant store; the periodic refresh repairs a lost message.
            log.LogWarning(e, "Could not publish the change of tenant {Tenant}", tenantId);
            _channel = null;
        }
        finally { _lock.Release(); }
    }

    public async ValueTask DisposeAsync()
    {
        if (_channel is not null) await _channel.DisposeAsync();
    }
}

internal sealed class TenantChangeSubscriber(IConnection connection, TenantDirectory directory, ILogger<TenantChangeSubscriber> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await using var channel = await connection.CreateChannelAsync(cancellationToken: stoppingToken);
        await RabbitMqTenantChangeBus.DeclareAsync(channel, stoppingToken);
        var queue = await channel.QueueDeclareAsync(queue: string.Empty, durable: false, exclusive: true, autoDelete: true, cancellationToken: stoppingToken);
        await channel.QueueBindAsync(queue.QueueName, RabbitMqTenantChangeBus.Exchange, routingKey: string.Empty, cancellationToken: stoppingToken);

        var consumer = new AsyncEventingBasicConsumer(channel);
        consumer.ReceivedAsync += async (_, message) =>
        {
            TenantChanged? change;
            try { change = JsonSerializer.Deserialize<TenantChanged>(message.Body.Span); }
            catch (JsonException e) { log.LogWarning(e, "Ignored a malformed tenant change message"); return; }
            if (change is null || change.Origin == ModuleInstance.Id) return;

            log.LogInformation("Tenant {Tenant} changed on {Origin}; reloading the directory", change.TenantId, change.Origin);
            try { await directory.ReloadAsync(stoppingToken); }
            catch (Exception e) when (e is not OperationCanceledException) { log.LogError(e, "Reloading the tenant directory failed"); }
        };
        await channel.BasicConsumeAsync(queue.QueueName, autoAck: true, consumer, stoppingToken);

        try { await Task.Delay(Timeout.Infinite, stoppingToken); }
        catch (OperationCanceledException) { }
    }
}
