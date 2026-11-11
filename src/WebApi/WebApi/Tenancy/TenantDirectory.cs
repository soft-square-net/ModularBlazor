using soft.square.net.WebApi.Contracts.Tenancy;
using soft.square.net.WebApi.Data;

namespace soft.square.net.WebApi.Tenancy;

/// <summary>Scoped: the tenant of the current request or tenant scope. Set once, by the middleware or a tenant scope.</summary>
internal sealed class TenantContext : ITenantContext, ITenantScopeInitializer
{
    public TenantInfo? Tenant { get; private set; }
    public string? ResolvedBy { get; private set; }

    public void Use(TenantInfo tenant, string resolvedBy)
    {
        if (Tenant is not null && !string.Equals(Tenant.Id, tenant.Id, StringComparison.OrdinalIgnoreCase))
            throw new InvalidOperationException($"This scope already belongs to tenant '{Tenant.Id}'.");
        Tenant = tenant;
        ResolvedBy = resolvedBy;
    }
}

/// <summary>
/// Every replica's view of the tenant store, held in memory. Reloaded on startup, on a timer, and whenever any replica
/// reports a change over the broker ("tenants.changed"). Without a tenant store (a single local instance) the tenants
/// come from the host configuration section Tenancy:Tenants.
/// </summary>
internal sealed class TenantDirectory(IServiceScopeFactory scopes, IConfiguration configuration, ITenantChangeBus bus, ILogger<TenantDirectory> log)
    : ITenantDirectory
{
    private readonly TaskCompletionSource _ready = new(TaskCreationOptions.RunContinuationsAsynchronously);
    private readonly SemaphoreSlim _reload = new(1, 1);
    private Snapshot _snapshot = Snapshot.Empty;

    /// <summary>Raised (outside any lock) for each tenant that was added or changed by a reload.</summary>
    public event Action<TenantInfo>? Changed;

    /// <summary>Completes after the first successful load.</summary>
    public Task Ready => _ready.Task;

    public bool HasStore => !string.IsNullOrWhiteSpace(configuration.GetConnectionString(TenancyHostExtensions.StoreConnectionName));

    public IReadOnlyCollection<TenantInfo> All => _snapshot.ById.Values;

    public TenantInfo? Find(string id) => _snapshot.ById.GetValueOrDefault(id);

    public TenantInfo? FindByHost(string host) => _snapshot.ByHost.GetValueOrDefault(host);

    public async Task NotifyChangedAsync(string tenantId, CancellationToken ct)
    {
        await ReloadAsync(ct);
        await bus.PublishAsync(tenantId, ct);
    }

    public async Task ReloadAsync(CancellationToken ct)
    {
        IReadOnlyList<TenantInfo> changed;
        await _reload.WaitAsync(ct);
        try
        {
            var tenants = await LoadAsync(ct);
            var previous = _snapshot;
            _snapshot = new Snapshot(tenants);
            changed = tenants.Where(t => !previous.ById.TryGetValue(t.Id, out var old) || !Same(old, t)).ToArray();
            if (changed.Count > 0 || !_ready.Task.IsCompleted)
                log.LogInformation("Tenant directory loaded: {Count} tenants ({Changed} changed)", tenants.Count, changed.Count);
            _ready.TrySetResult();
        }
        finally { _reload.Release(); }

        foreach (var tenant in changed)
        {
            try { Changed?.Invoke(tenant); }
            catch (Exception e) { log.LogError(e, "A tenant change handler failed for {Tenant}", tenant.Id); }
        }
    }

    private async Task<IReadOnlyList<TenantInfo>> LoadAsync(CancellationToken ct)
    {
        if (!HasStore)
        {
            return configuration.GetSection("Tenancy:Tenants").GetChildren()
                .Select(t => new TenantInfo(
                    t["Id"] ?? "", t["Name"] ?? t["Id"] ?? "",
                    Enum.TryParse<TenantStatus>(t["Status"], true, out var status) ? status : TenantStatus.Active,
                    t.GetSection("Hosts").GetChildren().Select(h => h.Value ?? "").Where(h => h.Length > 0).ToArray(),
                    t["DatabaseServer"] ?? "", t["DatabaseName"] ?? ""))
                .Where(t => t.Id.Length > 0)
                .ToArray();
        }

        await using var scope = scopes.CreateAsyncScope();
        return await scope.ServiceProvider.GetRequiredService<TenantRegistry>().ListAsync(ct);
    }

    private static bool Same(TenantInfo a, TenantInfo b) =>
        a with { Hosts = [] } == b with { Hosts = [] } && a.Hosts.SequenceEqual(b.Hosts, StringComparer.OrdinalIgnoreCase);

    private sealed class Snapshot
    {
        public static readonly Snapshot Empty = new([]);

        public Snapshot(IReadOnlyList<TenantInfo> tenants)
        {
            ById = tenants.ToDictionary(t => t.Id, StringComparer.OrdinalIgnoreCase);
            ByHost = new Dictionary<string, TenantInfo>(StringComparer.OrdinalIgnoreCase);
            foreach (var tenant in tenants)
            foreach (var host in tenant.Hosts)
                ByHost.TryAdd(host, tenant);
        }

        public Dictionary<string, TenantInfo> ById { get; }
        public Dictionary<string, TenantInfo> ByHost { get; }
    }
}

/// <summary>
/// Startup: migrates the tenant store's schema (host-owned; once at a time across replicas behind an advisory lock),
/// loads the directory, then refreshes it periodically as a safety net for lost broker messages.
/// </summary>
internal sealed class TenantDirectoryService(TenantDirectory directory, IServiceScopeFactory scopes, IConfiguration configuration,
    ILogger<TenantDirectoryService> log) : BackgroundService
{
    private static readonly TimeSpan Refresh = TimeSpan.FromMinutes(5);
    private static readonly TimeSpan Retry = TimeSpan.FromSeconds(10);

    public override async Task StartAsync(CancellationToken cancellationToken)
    {
        // First attempt before the module reconciler starts, so core modules see the tenants right away.
        await TryLoadAsync(cancellationToken);
        await base.StartAsync(cancellationToken);
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        while (!stoppingToken.IsCancellationRequested)
        {
            try { await Task.Delay(directory.Ready.IsCompleted ? Refresh : Retry, stoppingToken); }
            catch (OperationCanceledException) { return; }
            await TryLoadAsync(stoppingToken);
        }
    }

    private bool _migrated;

    private async Task TryLoadAsync(CancellationToken ct)
    {
        try
        {
            if (directory.HasStore && !_migrated)
            {
                var connection = configuration.GetConnectionString(TenancyHostExtensions.StoreConnectionName)!;
                await using (await AdvisoryLock.AcquireAsync(connection, "platform:tenant-store:migrate", ct))
                {
                    await using var scope = scopes.CreateAsyncScope();
                    var db = scope.ServiceProvider.GetRequiredService<TenantStoreDbContext>();
                    await Microsoft.EntityFrameworkCore.RelationalDatabaseFacadeExtensions.MigrateAsync(db.Database, ct);
                }
                _migrated = true;
            }
            await directory.ReloadAsync(ct);
        }
        catch (Exception e) when (e is not OperationCanceledException)
        {
            log.LogError(e, "Could not load the tenant directory; retrying");
        }
    }
}
