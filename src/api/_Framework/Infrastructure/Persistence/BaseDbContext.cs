using System.Linq.Expressions;
using Microsoft.EntityFrameworkCore;
using soft.square.net.ModularBlazor.Core.Domain;

namespace soft.square.net.ModularBlazor.Infrastructure.Persistence;

/// <summary>
/// Base of every DbContext that holds business data. Applies the persistence conventions:
/// soft-deleted rows are hidden by a global query filter, audit/soft-delete columns are sized, and
/// (through the registered interceptors) audit fields and domain events are handled on save.
/// Subclasses must call base.OnModelCreating after configuring their entities.
/// </summary>
public abstract class BaseDbContext(DbContextOptions options) : DbContext(options)
{
    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        foreach (var entity in modelBuilder.Model.GetEntityTypes().Where(e => e.BaseType is null).ToList())
        {
            if (typeof(IAuditableEntity).IsAssignableFrom(entity.ClrType))
            {
                var builder = modelBuilder.Entity(entity.ClrType);
                builder.Property(nameof(IAuditableEntity.CreatedBy)).HasMaxLength(256);
                builder.Property(nameof(IAuditableEntity.LastModifiedBy)).HasMaxLength(256);
            }

            if (typeof(ISoftDeletable).IsAssignableFrom(entity.ClrType))
                modelBuilder.Entity(entity.ClrType).Property(nameof(ISoftDeletable.DeletedBy)).HasMaxLength(256);
        }

        modelBuilder.AppendGlobalQueryFilter<ISoftDeletable>(e => !e.IsDeleted);
    }
}

public static class ModelBuilderExtensions
{
    /// <summary>Adds a query filter written against an interface to every entity type that implements it.</summary>
    public static ModelBuilder AppendGlobalQueryFilter<TInterface>(this ModelBuilder modelBuilder,
        Expression<Func<TInterface, bool>> filter)
    {
        var clrTypes = modelBuilder.Model.GetEntityTypes()
            .Where(e => e.BaseType is null && typeof(TInterface).IsAssignableFrom(e.ClrType))
            .Select(e => e.ClrType)
            .ToList();

        foreach (var clrType in clrTypes)
        {
            var parameter = Expression.Parameter(clrType, "entity");
            var body = new ParameterReplacer(filter.Parameters[0], parameter).Visit(filter.Body);
            modelBuilder.Entity(clrType).HasQueryFilter(Expression.Lambda(body, parameter));
        }

        return modelBuilder;
    }

    private sealed class ParameterReplacer(ParameterExpression from, Expression to) : ExpressionVisitor
    {
        protected override Expression VisitParameter(ParameterExpression node) => node == from ? to : base.VisitParameter(node);
    }
}
