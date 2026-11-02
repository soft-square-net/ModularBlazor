using Ardalis.Specification.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore;
using Microsoft.Extensions.DependencyInjection;
using soft.square.net.ModularBlazor.Core.Domain;
using soft.square.net.ModularBlazor.Core.Persistence;

namespace soft.square.net.ModularBlazor.Infrastructure.Persistence;

/// <summary>Ardalis.Specification repository over a module's DbContext.</summary>
public sealed class EfRepository<TContext, T>(TContext dbContext)
    : RepositoryBase<T>(dbContext), IRepository<T>, IReadRepository<T>
    where TContext : DbContext
    where T : class, IAggregateRoot;

public static class RepositoryRegistration
{
    /// <summary>Registers IRepository&lt;T&gt; and IReadRepository&lt;T&gt; for an aggregate stored in <typeparamref name="TContext"/>.</summary>
    public static IServiceCollection AddModuleRepository<TContext, T>(this IServiceCollection services)
        where TContext : DbContext
        where T : class, IAggregateRoot
    {
        services.AddScoped<IRepository<T>, EfRepository<TContext, T>>();
        services.AddScoped<IReadRepository<T>, EfRepository<TContext, T>>();
        return services;
    }
}
