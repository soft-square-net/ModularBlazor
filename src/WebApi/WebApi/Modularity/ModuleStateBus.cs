using System.Text.Json;
using RabbitMQ.Client;
using RabbitMQ.Client.Events;

namespace soft.square.net.WebApi.Modularity;

/// <summary>Published after a lifecycle change was written to the shared catalog. Replicas react by re-syncing.</summary>
public sealed record ModuleStateChanged(string ModuleId, string Action, string Pool, string Origin, DateTimeOffset At);

/// <summary>Identity of this process, used as the origin of events and in status responses.</summary>
public static class ModuleInstance
{
    public static string Id { get; } = $"{Environment.MachineName}:{Environment.ProcessId}";
}

internal interface IModuleStateBus
{
    Task PublishAsync(ModuleStateChanged change, CancellationToken ct);
}

/// <summary>Single instance without a broker: nothing to tell.</summary>
internal sealed class NullModuleStateBus : IModuleStateBus
{
    public Task PublishAsync(ModuleStateChanged change, CancellationToken ct) => Task.CompletedTask;
}

/// <summary>
/// RabbitMQ fanout exchange "modules.state": every replica of every pool binds its own exclusive, auto-delete queue,
/// so each one receives every change. The message only says "the catalog changed" — the catalog is the source of truth,
/// so a lost message is repaired by the next one or by the sync on startup.
/// </summary>
internal static class ModuleStateExchange
{
    public const string Name = "modules.state";

    public static Task DeclareAsync(IChannel channel, CancellationToken ct) =>
        channel.ExchangeDeclareAsync(Name, ExchangeType.Fanout, durable: true, autoDelete: false, cancellationToken: ct);
}

internal sealed class RabbitMqModuleStateBus(IConnection connection, ILogger<RabbitMqModuleStateBus> log) : IModuleStateBus, IAsyncDisposable
{
    private readonly SemaphoreSlim _lock = new(1, 1); // a channel is not safe for concurrent publishing
    private IChannel? _channel;

    public async Task PublishAsync(ModuleStateChanged change, CancellationToken ct)
    {
        await _lock.WaitAsync(ct);
        try
        {
            if (_channel is not { IsOpen: true })
            {
                _channel = await connection.CreateChannelAsync(cancellationToken: ct);
                await ModuleStateExchange.DeclareAsync(_channel, ct);
            }

            var properties = new BasicProperties
            {
                ContentType = "application/json",
                MessageId = Guid.NewGuid().ToString("n"),
                Type = nameof(ModuleStateChanged)
            };
            await _channel.BasicPublishAsync(ModuleStateExchange.Name, routingKey: string.Empty, mandatory: false,
                properties, JsonSerializer.SerializeToUtf8Bytes(change), ct);
            log.LogInformation("Published {Action} of module {Id}", change.Action, change.ModuleId);
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            // The change is already in the catalog; other replicas pick it up on the next event or restart.
            log.LogWarning(e, "Could not publish {Action} of module {Id}", change.Action, change.ModuleId);
            _channel = null;
        }
        finally { _lock.Release(); }
    }

    public async ValueTask DisposeAsync()
    {
        if (_channel is not null) await _channel.DisposeAsync();
    }
}

/// <summary>Subscribes this replica to "modules.state" and re-syncs it on every change made elsewhere.</summary>
internal sealed class ModuleStateSubscriber(IConnection connection, ModuleRuntime runtime, ILogger<ModuleStateSubscriber> log) : BackgroundService
{
    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        await using var channel = await connection.CreateChannelAsync(cancellationToken: stoppingToken);
        await ModuleStateExchange.DeclareAsync(channel, stoppingToken);
        var queue = await channel.QueueDeclareAsync(queue: string.Empty, durable: false, exclusive: true, autoDelete: true,
            cancellationToken: stoppingToken);
        await channel.QueueBindAsync(queue.QueueName, ModuleStateExchange.Name, routingKey: string.Empty, cancellationToken: stoppingToken);

        var consumer = new AsyncEventingBasicConsumer(channel);
        consumer.ReceivedAsync += async (_, message) =>
        {
            ModuleStateChanged? change;
            try { change = JsonSerializer.Deserialize<ModuleStateChanged>(message.Body.Span); }
            catch (JsonException e) { log.LogWarning(e, "Ignored a malformed module state message"); return; }
            if (change is null || change.Origin == ModuleInstance.Id) return; // already applied here

            log.LogInformation("Module {Id} {Action} by {Origin} ({Pool}); syncing", change.ModuleId, change.Action, change.Origin, change.Pool);
            try { await runtime.SyncAsync(stoppingToken); }
            catch (Exception e) when (e is not OperationCanceledException) { log.LogError(e, "Sync after {Action} of {Id} failed", change.Action, change.ModuleId); }
        };
        await channel.BasicConsumeAsync(queue.QueueName, autoAck: true, consumer, stoppingToken);

        // Catch changes made between the startup sync and this subscription.
        await runtime.SyncAsync(stoppingToken);

        try { await Task.Delay(Timeout.Infinite, stoppingToken); }
        catch (OperationCanceledException) { }
    }
}
