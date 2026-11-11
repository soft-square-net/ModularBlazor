using Ardalis.Specification.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using soft.square.net.WebApi.SharedKernel;

namespace soft.square.net.WebApi.Data;

/// <summary>
/// The default <see cref="IRepository{T}"/> / <see cref="IReadRepository{T}"/>: Ardalis.Specification over the module's
/// DbContext (registered as <see cref="DbContext"/> by <see cref="TenantDbServiceCollectionExtensions.AddTenantDbContext{TContext}"/>),
/// so it reads and writes the current tenant's database.
/// </summary>
public sealed class EfRepository<T>(DbContext dbContext) : RepositoryBase<T>(dbContext), IRepository<T>, IReadRepository<T>
    where T : class, IAggregateRoot;

/// <summary>A repository bound to one specific DbContext, for a module with more than one (see <see cref="TenantDbServiceCollectionExtensions.AddTenantRepository{TContext,T}"/>).</summary>
public sealed class EfRepository<TContext, T>(TContext dbContext) : RepositoryBase<T>(dbContext), IRepository<T>, IReadRepository<T>
    where TContext : DbContext
    where T : class, IAggregateRoot;

public static partial class TenantDbServiceCollectionExtensions
{
    /// <summary>
    /// Binds <see cref="IRepository{T}"/> and <see cref="IReadRepository{T}"/> of one aggregate to <typeparamref name="TContext"/>.
    /// Only needed when a module has several DbContexts; the first <c>AddTenantDbContext</c> is the default for all aggregates.
    /// </summary>
    public static IServiceCollection AddTenantRepository<TContext, T>(this IServiceCollection services)
        where TContext : TenantDbContext
        where T : class, IAggregateRoot
    {
        services.AddScoped<IRepository<T>, EfRepository<TContext, T>>();
        services.AddScoped<IReadRepository<T>, EfRepository<TContext, T>>();
        return services;
    }
}
