using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using soft.square.net.ModularBlazor.Core.Abstractions;
using soft.square.net.ModularBlazor.Core.Domain;

namespace soft.square.net.ModularBlazor.Infrastructure.Persistence;

/// <summary>
/// Base of every DbContext that holds business data (the Host's AppDbContext and every host module's DbContext).
///
/// Multi-tenancy (Finbuckle resolves the tenant; <see cref="ICurrentTenant"/> is "root" when none was resolved):
///   * Database per tenant is chosen by the DbContext options (see ModuleDbContextRegistration).
///   * On top of that every tenant-scoped entity gets a "TenantId" shadow column, stamped on insert and read back
///     through a global query filter, so rows of different tenants can never mix, even in a shared database
///     (the root tenant and any tenant without its own connection string share the default database).
///     This is the behaviour of Finbuckle's MultiTenantDbContext (TenantMismatchMode.Throw), written against
///     ICurrentTenant so that it also has a tenant ("root") when the request carries none.
///   * Soft-deleted rows (ISoftDeletable) are hidden by the same filter; audit columns are sized.
/// Audit fields and domain events are handled by the registered SaveChanges interceptors.
/// </summary>
public abstract class DbContextTenantBase(DbContextOptions options, ICurrentTenant currentTenant) : DbContext(options)
{
    public const string TenantIdProperty = "TenantId";

    /// <summary>The tenant the context reads and writes for. Read by the query filters on every query.</summary>
    public string CurrentTenantId => currentTenant.Id;

    /// <summary>
    /// False for platform data shared by all tenants (kept in the default database, e.g. the tenant provisioning log):
    /// such entities get no TenantId and no tenant filter.
    /// </summary>
    protected virtual bool IsTenantScoped => true;

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        foreach (var entity in modelBuilder.Model.GetEntityTypes().Where(e => e.BaseType is null && !e.IsOwned()).ToList())
        {
            var clrType = entity.ClrType;
            var builder = modelBuilder.Entity(clrType);

            if (typeof(IAuditableEntity).IsAssignableFrom(clrType))
            {
                builder.Property(nameof(IAuditableEntity.CreatedBy)).HasMaxLength(256);
                builder.Property(nameof(IAuditableEntity.LastModifiedBy)).HasMaxLength(256);
            }

            var softDeletable = typeof(ISoftDeletable).IsAssignableFrom(clrType);
            if (softDeletable)
                builder.Property(nameof(ISoftDeletable.DeletedBy)).HasMaxLength(256);

            if (entity.IsKeyless) continue;

            var parameter = Expression.Parameter(clrType, "entity");
            Expression? filter = null;

            if (IsTenantScoped)
            {
                builder.Property<string>(TenantIdProperty).HasMaxLength(64).IsRequired();
                builder.HasIndex(TenantIdProperty);

                // entity.TenantId == this.CurrentTenantId  (EF evaluates `this` as the context of each query)
                filter = Expression.Equal(
                    Expression.Call(typeof(EF), nameof(EF.Property), [typeof(string)], parameter, Expression.Constant(TenantIdProperty)),
                    Expression.Property(Expression.Constant(this), nameof(CurrentTenantId)));
            }

            if (softDeletable)
            {
                var notDeleted = Expression.Not(Expression.Property(parameter, nameof(ISoftDeletable.IsDeleted)));
                filter = filter is null ? notDeleted : Expression.AndAlso(filter, notDeleted);
            }

            if (filter is not null)
                builder.HasQueryFilter(Expression.Lambda(filter, parameter));
        }
    }

    public override int SaveChanges(bool acceptAllChangesOnSuccess)
    {
        EnforceTenant();
        return base.SaveChanges(acceptAllChangesOnSuccess);
    }

    public override Task<int> SaveChangesAsync(bool acceptAllChangesOnSuccess, CancellationToken cancellationToken = default)
    {
        EnforceTenant();
        return base.SaveChangesAsync(acceptAllChangesOnSuccess, cancellationToken);
    }

    /// <summary>New rows get the current tenant; changing or deleting another tenant's row is refused.</summary>
    private void EnforceTenant()
    {
        if (!IsTenantScoped) return;

        var tenantId = CurrentTenantId;
        foreach (var entry in ChangeTracker.Entries())
        {
            var property = entry.Metadata.FindProperty(TenantIdProperty);
            if (property is null) continue;

            switch (entry.State)
            {
                case EntityState.Added:
                    entry.Property(TenantIdProperty).CurrentValue = tenantId;
                    break;

                case EntityState.Modified or EntityState.Deleted:
                    var owner = entry.Property(TenantIdProperty).CurrentValue as string;
                    if (!string.Equals(owner, tenantId, StringComparison.Ordinal))
                        throw new InvalidOperationException(
                            $"{entry.Metadata.ClrType.Name} belongs to tenant '{owner}', not to the current tenant '{tenantId}'.");
                    break;
            }
        }
    }
}
