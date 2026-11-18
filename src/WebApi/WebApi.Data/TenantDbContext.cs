using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
using soft.square.net.WebApi.Contracts.Tenancy;
using soft.square.net.WebApi.SharedKernel;

namespace soft.square.net.WebApi.Data;

/// <summary>
/// Base class for a runtime module's DbContext (register it with <see cref="TenantDbServiceCollectionExtensions.AddTenantDbContext{TContext}"/>).
/// <list type="bullet">
/// <item>Database per tenant: the connection is the current tenant's database (from the tenant store).</item>
/// <item>The module's tables kept apart inside that database (<see cref="Schema"/>), with its own migrations history
/// table: a schema on PostgreSQL and SQL Server, a table-name prefix on MySQL and Oracle (see <see cref="ModuleIsolation"/>).</item>
/// <item>Any of the four engines: the tenant's server decides (<see cref="TenantDatabases"/>). The module ships one
/// migration set per engine it supports (<see cref="ProviderMigrationsAssembly"/>).</item>
/// <item>Entities implementing <see cref="ITenantOwned"/> are stamped and filtered by the tenant.</item>
/// <item>Domain events raised by tracked aggregates (<see cref="IHasDomainEvents"/>) go to their
/// <see cref="IDomainEventHandler{TEvent}"/>s inside SaveChangesAsync, before the write, so the handlers' changes are
/// saved with it. Synchronous SaveChanges refuses pending events.</item>
/// </list>
/// Derived contexts configure their model in <see cref="ConfigureModel"/>.
/// </summary>
public abstract class TenantDbContext : DbContext
{
    private readonly ITenantContext _tenant;

    protected TenantDbContext(DbContextOptions options, ITenantContext tenant) : base(options)
    {
        _tenant = tenant;
    }

    /// <summary>The module's schema in every tenant database (lowercase, usually the module id).</summary>
    protected abstract string Schema { get; }

    /// <summary>The tenant this context works for; null outside a tenant scope (queries on tenant-owned rows then return nothing).</summary>
    public string? CurrentTenantId => _tenant.Tenant?.Id;

    protected abstract void ConfigureModel(ModelBuilder modelBuilder);

    protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder) =>
        ModuleIsolation.ConfigureHistoryTable(optionsBuilder, Schema);

    protected sealed override void OnModelCreating(ModelBuilder modelBuilder)
    {
        var schemas = ModuleIsolation.UsesSchemas(Database.ProviderName);
        if (schemas) modelBuilder.HasDefaultSchema(Schema);
        ConfigureModel(modelBuilder);
        if (!schemas) ModuleIsolation.PrefixTables(modelBuilder, Schema);
        if (DatabaseProviderAdapter.ForEfProvider(Database.ProviderName)?.Provider == DatabaseProvider.MySql) StoreDateTimeOffsetAsUtc(modelBuilder);

        foreach (var entity in modelBuilder.Model.GetEntityTypes().Where(e => e.BaseType is null && typeof(ITenantOwned).IsAssignableFrom(e.ClrType)).ToArray())
        {
            var builder = modelBuilder.Entity(entity.ClrType);
            builder.Property(nameof(ITenantOwned.TenantId)).HasMaxLength(64).IsRequired();
            builder.HasIndex(nameof(ITenantOwned.TenantId));

            // e => e.TenantId == this.CurrentTenantId; EF parameterizes the context property per query.
            var row = Expression.Parameter(entity.ClrType, "e");
            var filter = Expression.Lambda(
                Expression.Equal(
                    Expression.Property(row, nameof(ITenantOwned.TenantId)),
                    Expression.Property(Expression.Constant(this), nameof(CurrentTenantId))),
                row);
            builder.HasQueryFilter(filter);
        }
    }

    /// <summary>MySQL has no offset-aware type: every DateTimeOffset column of the module is stored as UTC.</summary>
    private static void StoreDateTimeOffsetAsUtc(ModelBuilder modelBuilder)
    {
        var plain = new Microsoft.EntityFrameworkCore.Storage.ValueConversion.ValueConverter<DateTimeOffset, DateTime>(
            v => v.UtcDateTime, v => new DateTimeOffset(DateTime.SpecifyKind(v, DateTimeKind.Utc)));
        var nullable = new Microsoft.EntityFrameworkCore.Storage.ValueConversion.ValueConverter<DateTimeOffset?, DateTime?>(
            v => v.HasValue ? v.Value.UtcDateTime : null, v => v.HasValue ? new DateTimeOffset(DateTime.SpecifyKind(v.Value, DateTimeKind.Utc)) : null);
        foreach (var property in modelBuilder.Model.GetEntityTypes().SelectMany(e => e.GetProperties()))
        {
            if (property.ClrType == typeof(DateTimeOffset)) property.SetValueConverter(plain);
            else if (property.ClrType == typeof(DateTimeOffset?)) property.SetValueConverter(nullable);
        }
    }

    /// <summary>Rounds of handlers a save runs before it gives up on handlers that keep raising events.</summary>
    private const int MaxDomainEventRounds = 8;
    private bool _dispatchingDomainEvents;

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        ThrowIfSavingFromHandler();
        if (HasPendingDomainEvents())
            throw new InvalidOperationException("Aggregates raised domain events; save with SaveChangesAsync so their handlers run.");
        StampTenant();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    /// <summary>
    /// Runs the handlers of the domain events raised by tracked aggregates (repeating while they raise more), then
    /// stamps the tenant and writes everything in one save.
    /// </summary>
    public override async Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
    {
        ThrowIfSavingFromHandler();
        await DispatchDomainEventsAsync(cancellationToken).ConfigureAwait(false);
        StampTenant();
        return await base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken).ConfigureAwait(false);
    }

    private void ThrowIfSavingFromHandler()
    {
        if (_dispatchingDomainEvents)
            throw new InvalidOperationException(
                "A domain event handler must not save (nor call IRepository Add/Update/Delete, which save at once): the save that raised the event writes its changes.");
    }

    private bool HasPendingDomainEvents() =>
        ChangeTracker.Entries<IHasDomainEvents>().Any(e => e.Entity.HasDomainEvents);

    private async Task DispatchDomainEventsAsync(CancellationToken cancellationToken)
    {
        if (!HasPendingDomainEvents()) return;
        var dispatcher = ResolveDispatcher();
        _dispatchingDomainEvents = true;
        try
        {
            for (var round = 0; ; round++)
            {
                // Materialize before handlers run: they may track more entities.
                var owners = ChangeTracker.Entries<IHasDomainEvents>().Select(e => e.Entity).Where(e => e.HasDomainEvents).ToList();
                if (owners.Count == 0) return;
                if (round == MaxDomainEventRounds)
                    throw new InvalidOperationException(
                        $"Domain events were still being raised after {MaxDomainEventRounds} rounds; check for handlers that trigger each other.");
                foreach (var domainEvent in owners.SelectMany(o => o.TakeDomainEvents()).ToList())
                    await dispatcher.DispatchAsync(domainEvent, cancellationToken).ConfigureAwait(false);
            }
        }
        finally
        {
            _dispatchingDomainEvents = false;
        }
    }

    /// <summary>
    /// The dispatcher of the scope that created this context. AddDbContext records that scope as EF's application
    /// service provider; the module's own internal provider (UseInternalServiceProvider) does not know it.
    /// </summary>
    private DomainEventDispatcher ResolveDispatcher()
    {
        var scope = this.GetService<IDbContextOptions>().FindExtension<CoreOptionsExtension>()?.ApplicationServiceProvider;
        return scope?.GetService(typeof(DomainEventDispatcher)) as DomainEventDispatcher
            ?? throw new InvalidOperationException(
                $"Aggregates raised domain events, but {GetType().Name} was not created by AddTenantDbContext, so their handlers cannot run.");
    }

    private void StampTenant()
    {
        foreach (var entry in ChangeTracker.Entries<ITenantOwned>())
        {
            if (entry.State is not (EntityState.Added or EntityState.Modified or EntityState.Deleted)) continue;
            var tenant = CurrentTenantId ?? throw new InvalidOperationException("Tenant-owned rows can only be saved in a tenant scope.");
            if (entry.State == EntityState.Added && string.IsNullOrEmpty(entry.Entity.TenantId))
                entry.Entity.TenantId = tenant;
            else if (!string.Equals(entry.Entity.TenantId, tenant, StringComparison.Ordinal))
                throw new InvalidOperationException($"A {entry.Metadata.ClrType.Name} of tenant '{entry.Entity.TenantId}' cannot be saved for tenant '{tenant}'.");
        }
    }
}
