using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Migrations;
using soft.square.net.WebApi.Contracts.Tenancy;

namespace soft.square.net.WebApi.Data;

/// <summary>
/// A row that belongs to one tenant. <see cref="TenantDbContext"/> stamps it on insert, refuses to save it for another
/// tenant and filters every query by it. With a database per tenant this is defence in depth; it also keeps the model
/// ready for tenants pooled in a shared database.
/// </summary>
public interface ITenantOwned
{
    string TenantId { get; set; }
}

/// <summary>
/// Base class for a runtime module's DbContext (register it with <see cref="TenantDbServiceCollectionExtensions.AddTenantDbContext{TContext}"/>).
/// <list type="bullet">
/// <item>Database per tenant: the connection is the current tenant's database (from the tenant store).</item>
/// <item>One schema per module inside that database (<see cref="Schema"/>), with its own migrations history table, so
/// modules never collide and a module's tables can be dropped with its schema.</item>
/// <item>Entities implementing <see cref="ITenantOwned"/> are stamped and filtered by the tenant.</item>
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

    protected override void OnConfiguring(DbContextOptionsBuilder optionsBuilder)
    {
        // Keeps the connection configured by AddTenantDbContext; only moves the history table into the module's schema.
        optionsBuilder.UseNpgsql(npgsql => npgsql.MigrationsHistoryTable(HistoryRepository.DefaultTableName, Schema));
    }

    protected sealed override void OnModelCreating(ModelBuilder modelBuilder)
    {
        modelBuilder.HasDefaultSchema(Schema);
        ConfigureModel(modelBuilder);

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

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        StampTenant();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
    {
        StampTenant();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
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
